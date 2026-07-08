/**
 * POST /api/mobile/v1/auth/apple
 *
 * Native app sends `{ identityToken, nonce }` from
 * expo-apple-authentication. We:
 *   1. Verify the identityToken against Apple's JWKS (RS256).
 *   2. Extract the verified email + Apple sub.
 *   3. Upsert mobile_users row keyed by apple_sub. Link to a
 *      sponsorship by email when one exists.
 *   4. Mint a 30-day BAN JWT and return it.
 *
 * Response shape (see MobileAuthResponse in src/lib/mobile-users.ts):
 *   { accessToken, user: { userId, email, hasSponsorships } }
 *
 * Errors: 400 for bad payload, 401 for token verification failure.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAppleIdentityToken, signMobileToken } from '@/lib/mobile-auth';
import { findOrCreateMobileUser } from '@/lib/mobile-users';
import { logger } from '@/lib/logger';

const schema = z.object({
  identityToken: z.string().min(1),
  nonce: z.string().min(1).optional(),
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

  const { identityToken, nonce } = parsed.data;

  let verified;
  try {
    verified = await verifyAppleIdentityToken(identityToken, nonce);
  } catch (err) {
    logger.warn('[mobile-auth/apple] verify failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Apple identity token could not be verified' },
      { status: 401 }
    );
  }

  if (!verified.emailVerified) {
    // Apple usually verifies before issuing the token, but if we
    // see email_verified=false, refuse to link — otherwise a
    // spoofed private-relay could hijack a real sponsor row.
    return NextResponse.json(
      { error: 'Email not verified by Apple' },
      { status: 401 }
    );
  }

  const { user, hasSponsorships } = await findOrCreateMobileUser({
    provider: 'apple',
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
