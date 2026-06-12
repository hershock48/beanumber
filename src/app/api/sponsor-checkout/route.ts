import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

/**
 * GET /api/sponsor-checkout?number=12
 *
 * One-click sponsorship checkout. Looks up the child by shirt number,
 * creates a Stripe checkout session, and 302-redirects the buyer straight
 * to payment. Used in drip nurture emails so the CTA is frictionless —
 * no intermediate page, no extra clicks.
 *
 * Falls back to /campus if anything goes wrong (missing number,
 * child not found, child already sponsored, Stripe error).
 */

const SPONSORSHIP_AMOUNT = 25; // $25/month

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

// ── Airtable helper (self-contained so this route has no cross-imports) ──

async function airtableRequest<T>(endpoint: string): Promise<T> {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const token = process.env.AIRTABLE_API_KEY;
  if (!baseId || !token) throw new Error('Airtable not configured');

  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}${endpoint}`,
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Stripe helper ──

async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not set');
  return new StripeModule(secretKey, { apiVersion: '2025-12-15.clover' });
}

// ── Types ──

interface AirtableChildRecord {
  id: string; // Airtable record ID
  fields: {
    ChildID?: string;
    DisplayName?: string;
    FirstName?: string;
    ShirtNumber?: number;
    SponsorshipStatus?: string;
    ReservedForAuction?: boolean;
  };
}

export async function GET(request: NextRequest) {
  const fallback = `${SITE_URL}/campus`;

  try {
    const numberParam = request.nextUrl.searchParams.get('number');
    if (!numberParam) {
      return NextResponse.redirect(fallback);
    }

    const shirtNumber = parseInt(numberParam, 10);
    if (isNaN(shirtNumber)) {
      return NextResponse.redirect(fallback);
    }

    // Look up child by shirt number
    const childrenTable = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
    const formula = encodeURIComponent(`{ShirtNumber}=${shirtNumber}`);
    const result = await airtableRequest<{ records: AirtableChildRecord[] }>(
      `/${encodeURIComponent(childrenTable)}?filterByFormula=${formula}&maxRecords=1`
    );

    if (!result.records.length) {
      // No child with that number — send to general sponsorship page
      return NextResponse.redirect(fallback);
    }

    const record = result.records[0];
    const fields = record.fields;

    // If already sponsored or reserved, fall back to the sponsorship page
    // where they can pick someone else
    if (
      fields.ReservedForAuction ||
      (fields.SponsorshipStatus && fields.SponsorshipStatus !== 'Available')
    ) {
      return NextResponse.redirect(
        `${SITE_URL}/campus`
      );
    }

    const childRecordId = record.id;
    const childId = fields.ChildID || '';
    const childDisplayName = fields.DisplayName || fields.FirstName || `Child #${shirtNumber}`;

    // Create Stripe checkout session
    const stripe = await getStripe();

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Sponsor ${childDisplayName} / Be A Number`,
              description: `Monthly sponsorship of ${childDisplayName} in Northern Uganda. Education, meals, medical care, and mentorship. Cancel anytime.`,
            },
            unit_amount: SPONSORSHIP_AMOUNT * 100,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${SITE_URL}/sponsor/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/children/${shirtNumber}`,
      billing_address_collection: 'required',
      custom_fields: [
        {
          key: 'organization',
          label: { type: 'custom', custom: 'Organization Name (if applicable)' },
          type: 'text',
          optional: true,
        },
        {
          key: 'referral',
          label: { type: 'custom', custom: 'How did you hear about us?' },
          type: 'text',
          optional: true,
        },
      ],
      metadata: {
        order_type: 'sponsorship',
        child_record_id: childRecordId,
        child_id: childId,
        child_display_name: childDisplayName,
        donation_type: 'monthly',
        source: 'drip_email',
      },
      subscription_data: {
        metadata: {
          order_type: 'sponsorship',
          child_record_id: childRecordId,
          child_id: childId,
          child_display_name: childDisplayName,
          donation_type: 'monthly',
          amount: SPONSORSHIP_AMOUNT.toString(),
          source: 'drip_email',
        },
      },
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    if (!session.url) {
      throw new Error('Stripe returned no checkout URL');
    }

    return NextResponse.redirect(session.url);
  } catch (err) {
    console.error('[sponsor-checkout] Error:', err);
    // Something broke — send them to the sponsorship page rather than an error screen
    return NextResponse.redirect(fallback);
  }
}
