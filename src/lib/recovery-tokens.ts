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

// 24 hours. The old 30-minute TTL was leftover paranoia — most users
// don't check email the moment they request a link. "Requested one at
// dinner, tapped it after the kids were in bed" is a normal pattern
// and the 30-minute expiry broke it silently. 24 hours is still
// dramatically shorter than a real password (which never expires) and
// covers ~99% of the human latency between request and tap.
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

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
    // Kinded tokens (claim-confirm below) carry `k` and never a
    // sponsor code. Refuse them here explicitly so the two token
    // kinds can never be swapped, whatever fields they share.
    if (payload?.k !== undefined) return null;
    if (typeof payload?.c !== 'string' || typeof payload?.n !== 'number') return null;
    // shirtNumber === 0 is the "no landing kid, redirect to /me"
    // sentinel — see makeRecoveryToken. Callers must handle it.
    return { sponsorCode: payload.c, shirtNumber: payload.n };
  } catch {
    return null;
  }
}

// ─── Claim-confirm tokens ───────────────────────────────────────
//
// Second token kind, same secret and format. Minted by send-link when
// an email that already holds a number types a DIFFERENT number with
// no purchase trail behind it (see src/lib/claim-guard.ts). The token
// rides the "yes, claim #N too" button in the confirmation email;
// /api/sponsor/recover/confirm-claim verifies it and only then mints
// the Holder row. Nothing is written when the email is sent.
//
// Payload: `{ k: 'claim', m: emailLower, n: shirtNumber, e: exp }`.
// `k` is the kind discriminator: a claim token has no sponsor code,
// so verifyRecoveryToken rejects it, and verifyClaimConfirmToken
// rejects anything without k === 'claim'.

const CLAIM_KIND = 'claim';

export function makeClaimConfirmToken(
  email: string,
  shirtNumber: number,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const m = (email || '').trim().toLowerCase();
  if (!m) throw new Error('makeClaimConfirmToken: email is required.');
  if (!Number.isInteger(shirtNumber) || shirtNumber <= 0) {
    throw new Error('makeClaimConfirmToken: shirtNumber must be a positive integer.');
  }
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = JSON.stringify({ k: CLAIM_KIND, m, n: shirtNumber, e: exp });
  const b64Payload = Buffer.from(payload).toString('base64url');
  const sig = signPayload(b64Payload, getSecret());
  return `${b64Payload}.${sig}`;
}

export function verifyClaimConfirmToken(
  token: string | null | undefined
): { email: string; shirtNumber: number } | null {
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
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString());
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload?.k !== CLAIM_KIND) return null;
    if (typeof payload?.e !== 'number' || payload.e < nowSec) return null;
    if (typeof payload?.m !== 'string' || !payload.m) return null;
    if (!Number.isInteger(payload?.n) || payload.n <= 0) return null;
    return { email: payload.m, shirtNumber: payload.n };
  } catch {
    return null;
  }
}
