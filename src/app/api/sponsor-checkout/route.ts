import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getChildByShirtNumber } from '@/lib/db/queries';

/**
 * GET /api/sponsor-checkout?number=12
 *
 * One-click sponsorship checkout. Looks up the child by shirt number,
 * creates a Stripe Checkout Session, and 302-redirects the buyer
 * straight to payment. Used in drip nurture emails so the CTA is
 * frictionless &mdash; no intermediate page, no extra clicks.
 *
 * Data: child lookup goes through Postgres (queries.getChildByShirtNumber).
 * Sponsorship rows are NOT created here &mdash; the Stripe webhook does
 * that on `checkout.session.completed`. Per core_model.md §0, the
 * Children link is left blank; cycle math resolves the kid at display
 * time.
 *
 * Falls back to /shirts if anything goes wrong (missing number, child
 * not found, kid is departed, Stripe error).
 */

const SPONSORSHIP_AMOUNT = 25; // $25/month

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not set');
  return new StripeModule(secretKey, { apiVersion: '2025-12-15.clover' });
}

export async function GET(request: NextRequest) {
  const fallback = `${SITE_URL}/shirts`;

  try {
    const numberParam = request.nextUrl.searchParams.get('number');
    if (!numberParam) {
      return NextResponse.redirect(fallback);
    }

    const shirtNumber = parseInt(numberParam, 10);
    if (isNaN(shirtNumber)) {
      return NextResponse.redirect(fallback);
    }

    const child = await getChildByShirtNumber(shirtNumber);
    if (!child) {
      return NextResponse.redirect(fallback);
    }

    // If the kid has departed or is held out (reserved for auction),
    // bail to the general shirts page. The reveal would be meaningless.
    if (child.departedAt || child.reservedForAuction) {
      return NextResponse.redirect(fallback);
    }

    const childRecordId = child.id;
    const childIdLegacy = child.childId || '';
    const childDisplayName =
      child.displayName || child.firstName || `Child #${shirtNumber}`;

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
        child_id: childIdLegacy,
        child_display_name: childDisplayName,
        donation_type: 'monthly',
        source: 'drip_email',
      },
      subscription_data: {
        metadata: {
          order_type: 'sponsorship',
          child_record_id: childRecordId,
          child_id: childIdLegacy,
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
    return NextResponse.redirect(fallback);
  }
}
