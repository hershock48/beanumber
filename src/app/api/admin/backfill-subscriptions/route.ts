import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/backfill-subscriptions
 *
 * Finds all donation records with "+monthly" in the note that are missing
 * Sponsorship and/or Subscription records, then creates them.
 *
 * Root cause: cart checkout used mode:'payment' without customer_creation:'always',
 * so Stripe never created a customer. The webhook silently skipped subscription
 * creation because stripeCustomerId was null.
 *
 * This endpoint:
 * 1. Scans Donations for notes containing "+monthly"
 * 2. For each, checks if the donor has a Stripe Customer ID
 * 3. If not, looks up the checkout session in Stripe to find the customer
 * 4. If Stripe has no customer for the session, creates one from the saved payment method
 * 5. Creates a Stripe subscription for the customer
 * 6. Creates Sponsorship and Subscription records in Airtable
 *
 * Protected by CRON_SECRET header check (same as other admin endpoints).
 */

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

function getAirtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not set');
  return new StripeModule(secretKey, { apiVersion: '2025-12-15.clover' });
}

function generateSponsorCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900) + 100;
  return `BAN-${year}-${rand}`;
}

interface BackfillResult {
  donorName: string;
  email: string;
  donationId: string;
  shirtNumber: string | null;
  childName: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  sponsorshipCreated: boolean;
  subscriptionCreated: boolean;
  error: string | null;
}

