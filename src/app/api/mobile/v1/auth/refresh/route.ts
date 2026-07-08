/**
 * POST /api/mobile/v1/auth/refresh
 *
 * Accepts a still-valid or recently-expired (within 7 days) BAN JWT
 * and returns a fresh one. This keeps signed-in users from being
 * kicked back to the sign-in screen every 30 days.
 *
 * The client normally sends the current token in the Authorization
 * header. If it just tried to make a call and got back
 * `{ error: 'tokenExpired' }` from requireMobileAuth(), it calls
 * this endpoint with the same header — the /refresh path uses
 * `allowGrace: true` so verifyMobileToken accepts an expired token
 * that's within the 7-day grace window.
 *
 * If the underlying mobile_users row was deleted (should never
 * happen in practice), we 401 rather than issue a token for a
 * ghost user.
 *
 * The old token is revoked so it can't be reused after refresh.
 */
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { mobileUsers, mobileTokenRevocations } from '@/lib/db/schema';
import {
  MOBILE_JWT_TTL_SECONDS,
  hashToken,
  signMobileToken,
  verifyMobileToken,
} from '@/lib/mobile-auth';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json(
      { error: 'Missing bearer token' },
      { status: 401 }
    );
  }
  const token = header.slice('bearer '.length).trim();
  if (!token) {
    return NextResponse.json({ error: 'Empty bearer token' }, { status: 401 });
  }

  let verified;
  try {
    verified = verifyMobileToken(token, { allowGrace: true });
  } catch (err) {
    logger.warn('[mobile-auth/refresh] verify failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Token cannot be refreshed' },
      { status: 401 }
    );
  }

  // Reject already-revoked tokens on refresh too.
  const revoked = await db
    .select({ tokenHash: mobileTokenRevocations.tokenHash })
    .from(mobileTokenRevocations)
    .where(eq(mobileTokenRevocations.tokenHash, hashToken(token)))
    .limit(1);
  if (revoked.length > 0) {
    return NextResponse.json({ error: 'Token revoked' }, { status: 401 });
  }

  // Confirm the user still exists.
  const [user] = await db
    .select({
      id: mobileUsers.id,
      email: mobileUsers.email,
      linkedSponsorEmail: mobileUsers.linkedSponsorEmail,
    })
    .from(mobileUsers)
    .where(eq(mobileUsers.id, verified.payload.userId))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: 'User no longer exists' }, { status: 401 });
  }

  // Revoke the old token so it can't be reused after we hand out a
  // successor. Best-effort — a duplicate insert (idempotent revoke)
  // would violate the PK, so onConflictDoNothing.
  const oldExpiresAt = new Date(verified.payload.exp * 1000);
  await db
    .insert(mobileTokenRevocations)
    .values({
      tokenHash: hashToken(token),
      expiresAt: oldExpiresAt,
    })
    .onConflictDoNothing({ target: mobileTokenRevocations.tokenHash });

  const { token: newToken } = signMobileToken({
    userId: user.id,
    email: user.email,
  });

  return NextResponse.json({
    accessToken: newToken,
    user: {
      userId: user.id,
      email: user.email,
      hasSponsorships: !!user.linkedSponsorEmail,
    },
  });
}
