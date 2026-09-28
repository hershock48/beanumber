/**
 * GET /api/sponsor/billing?t=<token>
 *
 * The card-update link in dunning emails. Verifies the signed billing
 * token (see src/lib/billing-tokens.ts), opens a Stripe Billing Portal
 * session for that customer, and redirects straight into it. The
 * portal is where the sponsor fixes their card; Stripe applies the new
 * default payment method to the subscription and retries on its own
 * schedule.
 *
 * No sponsor_session cookie is required or set — the token IS the
 * auth, same trust model as the recovery magic link. The portal's
 * return_url lands back on the kid's page (or /me when the token
 * carries no shirt number).
 *
 * Failure modes — bad signature, expired token, portal not configured
 * in the Stripe dashboard — all redirect to /signin with a soft error
 * so the sponsor still has a way in. A portal-config failure also logs
 * loudly because that's a Kevin-side dashboard fix, not a user error.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyBillingToken } from '@/lib/billing-tokens';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const verified = verifyBillingToken(searchParams.get('t'));
  if (!verified) {
    return NextResponse.redirect(`${SITE_URL}/signin?error=expired`);
  }

  const returnUrl =
    verified.shirtNumber > 0
      ? `${SITE_URL}/children/${verified.shirtNumber}`
      : `${SITE_URL}/me`;

  try {
    const StripeModule = (await import('stripe')).default;
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    const stripe = new StripeModule(secretKey, {
      apiVersion: '2025-12-15.clover',
    });
    const session = await stripe.billingPortal.sessions.create({
      customer: verified.stripeCustomerId,
      return_url: returnUrl,
    });
    return NextResponse.redirect(session.url);
  } catch (err) {
    // Most likely: no default Billing Portal configuration saved in
    // the Stripe dashboard for this mode. That's a one-time dashboard
    // step (Settings → Billing → Customer portal → Save), so make the
    // log unmissable.
    console.error(
      '[sponsor/billing] portal session failed:',
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.redirect(`${SITE_URL}/signin?error=unavailable`);
  }
}
