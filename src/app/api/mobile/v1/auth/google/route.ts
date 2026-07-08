/**
 * POST /api/mobile/v1/auth/google
 *
 * Same contract as the Apple endpoint. Native app sends `{ idToken }`
 * from expo-auth-session (Google provider). We verify against Google's
 * JWKS, extract email + Google sub, upsert mobile_users row, link
 * to any matching sponsorship, and mint a 30-day BAN JWT.
 *
 * Errors: 400 for bad payload, 401 for token verification failure.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyGoogleIdToken, signMobileToken } from '@/lib/mobile-auth';
import { findOrCreateMobileUser } from '@/lib/mobile-users';
import { logger } from '@/lib/logger';

const schema = z.object({
  idToken: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let verified;
  try {
    verified = await verifyGoogleIdToken(parsed.data.idToken);
  } catch (err) {
    logger.warn('[mobile-auth/google] verify failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Google identity token could not be verified' },
      { status: 401 }
    );
  }

  if (!verified.emailVerified) {
    return NextResponse.json(
      { error: 'Email not verified by Google' },
      { status: 401 }
    );
  }

  const { user, hasSponsorships } = await findOrCreateMobileUser({
    provider: 'google',
    sub: verified.sub,
    email: verified.email,
  });

  const { token } = signMobileToken({ userId: user.id, email: user.email });

  return NextResponse.json({
    accessToken: token,
    user: {
      userId: user.id,
      email: user.email,
      hasSponsorships,
    },
  });
}
