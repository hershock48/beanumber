/**
 * POST /api/mobile/v1/auth/sign-out
 *
 * Invalidates the token by inserting a SHA-256 hash of it into the
 * mobile_token_revocations blacklist. Idempotent — a duplicate hash
 * is a no-op courtesy of ON CONFLICT DO NOTHING.
 *
 * Called by the client's signOut() flow after it clears the token
 * from SecureStore. If the token is malformed we still return 200 —
 * the point is to make sure the client considers itself signed out
 * regardless.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { mobileTokenRevocations } from '@/lib/db/schema';
import {
  MOBILE_JWT_TTL_SECONDS,
  hashToken,
  verifyMobileToken,
} from '@/lib/mobile-auth';

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ ok: true });
  }
  const token = header.slice('bearer '.length).trim();
  if (!token) return NextResponse.json({ ok: true });

  // Try to parse the token to get an accurate expires_at for the
  // sweep. If it's malformed, still revoke — set expires_at to
  // "worst-case JWT TTL from now" so the sweep eventually clears it.
  let expiresAt: Date;
  try {
    const { payload } = verifyMobileToken(token, { allowGrace: true });
    expiresAt = new Date(payload.exp * 1000);
  } catch {
    expiresAt = new Date(Date.now() + MOBILE_JWT_TTL_SECONDS * 1000);
  }

  await db
    .insert(mobileTokenRevocations)
    .values({ tokenHash: hashToken(token), expiresAt })
    .onConflictDoNothing({ target: mobileTokenRevocations.tokenHash });

  return NextResponse.json({ ok: true });
}