export async function GET(request: NextRequest) {
  // Auth: accept query param ?token=, X-Admin-Token header, or Bearer token.
  // Checks against ADMIN_API_TOKEN, ADMIN_PASSWORD, or CRON_SECRET.
  const token =
    request.nextUrl.searchParams.get('token') ||
    request.headers.get('X-Admin-Token') ||
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    null;
  const validTokens = [
    process.env.ADMIN_API_TOKEN,
    process.env.ADMIN_PASSWORD,
    process.env.CRON_SECRET,
  ].filter(Boolean);
  if (validTokens.length > 0 && (!token || !validTokens.includes(token))) {
    return NextResponse.json({ error: 'Unauthorized. Pass ?token=YOUR_ADMIN_TOKEN in the URL.' }, { status: 401 });
  }

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Airtable not configured' }, { status: 500 });
  }

  const dryRun = request.nextUrl.searchParams.get('dry') === '1';
  const results: BackfillResult[] = [];

  try {
    const stripe = await getStripe();

    // Step 1: Find all donations with "+monthly" in the note
    const formula = `FIND("+monthly", {Donation Note})`;
    const donationsRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Donations?filterByFormula=${encodeURIComponent(formula)}&fields%5B%5D=Donation%20Note&fields%5B%5D=Stripe%20Checkout%20Session%20ID&fields%5B%5D=Stripe%20Payment%20Intent%20ID&fields%5B%5D=Donor&fields%5B%5D=Donor%20Email%20at%20Donation&fields%5B%5D=Stripe%20Customer%20ID`,
      { headers: getAirtableHeaders() }
    );
    if (!donationsRes.ok) {
      return NextResponse.json({ error: 'Failed to query donations', detail: await donationsRes.text() }, { status: 500 });
    }
    const donationsData = await donationsRes.json();
    const donations = donationsData.records || [];

    console.log(`[Backfill] Found ${donations.length} donations with +monthly`);

    for (const donation of donations) {
      const fields = donation.fields || {};
      const note = fields['Donation Note'] || '';
      const sessionId = fields['Stripe Checkout Session ID'] || '';
      const email = fields['Donor Email at Donation'] || '';
      const donorLinks = fields.Donor || [];
      const donorRecordId = donorLinks[0]?.id || donorLinks[0] || '';

      // Parse which items are +monthly from the note
      // Format: "ShirtName / Color / Size → #N (ChildName) +monthly"
      const monthlyLines = note.split('\n').filter((l: string) => l.includes('+monthly'));

      if (monthlyLines.length === 0) continue;

      // Get donor info
      let donorName = '';
      let donorStripeId = '';
      if (donorRecordId) {
        const donorRes = await fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Donors/${donorRecordId}?fields%5B%5D=Donor%20Name&fields%5B%5D=Stripe%20Customer%20ID&fields%5B%5D=Email%20Address`,
          { headers: getAirtableHeaders() }
        );
        if (donorRes.ok) {
          const donorData = await donorRes.json();
          donorName = donorData.fields?.['Donor Name'] || '';
          donorStripeId = donorData.fields?.['Stripe Customer ID'] || '';
        }
      }

      for (const line of monthlyLines) {
        // Parse: "ShirtName / Color / Size → #N (ChildName) +monthly"
        const shirtMatch = line.match(/→ #(\d+) \(([^)]+)\)/);
        const shirtNumber = shirtMatch?.[1] || null;
        const childName = shirtMatch?.[2] || null;

        const result: BackfillResult = {
          donorName,
          email,
          donationId: donation.id,
          shirtNumber,
          childName,
          stripeCustomerId: donorStripeId || null,
          stripeSubscriptionId: null,
          sponsorshipCreated: false,
          subscriptionCreated: false,
          error: null,
        };

        try {
          // Check if sponsorship already exists for this child+donor
          if (shirtNumber) {
            const spFormula = `AND({SponsorEmail} = "${email}", {ChildDisplayName} = "${childName}")`;
            const spRes = await fetch(
              `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sponsorships?filterByFormula=${encodeURIComponent(spFormula)}&maxRecords=1`,
              { headers: getAirtableHeaders() }
            );
            if (spRes.ok) {
              const spData = await spRes.json();
              if (spData.records?.length > 0) {
                result.sponsorshipCreated = false;
                result.stripeSubscriptionId = spData.records[0].fields?.StripeSubscriptionID || null;
                // Sponsorship exists, check if subscription exists in Stripe
                if (result.stripeSubscriptionId) {
                  results.push(result);
                  continue; // Already fully backfilled
                }
              }
            }
          }

          // Get or create Stripe customer
          let customerId = donorStripeId;

          if (!customerId && sessionId) {
            // Look up the checkout session to find/create customer
            try {
              const session = await stripe.checkout.sessions.retrieve(sessionId);
              if (session.customer) {
                customerId = typeof session.customer === 'string'
                  ? session.customer
                  : session.customer.id;
              }
            } catch (e: any) {
              console.log('[Backfill] Could not retrieve session:', sessionId, e.message);
            }
          }

          if (!customerId) {
            // Create a new Stripe customer from the payment intent's payment method
            const piId = fields['Stripe Payment Intent ID'] || '';
            if (piId) {
              try {
                const pi = await stripe.paymentIntents.retrieve(piId);
                const pmId = typeof pi.payment_method === 'string'
                  ? pi.payment_method
                  : pi.payment_method?.id;

                if (pmId) {
                  const customer = await stripe.customers.create({
                    email,
                    name: donorName,
                    payment_method: pmId,
                    invoice_settings: { default_payment_method: pmId },
                    metadata: { backfilled: 'true', original_pi: piId },
                  });
                  customerId = customer.id;
                  console.log('[Backfill] Created Stripe customer:', customerId, 'for', email);

                  // Attach payment method to customer
                  await stripe.paymentMethods.attach(pmId, { customer: customerId });
                }
              } catch (e: any) {
                console.error('[Backfill] Failed to create customer from PI:', piId, e.message);
              }
            }
          }

          if (!customerId) {
            result.error = 'Could not find or create Stripe customer';
            results.push(result);
            continue;
          }

          result.stripeCustomerId = customerId;

          // Update donor record with Stripe Customer ID if missing
          if (!donorStripeId && donorRecordId && !dryRun) {
            await fetch(
              `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Donors/${donorRecordId}`,
              {
                method: 'PATCH',
                headers: getAirtableHeaders(),
                body: JSON.stringify({ fields: { 'Stripe Customer ID': customerId } }),
              }
            );
            donorStripeId = customerId;
          }

          // Check if subscription already exists in Stripe for this customer
          const existingSubs = await stripe.subscriptions.list({
            customer: customerId,
            status: 'all',
            limit: 10,
          });

          let subId = '';
          const existingSub = existingSubs.data.find(s =>
            s.metadata?.child_display_name === childName ||
            s.metadata?.referring_cart_session_id === sessionId
          );

          if (existingSub) {
            subId = existingSub.id;
            console.log('[Backfill] Found existing subscription:', subId);
          } else if (!dryRun) {
            // Find a saved payment method on the customer. The cart
            // checkout enables both 'card' and 'link' (Stripe Link
            // wallet), so the saved PM type may be either. We also fall
            // back to the original PaymentIntent's payment_method if
            // the customer has nothing attached directly (sometimes
            // setup_future_usage saves the PM but doesn't attach it
            // to the customer until first use).
            let pmId: string | null = null;

            // Try every payment method type the cart checkout supports.
            for (const pmType of ['card', 'link'] as const) {
              const list = await stripe.paymentMethods.list({
                customer: customerId,
                type: pmType,
              });
              if (list.data[0]) {
                pmId = list.data[0].id;
                console.log('[Backfill] Found PM on customer:', pmId, 'type=' + pmType);
                break;
              }
            }

            // Fallback: pull the PM from the original PaymentIntent.
            if (!pmId) {
              const piId = fields['Stripe Payment Intent ID'] || '';
              if (piId) {
                try {
                  const pi = await stripe.paymentIntents.retrieve(piId);
                  const piPm = typeof pi.payment_method === 'string'
                    ? pi.payment_method
                    : pi.payment_method?.id;
                  if (piPm) {
                    pmId = piPm;
                    console.log('[Backfill] Found PM on PI fallback:', pmId);
                    // Attach to the customer so the subscription can use it.
                    try {
                      await stripe.paymentMethods.attach(pmId, { customer: customerId });
                    } catch (attachErr: any) {
                      // Already attached → fine. Anything else, surface.
                      if (!String(attachErr?.message || '').includes('already')) {
                        console.warn('[Backfill] PM attach warn:', attachErr?.message);
                      }
                    }
                  }
                } catch (e: any) {
                  console.log('[Backfill] PI retrieve fallback failed:', piId, e.message);
                }
              }
            }

            if (!pmId) {
              result.error = 'No payment method on file for customer ' + customerId;
              results.push(result);
              continue;
            }

            const billingAnchor = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
            const sub = await stripe.subscriptions.create({
              customer: customerId,
              items: [{
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: 'Be A Number monthly sponsorship',
                  },
                  unit_amount: 2500,
                  recurring: { interval: 'month' },
                } as any,
              }],
              default_payment_method: pmId,
              billing_cycle_anchor: billingAnchor,
              proration_behavior: 'none',
              metadata: {
                order_type: 'cart_monthly',
                child_display_name: childName || '',
                shirt_number: shirtNumber || '',
                backfilled: 'true',
                referring_cart_session_id: sessionId,
              },
            });
            subId = sub.id;
            console.log('[Backfill] Created subscription:', subId, 'for', email, childName);
          }

          result.stripeSubscriptionId = subId || null;
          result.subscriptionCreated = !!subId;

          // Per core_model.md §0: NO MATCHING. If we just created a
          // Stripe sub and there's already a Sponsorship row for this
          // donor that doesn't yet have a sub ID, link them. This
          // catches the stockpile case (shirt purchased, sponsorship
          // exists in Airtable from prior manual fix, sub now exists in
          // Stripe — they need to be glued together).
          if (subId && !dryRun) {
            try {
              const linkFormula = `AND(LOWER({SponsorEmail})="${email.toLowerCase()}",{StripeSubscriptionID}="")`;
              const linkRes = await fetch(
                `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sponsorships?filterByFormula=${encodeURIComponent(linkFormula)}&maxRecords=1`,
                { headers: getAirtableHeaders() }
              );
              if (linkRes.ok) {
                const linkData = await linkRes.json();
                const candidate = linkData.records?.[0];
                if (candidate?.id) {
                  await fetch(
                    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sponsorships/${candidate.id}`,
                    {
                      method: 'PATCH',
                      headers: getAirtableHeaders(),
                      body: JSON.stringify({
                        fields: { StripeSubscriptionID: subId },
                      }),
                    }
                  );
                  console.log('[Backfill] Linked sub', subId, '→ existing Sponsorship', candidate.id);
                }
              }
            } catch (linkErr: any) {
              console.warn('[Backfill] Failed to link sub to existing Sponsorship:', linkErr?.message);
            }
          }

          // Find child record by shirt number
          let childRecordId = '';
          let childId = '';
          if (shirtNumber) {
            const childFormula = `{ShirtNumber} = ${shirtNumber}`;
            const childRes = await fetch(
              `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Children?filterByFormula=${encodeURIComponent(childFormula)}&maxRecords=1`,
              { headers: getAirtableHeaders() }
            );
            if (childRes.ok) {
              const childData = await childRes.json();
              const childRec = childData.records?.[0];
              if (childRec) {
                childRecordId = childRec.id;
                childId = childRec.fields?.ChildID || '';
              }
            }
          }

          // Create Sponsorship record if missing
          if (childRecordId && !dryRun) {
            // Double-check it doesn't exist
            const spCheck = `AND({SponsorEmail} = "${email}", {Children} = "${childRecordId}")`;
            const spCheckRes = await fetch(
              `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sponsorships?filterByFormula=${encodeURIComponent(spCheck)}&maxRecords=1`,
              { headers: getAirtableHeaders() }
            );
            let sponsorshipExists = false;
            if (spCheckRes.ok) {
              const spCheckData = await spCheckRes.json();
              sponsorshipExists = (spCheckData.records?.length || 0) > 0;
            }

            if (!sponsorshipExists) {
              const sponsorCode = generateSponsorCode();
              const today = new Date().toISOString().split('T')[0];
              const spFields: Record<string, unknown> = {
                SponsorCode: sponsorCode,
                SponsorEmail: email,
                ChildID: childId,
                ChildDisplayName: childName || '',
                AuthStatus: 'Active',
                Status: 'Active',
                VisibleToSponsor: true,
                SponsorshipStartDate: today,
                Children: [childRecordId],
                Donor: [donorRecordId],
                MonthlyAmount: 25,
                SponsorName: donorName,
              };
              if (subId) spFields.StripeSubscriptionID = subId;

              const spCreateRes = await fetch(
                `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sponsorships`,
                {
                  method: 'POST',
                  headers: getAirtableHeaders(),
                  body: JSON.stringify({ fields: spFields }),
                }
              );

              if (spCreateRes.ok) {
                result.sponsorshipCreated = true;
                console.log('[Backfill] Created sponsorship for', email, childName);
              } else {
                const errText = await spCreateRes.text();
                result.error = 'Sponsorship create failed: ' + errText.slice(0, 200);
                console.error('[Backfill] Sponsorship create failed:', errText);
              }
            }
          }

          // Create Subscription record in Airtable if missing
          if (subId && !dryRun) {
            const subFormula = `{Subscription ID} = "${subId}"`;
            const subCheckRes = await fetch(
              `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Subscriptions?filterByFormula=${encodeURIComponent(subFormula)}&maxRecords=1`,
              { headers: getAirtableHeaders() }
            );
            let subExists = false;
            if (subCheckRes.ok) {
              const subCheckData = await subCheckRes.json();
              subExists = (subCheckData.records?.length || 0) > 0;
            }

            if (!subExists) {
              const subFields: Record<string, unknown> = {
                'Subscription ID': subId,
                Status: 'active',
                Amount: 25,
                Frequency: 'Monthly',
                'Start Date': new Date().toISOString().split('T')[0],
              };
              if (donorRecordId) subFields.Donor = [donorRecordId];

              await fetch(
                `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Subscriptions`,
                {
                  method: 'POST',
                  headers: getAirtableHeaders(),
                  body: JSON.stringify({ fields: subFields }),
                }
              );
              console.log('[Backfill] Created Airtable Subscription record for', subId);
            }
          }

        } catch (err: any) {
          result.error = String(err?.message || err).slice(0, 300);
          console.error('[Backfill] Error for', email, childName, ':', result.error);
        }

        results.push(result);
      }
    }

    return NextResponse.json({
      dryRun,
      total: results.length,
      results,
    });
  } catch (err: any) {
    console.error('[Backfill] Fatal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
