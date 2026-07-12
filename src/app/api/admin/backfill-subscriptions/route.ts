/**
 * GET /api/admin/backfill-subscriptions
 *
 * For each Donation whose note contains "+monthly", ensures:
 *   - a Stripe subscription exists for the buyer (creates one if not)
 *   - a Sponsorship row exists in Postgres
 *   - a Subscription row exists in Postgres
 *
 * Root cause: cart checkout used mode:'payment' without customer_creation:'always',
 * so Stripe never created a customer. The webhook silently skipped subscription
 * creation because stripeCustomerId was null.
 *
 * Idempotent. ?dry=1 to preview without writing.
 *
 * Auth: ADMIN_API_TOKEN / ADMIN_PASSWORD / CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { db } from '@/lib/db/client';
import {
  donations,
  donors,
  sponsorships,
  children,
} from '@/lib/db/schema';
import { eq, sql, and, or, isNull } from 'drizzle-orm';
import { upsertSubscription, createSponsorship } from '@/lib/db/mutations';
import { generateUniqueSponsorCode } from '@/lib/sponsor-codes';

async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not set');
  return new StripeModule(secretKey, { apiVersion: '2025-12-15.clover' });
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
    return NextResponse.json(
      { error: 'Unauthorized. Pass ?token=YOUR_ADMIN_TOKEN in the URL.' },
      { status: 401 }
    );
  }

  const dryRun = request.nextUrl.searchParams.get('dry') === '1';
  const results: BackfillResult[] = [];

  try {
    const stripe = await getStripe();

    // Stripe Product for the monthly sponsorship. price_data on
    // subscriptions.create requires a product ID; it doesn't accept
    // inline product_data like Checkout does.
    let sponsorshipProductId: string;
    try {
      const product = await stripe.products.create({
        name: 'Be A Number monthly sponsorship',
        metadata: { source: 'backfill' },
      });
      sponsorshipProductId = product.id;
    } catch (productErr) {
      const msg = productErr instanceof Error ? productErr.message : String(productErr);
      console.error('[Backfill] Failed to create Stripe Product:', msg);
      return NextResponse.json(
        { error: 'Failed to create Stripe Product for sponsorship: ' + msg },
        { status: 500 }
      );
    }

    // Find donations with +monthly in the note.
    const monthlyDonations = await db
      .select()
      .from(donations)
      .where(sql`${donations.donationNote} ILIKE '%+monthly%'`);

    console.log(`[Backfill] Found ${monthlyDonations.length} donations with +monthly`);

    for (const donation of monthlyDonations) {
      const note = donation.donationNote || '';
      const sessionId = donation.stripeCheckoutSessionId || '';
      const piId = donation.stripePaymentIntentId || '';
      const email = (donation.donorEmailAtDonation || '').toLowerCase();

      // Parse +monthly lines (one per shirt/kid).
      const monthlyLines = note.split('\n').filter(l => l.includes('+monthly'));
      if (monthlyLines.length === 0) continue;

      // Hydrate the donor.
      let donor =
        (donation.donorId
          ? (await db.select().from(donors).where(eq(donors.id, donation.donorId)).limit(1))[0]
          : null) ||
        (email
          ? (
              await db
                .select()
                .from(donors)
                .where(sql`lower(${donors.email}) = ${email}`)
                .limit(1)
            )[0]
          : null) ||
        null;

      const donorName = donor?.name || '';
      let donorStripeId = donor?.stripeCustomerId || '';

      for (const line of monthlyLines) {
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
          // Get or create the Stripe customer.
          let customerId = donorStripeId;

          if (!customerId && sessionId) {
            try {
              const session = await stripe.checkout.sessions.retrieve(sessionId);
              if (session.customer) {
                customerId =
                  typeof session.customer === 'string'
                    ? session.customer
                    : session.customer.id;
              }
            } catch {}
          }

          if (!customerId && piId) {
            try {
              const pi = await stripe.paymentIntents.retrieve(piId);
              const pmId =
                typeof pi.payment_method === 'string'
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
                await stripe.paymentMethods.attach(pmId, { customer: customerId });
              }
            } catch (e) {
              console.error('[Backfill] Failed to create customer from PI:', piId, e);
            }
          }

          if (!customerId) {
            result.error = 'Could not find or create Stripe customer';
            results.push(result);
            continue;
          }
          result.stripeCustomerId = customerId;

          // Backfill donor.stripeCustomerId if missing.
          if (donor && !donor.stripeCustomerId && !dryRun) {
            await db
              .update(donors)
              .set({ stripeCustomerId: customerId, updatedAt: new Date() })
              .where(eq(donors.id, donor.id));
            donorStripeId = customerId;
          }

          // Look for an existing matching Stripe subscription.
          const existingSubs = await stripe.subscriptions.list({
            customer: customerId,
            status: 'all',
            limit: 10,
          });
          let subId = '';
          const existingSub = existingSubs.data.find(
            s =>
              s.metadata?.child_display_name === childName ||
              s.metadata?.referring_cart_session_id === sessionId
          );

          if (existingSub) {
            subId = existingSub.id;
          } else if (!dryRun) {
            // Find a saved PM on the customer.
            let pmId: string | null = null;
            for (const pmType of ['card', 'link'] as const) {
              const list = await stripe.paymentMethods.list({
                customer: customerId,
                type: pmType,
              });
              if (list.data[0]) {
                pmId = list.data[0].id;
                break;
              }
            }
            if (!pmId && piId) {
              try {
                const pi = await stripe.paymentIntents.retrieve(piId);
                const piPm =
                  typeof pi.payment_method === 'string'
                    ? pi.payment_method
                    : pi.payment_method?.id;
                if (piPm) {
                  pmId = piPm;
                  try {
                    await stripe.paymentMethods.attach(pmId, { customer: customerId });
                  } catch (attachErr) {
                    const m =
                      attachErr instanceof Error ? attachErr.message : String(attachErr);
                    if (!m.includes('already')) {
                      console.warn('[Backfill] PM attach warn:', m);
                    }
                  }
                }
              } catch {}
            }
            if (!pmId) {
              result.error = 'No payment method on file for customer ' + customerId;
              results.push(result);
              continue;
            }

            const billingAnchor = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
            const sub = await stripe.subscriptions.create({
              customer: customerId,
              items: [
                {
                  price_data: {
                    currency: 'usd',
                    product: sponsorshipProductId,
                    unit_amount: 2500,
                    recurring: { interval: 'month' },
                  } as Stripe.SubscriptionCreateParams.Item['price_data'],
                },
              ],
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
          }
          result.stripeSubscriptionId = subId || null;
          result.subscriptionCreated = !!subId;

          // If sub was created and there's an orphan Sponsorship row
          // for this email without a sub, claim it.
          if (subId && !dryRun && email) {
            const claim = await db
              .select()
              .from(sponsorships)
              .where(
                and(
                  sql`lower(${sponsorships.sponsorEmail}) = ${email}`,
                  or(
                    isNull(sponsorships.stripeSubscriptionId),
                    eq(sponsorships.stripeSubscriptionId, '')
                  )
                )
              )
              .limit(1);
            const candidate = claim[0];
            if (candidate) {
              await db
                .update(sponsorships)
                .set({
                  stripeSubscriptionId: subId,
                  status: 'Active',
                  updatedAt: new Date(),
                })
                .where(eq(sponsorships.id, candidate.id));
            }
          }

          // Find the kid record by shirt number.
          let childRecordId: string | null = null;
          let childIdLegacy: string | null = null;
          if (shirtNumber) {
            const kid = await db
              .select({ id: children.id, childId: children.childId })
              .from(children)
              .where(eq(children.shirtNumber, Number(shirtNumber)))
              .limit(1);
            if (kid[0]) {
              childRecordId = kid[0].id;
              childIdLegacy = kid[0].childId;
            }
          }

          // Create Sponsorship if missing (lookup by email + child).
          if (childRecordId && !dryRun && email) {
            const existing = await db
              .select({ id: sponsorships.id })
              .from(sponsorships)
              .where(
                and(
                  sql`lower(${sponsorships.sponsorEmail}) = ${email}`,
                  or(
                    eq(sponsorships.childId, childRecordId),
                    childIdLegacy ? eq(sponsorships.childIdLegacy, childIdLegacy) : sql`false`
                  )
                )
              )
              .limit(1);
            if (existing.length === 0) {
              await createSponsorship({
                sponsorCode: await generateUniqueSponsorCode(),
                sponsorEmail: email,
                sponsorName: donorName,
                childId: childRecordId,
                childIdLegacy,
                childDisplayName: childName || null,
                monthlyAmount: 25,
                status: 'Active',
                stripeSubscriptionId: subId || null,
                sponsorshipStartDate: new Date().toISOString().slice(0, 10),
              });
              result.sponsorshipCreated = true;
            }
          }

          // Mirror the Subscription row.
          if (subId && !dryRun && donor) {
            await upsertSubscription({
              stripeSubscriptionId: subId,
              donorId: donor.id,
              status: 'active',
              amount: 25,
              frequency: 'monthly',
              startDate: new Date().toISOString().slice(0, 10),
            });
          }
        } catch (err) {
          result.error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Backfill] Fatal error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
