/**
 * Authentication utilities
 * Shared helpers for session management and authentication
 */

import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { findSponsorshipByCode } from './airtable';
import { logger } from './logger';
import { AuthenticationError } from './errors';
import { SESSION, ERROR_MESSAGES } from './constants';
import type { AirtableSponsorshipRecord } from './types/airtable';
import { ADMIN_SESSION_COOKIE, decodeSessionCookie } from './admin-session';
import { db } from './db/client';
import { mobileTokenRevocations } from './db/schema';
import { hashToken, verifyMobileToken } from './mobile-auth';

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export interface SessionData {
  email: string;
  sponsorCode: string;
  expires: string;
}

/**
 * Get session data from cookie
 */
export async function getSession(): Promise<SessionData | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION.COOKIE_NAME);

    if (!sessionCookie) {
      return null;
    }

    const session: SessionData = JSON.parse(sessionCookie.value);

    // Check if expired
    if (new Date(session.expires) < new Date()) {
      logger.auth('session_expired', false);
      return null;
    }

    return session;
  } catch (error) {
    logger.error('Failed to parse session cookie', error);
    return null;
  }
}

/**
 * Verify session and return sponsorship record
 */
export async function verifySession(): Promise<AirtableSponsorshipRecord | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  // Verify sponsorship still exists and is active
  const sponsorship = await findSponsorshipByCode(session.sponsorCode);

  if (!sponsorship) {
    logger.auth('session_invalid', false, {
      reason: 'sponsorship_not_found',
      code: logger.maskSponsorCode(session.sponsorCode),
    });
    return null;
  }

  return sponsorship;
}

/**
 * Require authentication - throws error if not authenticated
 */
export async function requireAuth(): Promise<AirtableSponsorshipRecord> {
  const sponsorship = await verifySession();

  if (!sponsorship) {
    throw new AuthenticationError(ERROR_MESSAGES.SESSION_EXPIRED);
  }

  return sponsorship;
}

/**
 * Verify session for specific sponsor code
 */
export async function verifySessionForCode(sponsorCode: string): Promise<boolean> {
  const session = await getSession();

  if (!session) {
    return false;
  }

  if (session.sponsorCode !== sponsorCode) {
    logger.auth('session_code_mismatch', false, {
      sessionCode: logger.maskSponsorCode(session.sponsorCode),
      requestCode: logger.maskSponsorCode(sponsorCode),
    });
    return false;
  }

  return true;
}

/**
 * Clear session cookie (logout)
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION.COOKIE_NAME);
  logger.auth('logout', true);
}

// ============================================================================
// ADMIN AUTHENTICATION
// ============================================================================

/**
 * Verify admin authentication. Accepts three credential sources, in order:
 *   1. The `ban_admin_session` cookie (HMAC-signed by `lib/admin-session.ts`)
 *      — the path Kevin's browser uses after logging in once.
 *   2. The `X-Admin-Token` header equal to `ADMIN_API_TOKEN` — for
 *      programmatic scripts.
 *   3. The `X-Admin-Token` header equal to `ADMIN_PASSWORD` — legacy
 *      path the old admin pages used; kept until those pages are
 *      retired.
 */
export function verifyAdminToken(request: NextRequest): boolean {
  // 1. Cookie path — preferred for browser-driven admin requests.
  const sessionCookie = request.cookies.get(ADMIN_SESSION_COOKIE);
  if (sessionCookie?.value && decodeSessionCookie(sessionCookie.value)) {
    logger.auth('admin_auth_cookie', true);
    return true;
  }

  // 2 & 3. Header path — scripts, cron, legacy pages.
  const adminToken = process.env.ADMIN_API_TOKEN;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminToken && !adminPassword) {
    logger.warn('Admin authentication not configured (neither ADMIN_API_TOKEN nor ADMIN_PASSWORD is set)');
    return false;
  }

  const requestToken = request.headers.get('X-Admin-Token');

  if (!requestToken) {
    logger.auth('admin_auth_missing_token', false);
    return false;
  }

  const isValid =
    (!!adminToken && requestToken === adminToken) ||
    (!!adminPassword && requestToken === adminPassword);

  logger.auth('admin_auth_attempt', isValid);

  return isValid;
}

/**
 * Require admin authentication - throws error if not authenticated
 */
export function requireAdminAuth(request: NextRequest): void {
  if (!verifyAdminToken(request)) {
    throw new AuthenticationError('Admin authentication required');
  }
}

// ============================================================================
// MOBILE AUTHENTICATION (native app — Apple / Google sign-in)
// ============================================================================

/**
 * Verify a mobile access token from `Authorization: Bearer <token>`.
 *
 * Returns the payload on success. Throws AuthenticationError if:
 *   - no header
 *   - malformed token
 *   - bad signature
 *   - expired
 *   - present in the mobile_token_revocations blacklist (signed out)
 *
 * Called by every authenticated mobile v1 API route.
 */
export async function requireMobileAuth(
  request: NextRequest
): Promise<{ userId: string; email: string }> {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    throw new AuthenticationError('Missing bearer token');
  }
  const token = header.slice('bearer '.length).trim();
  if (!token) throw new AuthenticationError('Empty bearer token');

  let verified;
  try {
    verified = verifyMobileToken(token);
  } catch (err) {
    // Surface expired-vs-invalid so the client can decide whether to
    // silently refresh or force a re-sign-in.
    const message = err instanceof Error ? err.message : 'Invalid token';
    if (message === 'Access token expired') {
      throw new AuthenticationError('tokenExpired');
    }
    throw new AuthenticationError('Invalid access token');
  }

  // Blacklist check — cheap primary-key lookup.
  const revoked = await db
    .select({ tokenHash: mobileTokenRevocations.tokenHash })
    .from(mobileTokenRevocations)
    .where(eq(mobileTokenRevocations.tokenHash, hashToken(token)))
    .limit(1);
  if (revoked.length > 0) {
    throw new AuthenticationError('Token revoked');
  }

  return { userId: verified.payload.userId, email: verified.payload.email };
}

