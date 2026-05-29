/**
 * Admin session — HMAC-signed cookie auth.
 *
 * One login per device, 30-day expiry. Replaces the per-page password
 * prompt pattern that the old admin routes used. Validated by:
 *   1. The Next.js middleware (`middleware.ts`) for `/admin/*` page
 *      renders — kicks unauthenticated requests to `/admin/login`.
 *   2. `requireAdminAuth()` in `src/lib/auth.ts` for `/api/admin/*`
 *      endpoints — falls back to the legacy X-Admin-Token header so
 *      scripts and cron jobs still work.
 *
 * The cookie value is a base64-encoded JSON payload + an HMAC-SHA256
 * signature over the payload. Tampering invalidates it. Rotating
 * `ADMIN_PASSWORD` (or `ADMIN_SESSION_SECRET`) silently invalidates
 * every active session on next page load.
 */

import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';

export const ADMIN_SESSION_COOKIE = 'ban_admin_session';
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export type AdminRole = 'admin' | 'simon';

interface SessionPayload {
  // Issued-at timestamp (ms). Used to enforce TTL on the server.
  iat: number;
  // Expiry timestamp (ms). Should match the cookie's Max-Age but
  // double-checking server-side guards against a tampered Max-Age.
  exp: number;
  // Who is logged in. 'admin' = Kevin (full access). 'simon' = YDO
  // team member (roster intake only, no publish, no other admin
  // surfaces).
  role?: AdminRole;
}

/**
 * Get the signing secret. Prefers a dedicated ADMIN_SESSION_SECRET
 * env var; falls back to ADMIN_PASSWORD if not set (any rotation of
 * the password silently invalidates sessions, which is the intended
 * "panic logout" behavior).
 */
function getSecret(): string {
  const secret =
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    process.env.CRON_SECRET ||
    '';
  if (!secret) {
    throw new Error(
      'ADMIN_SESSION_SECRET (or ADMIN_PASSWORD or CRON_SECRET) must be set'
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

function verifySignature(payload: string, signature: string): boolean {
  const expected = sign(payload);
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(signature, 'utf8')
    );
  } catch {
    return false;
  }
}

/**
 * Encode the cookie value: base64url(JSON payload) + '.' + signature.
 */
function encode(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64url');
  const sig = sign(b64);
  return `${b64}.${sig}`;
}

/**
 * Decode + verify a cookie value. Returns the payload when valid and
 * not expired; null otherwise.
 */
export function decodeSessionCookie(value: string | undefined): SessionPayload | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot < 0) return null;
  const b64 = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!verifySignature(b64, sig)) return null;

  try {
    const json = Buffer.from(b64, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as SessionPayload;
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
      return null;
    }
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Issue a fresh session cookie. Call on successful password verification.
 * Must be called from a Server Action or Route Handler (anything with
 * cookies() write access).
 */
export async function issueSessionCookie(role: AdminRole = 'admin'): Promise<void> {
  const now = Date.now();
  const payload: SessionPayload = {
    iat: now,
    exp: now + SESSION_TTL_MS,
    role,
  };
  const value = encode(payload);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(payload.exp),
  });
}

/**
 * Read the current request's role from the session cookie. Returns
 * 'admin' by default for backward compatibility with old cookies that
 * didn't carry a role.
 */
export async function getAdminRole(): Promise<AdminRole | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(ADMIN_SESSION_COOKIE);
  const payload = decodeSessionCookie(cookie?.value);
  if (!payload) return null;
  return (payload.role as AdminRole) || 'admin';
}

/**
 * Clear the admin session cookie (logout).
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

/**
 * Check the current request's admin session cookie. Returns true if a
 * valid, unexpired session is present. Safe to call from any Server
 * Component or Route Handler.
 */
export async function hasValidAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(ADMIN_SESSION_COOKIE);
  return decodeSessionCookie(cookie?.value) !== null;
}

/**
 * Verify a raw password against either ADMIN_PASSWORD (Kevin) or
 * SIMON_PASSWORD (the YDO team member). Returns the matched role or
 * null if neither matched. Constant-time comparison per candidate.
 */
export function verifyAdminPassword(rawPassword: string): AdminRole | null {
  const candidates: Array<{ env: string; role: AdminRole }> = [
    { env: 'ADMIN_PASSWORD', role: 'admin' },
    { env: 'SIMON_PASSWORD', role: 'simon' },
  ];
  for (const { env, role } of candidates) {
    const expected = process.env[env] || '';
    if (!expected) continue;
    if (expected.length !== rawPassword.length) continue;
    try {
      if (
        timingSafeEqual(
          Buffer.from(expected, 'utf8'),
          Buffer.from(rawPassword, 'utf8')
        )
      ) {
        return role;
      }
    } catch {
      // ignore and try the next candidate
    }
  }
  return null;
}
