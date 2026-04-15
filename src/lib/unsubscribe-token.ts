/**
 * Unsubscribe Token Helpers
 *
 * We need one-click unsubscribe links in marketing emails (CAN-SPAM + Gmail's
 * bulk sender requirements). The links include the recipient's email and an
 * HMAC-SHA256 signature of that email. The signature is verified on the
 * unsubscribe endpoint so nobody can forge an unsubscribe for someone else.
 *
 * The signing secret is `UNSUBSCRIBE_SECRET` if set, otherwise falls back to
 * `ADMIN_API_TOKEN` (which is always required in production). That keeps the
 * env surface small while still guaranteeing a high-entropy secret.
 *
 * Token format: url-safe base64 of the HMAC digest. Short enough to pass
 * around in a query string without encoding surprises.
 */

import crypto from 'crypto';

function getSigningSecret(): string {
  const secret =
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.ADMIN_API_TOKEN ||
    '';
  if (!secret) {
    // In dev with no admin token set this is an explicit hole. Throwing
    // makes the problem obvious the first time a newsletter tries to send.
    throw new Error(
      'No unsubscribe signing secret available. Set UNSUBSCRIBE_SECRET or ADMIN_API_TOKEN.'
    );
  }
  return secret;
}

/**
 * Sign a normalized email address.
 *
 * Emails are lowercased + trimmed before signing so that UPPER@Example.com
 * and upper@example.com produce the same token — people don't type their
 * own email consistently.
 */
export function signUnsubscribeToken(email: string): string {
  const normalized = email.trim().toLowerCase();
  const mac = crypto
    .createHmac('sha256', getSigningSecret())
    .update(normalized)
    .digest('base64');
  // Make it URL-safe (RFC 4648 §5) so it doesn't need percent-encoding.
  return mac.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verify a token against an email. Returns true only if the token was
 * produced by signUnsubscribeToken for this exact email and same secret.
 *
 * Uses timing-safe comparison to prevent side-channel leaks of the secret.
 */
export function verifyUnsubscribeToken(email: string, token: string): boolean {
  if (!email || !token) return false;
  let expected: string;
  try {
    expected = signUnsubscribeToken(email);
  } catch {
    return false;
  }
  // Timing-safe compare requires equal-length buffers.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(token, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Build a one-click unsubscribe URL for a given recipient.
 *
 * Links point at /api/unsubscribe so a single click both verifies and
 * mutates state. The endpoint responds with a plain-English confirmation
 * page — no extra confirmation click required (that's what "one-click"
 * means under RFC 8058).
 */
export function buildUnsubscribeUrl(email: string, siteUrl?: string): string {
  const base =
    siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
  const token = signUnsubscribeToken(email);
  const qs = new URLSearchParams({
    email: email.trim().toLowerCase(),
    token,
  });
  return `${base.replace(/\/$/, '')}/api/unsubscribe?${qs.toString()}`;
}
