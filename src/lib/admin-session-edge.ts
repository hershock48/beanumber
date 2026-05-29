/**
 * Edge-runtime admin session verifier.
 *
 * The Next.js middleware runs on the Edge runtime, where Node's
 * `crypto` module is unavailable. This file does the same HMAC-SHA256
 * cookie verification as `admin-session.ts`, but using Web Crypto so
 * it runs cleanly on Edge.
 *
 * Same cookie format as `admin-session.ts`:
 *   base64url(JSON payload) + '.' + hex HMAC-SHA256(payload, secret)
 *
 * Both implementations interpret the same cookie value identically.
 * Server (Node) code keeps using `admin-session.ts` for the sync API;
 * middleware uses this module.
 */

export const ADMIN_SESSION_COOKIE = 'ban_admin_session';

function getSecret(): string | null {
  const secret =
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    process.env.CRON_SECRET ||
    '';
  return secret || null;
}

function fromBase64Url(s: string): string {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}

function bytesToHex(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < view.length; i++) {
    out += view[i].toString(16).padStart(2, '0');
  }
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify a session cookie value on the Edge. Returns true when the
 * signature is valid AND the payload's exp is in the future.
 */
export async function isValidSessionCookieEdge(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const dot = value.lastIndexOf('.');
  if (dot < 0) return false;

  const b64 = value.slice(0, dot);
  const sig = value.slice(dot + 1);

  const secret = getSecret();
  if (!secret) return false;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const expectedBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(b64)
    );
    const expected = bytesToHex(expectedBytes);
    if (!constantTimeEqual(expected, sig)) return false;

    const json = fromBase64Url(b64);
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== 'number') return false;
    if (payload.exp < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}
