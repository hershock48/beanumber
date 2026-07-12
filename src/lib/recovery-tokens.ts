/**
 * Short-lived signed tokens for sponsor magic-link recovery.
 *
 * A sponsor who lost their cookie / cleared their browser / is on a
 * different device hits the recovery form on /[number]. We email them
 * a one-click link containing a signed token. Clicking the link
 * validates the token, drops a fresh sponsor_session cookie, and
 * redirects them back to /children/[number] in authenticated mode.
 *
 * Format: `<base64url(JSON payload)>.<base64url(HMAC-SHA256(payload))>`
 * Payload: `{ c: sponsorCode, n: shirtNumber, e: expirySeconds }` —
 * `n` is 0 when the sponsorship has no linked shirt number yet (e.g.
 * a backfilled Holder for a pre-cutover buyer whose stockpile shirt
 * hasn't been reconciled). The callback interprets `n === 0` as
 * "no landing kid — send them to /me instead of /children/[N]."
 *
 * Signing secret: reuses CRON_SECRET. That secret is already a
 * high-entropy random string Kevin has set in Vercel; sharing it
 * across server-only use cases is fine because both consumers run
 * server-side (the token never leaves the server unsigned).
 */
import crypto from 'crypto';

const DEFAULT_TTL_SECONDS = 30 * 60; // 30 minutes

function getSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('CRON_SECRET is required for recovery token signing.');
  }
  return secret;
}

function signPayload(b64Payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(b64Payload).digest('base64url');
}

export function makeRecoveryToken(
  sponsorCode: string,
  shirtNumber: number | null | undefined,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const n =
    typeof shirtNumber === 'number' && Number.isFinite(shirtNumber) && shirtNumber > 0
      ? shirtNumber
      : 0;
  const payload = JSON.stringify({ c: sponsorCode, n, e: exp });
  const b64Payload = Buffer.from(payload).toString('base64url');
  const sig = signPayload(b64Payload, getSecret());
  return `${b64Payload}.${sig}`;
}

export function verifyRecoveryToken(
  token: string | null | undefined
): { sponsorCode: string; shirtNumber: number } | null {
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

  // Constant-time signature compare. Length mismatches short-circuit
  // first since timingSafeEqual throws on unequal-length buffers.
  if (sig.length !== expectedSig.length) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (!crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString());
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload?.e !== 'number' || payload.e < nowSec) return null;
    if (typeof payload?.c !== 'string' || typeof payload?.n !== 'number') return null;
    // shirtNumber === 0 is the "no landing kid, redirect to /me"
    // sentinel — see makeRecoveryToken. Callers must handle it.
    return { sponsorCode: payload.c, shirtNumber: payload.n };
  } catch {
    return null;
  }
}
