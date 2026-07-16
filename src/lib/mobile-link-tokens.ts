/**
 * Short-lived signed tokens for mobile email-linking.
 *
 * The identity gap they close: a mobile user signs in with Apple or
 * Google, but their shirt purchase / sponsorship lives under a
 * different email (spouse's checkout email, work email, Apple
 * private-relay address). The app can't just take their word for it —
 * "type any email, see that email's kids" would be an account-takeover
 * hole. So the link flow proves inbox ownership the same way the web
 * sign-in does: we email the address a one-tap confirmation link, and
 * only the person who can open that inbox can complete the link.
 *
 * Flow:
 *   1. POST /api/mobile/v1/link/request (authed) — mints one of these
 *      tokens binding { mobile user id, email to link } and mails it.
 *   2. GET /api/mobile/v1/link/confirm?t=... — verifies the token and
 *      stamps mobile_users.linked_sponsor_email. From then on every
 *      mobile route matches sponsorships on BOTH emails.
 *
 * Format mirrors src/lib/recovery-tokens.ts:
 *   `<base64url(JSON payload)>.<base64url(HMAC-SHA256(payload))>`
 * Payload: `{ t: 'mlink', u: mobileUserId, m: emailLower, e: expiry }`
 * The `t` discriminator keeps these tokens from ever being accepted
 * by the recovery-token verifier (and vice versa) even though both
 * sign with CRON_SECRET — the payload shapes are mutually invalid.
 */
import crypto from 'crypto';

// 24 hours — same reasoning as recovery tokens: "requested at dinner,
// tapped after the kids were in bed" is the normal human latency.
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

function getSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('CRON_SECRET is required for mobile link token signing.');
  }
  return secret;
}

function signPayload(b64Payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(b64Payload)
    .digest('base64url');
}

export function makeMobileLinkToken(
  mobileUserId: string,
  emailToLink: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = JSON.stringify({
    t: 'mlink',
    u: mobileUserId,
    m: emailToLink.trim().toLowerCase(),
    e: exp,
  });
  const b64Payload = Buffer.from(payload).toString('base64url');
  const sig = signPayload(b64Payload, getSecret());
  return `${b64Payload}.${sig}`;
}

export function verifyMobileLinkToken(
  token: string | null | undefined
): { mobileUserId: string; email: string } | null {
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
    if (payload?.t !== 'mlink') return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload?.e !== 'number' || payload.e < nowSec) return null;
    if (typeof payload?.u !== 'string' || !payload.u) return null;
    if (typeof payload?.m !== 'string' || !payload.m.includes('@')) return null;
    return { mobileUserId: payload.u, email: payload.m };
  } catch {
    return null;
  }
}
