/**
 * POST /api/mobile/v1/auth/dev-sign-in
 *
 * DEV-ONLY endpoint that bypasses Apple/Google verification. Used to
 * preview the mobile app inside Expo Go, which can't run the native
 * expo-apple-authentication module.
 *
 * Gate: only responds when `MOBILE_DEV_AUTH === '1'` is set on the
 * server. Any other env value → 404, as if the route doesn't exist.
 *
 * Body: `{ email: string }` — the email to sign in as. Looks up or
 * creates a mobile_users row for that email, mints a JWT, and returns
 * the same shape as /auth/apple / /auth/google.
 *
 * Removing the env var (or setting it to anything other than '1')
 * cleanly disables the back door before App Store submission.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { signMobileToken } from '@/lib/mobile-auth';
import { findOrCreateMobileUser } from '@/lib/mobile-users';
import { logger } from '@/lib/logger';

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  if (process.env.MOBILE_DEV_AUTH !== '1') {
    // Pretend the route doesn't exist. Never respond with details
    // that hint the endpoint is real but disabled.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase().trim();

  // Allowlist gate. MOBILE_DEV_AUTH_EMAILS is a comma-separated list
  // of emails permitted to use the bypass. While the flag is on in
  // production for Expo Go test drives, this keeps the door from
  // being an any-account backdoor: without the allowlist, anyone who
  // found the endpoint could mint a session for any sponsor's email.
  // Unset/empty → nobody gets in (fail closed, same 404 as disabled).
  const allowed = (process.env.MOBILE_DEV_AUTH_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(email)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Fabricate a stable-per-email 'apple_sub' so re-signing in with the
  // same email lands on the same mobile_users row. Prefix so it can't
  // collide with a real Apple sub (which are 44 chars).
  const fakeSub = `dev_${email.replace(/[^a-z0-9]/g, '_').slice(0, 32)}`;

  const { user, hasSponsorships } = await findOrCreateMobileUser({
    provider: 'apple',
    sub: fakeSub,
    email,
  });

  const { token } = signMobileToken({ userId: user.id, email: user.email });

  logger.warn('[mobile-auth/dev] dev sign-in used', { email, userId: user.id });

  return NextResponse.json({
    accessToken: token,
    user: {
      userId: user.id,
      email: user.email,
      hasSponsorships,
    },
  });
}

export const dynamic = 'force-dynamic';
