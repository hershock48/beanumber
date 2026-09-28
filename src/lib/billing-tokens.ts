/**
 * Signed tokens for the card-update link in dunning emails.
 *
 * When a sponsor's monthly payment fails, the email we send carries a
 * one-click link to the Stripe Billing Portal so they can fix the card
 * without signing in first. The link has to be safe to sit in an inbox,
 * so it carries a signed token instead of a raw Stripe customer id.
 *
 * Same format and signing scheme as recovery-tokens.ts:
 *   `<base64url(JSON payload)>.<base64url(HMAC-SHA256(payload))>`
 * Payload: `{ t: 'billing', s: stripeCustomerId, n: shirtNumber, e: exp }`
 *
 * The `t` discriminator keeps these tokens from being mistaken for
 * recovery tokens (and vice versa) even though both sign with
 * CRON_SECRET — verifyBillingToken rejects any payload without it, and
 * verifyRecoveryToken rejects payloads missing its own `c` field.
 *
 * TTL is 7 days, longer than recovery's 24 hours on purpose: a failed
 * card is exactly the email people sit on for a few days, and Stripe's
 * retry window runs for weeks. An expired link lands on /signin with
 * the soft-error flow, not a dead end.
 */
import crypto from 'crypto';

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

function getSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('CRON_SECRET is required for billing token signing.');
  }
  return secret;
}

function signPayload(b64Payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(b64Payload).digest('base64url');
}

export function makeBillingToken(
  stripeCustomerId: string,
  shirtNumber: number | null | undefined,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const n =
    typeof shirtNumber === 'number' && Number.isFinite(shirtNumber) && shirtNumber > 0
      ? shirtNumber
      : 0;
  const payload = JSON.stringify({ t: 'billing', s: stripeCustomerId, n, e: exp });
  const b64Payload = Buffer.from(payload).toString('base64url');
  const sig = signPayload(b64Payload, getSecret());
  return `${b64Payload}.${sig}`;
}

export function verifyBillingToken(
  token: string | null | undefined
): { stripeCustomerId: string; shirtNumber: number } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64Payload, sig] = parts;

  let expectedSig: string;
  try {
    expectedSig = signPayload(b64Payload, getSecret());
  } catch {
    return null;
  }

  if (sig.length !== expectedSig.length) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (!crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString());
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload?.t !== 'billing') return null;
    if (typeof payload?.e !== 'number' || payload.e < nowSec) return null;
    if (typeof payload?.s !== 'string' || !payload.s) return null;
    if (typeof payload?.n !== 'number') return null;
    return { stripeCustomerId: payload.s, shirtNumber: payload.n };
  } catch {
    return null;
  }
}
