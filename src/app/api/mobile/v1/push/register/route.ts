/**
 * POST /api/mobile/v1/push/register
 *
 * The mobile client calls this after the user grants notification
 * permission and Expo hands us a push token. Upserts a push_devices
 * row keyed by expoPushToken so a single device is one row even
 * across reinstalls.
 *
 * Body:
 *   {
 *     expoPushToken: string,   // "ExponentPushToken[...]"
 *     platform?: 'ios' | 'android',
 *     tz?: string              // IANA zone from Intl.DateTimeFormat
 *                              // ("America/New_York"). Send library
 *                              // uses it to hold rows outside the
 *                              // recipient's 09:00–20:00 window.
 *   }
 *
 * Auth: mobile bearer.
 *
 * Response:
 *   200 { ok: true, id }
 *   400 { error }
 *   401 { error }
 */
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { pushDevices } from '@/lib/db/schema';
import { requireMobileAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

const EXPO_TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[.+\]$/;

export async function POST(request: NextRequest) {
  let viewer;
  try {
    viewer = await requireMobileAuth(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    const status = message === 'tokenExpired' ? 401 : 401;
    return NextResponse.json({ error: message }, { status });
  }

  let body: {
    expoPushToken?: string;
    platform?: string;
    tz?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const token = (body.expoPushToken ?? '').trim();
  if (!token || !EXPO_TOKEN_RE.test(token)) {
    return NextResponse.json(
      { error: 'expoPushToken must be a valid Expo push token' },
      { status: 400 }
    );
  }
  const platform = (body.platform ?? '').trim() || null;
  if (platform && !['ios', 'android'].includes(platform)) {
    return NextResponse.json(
      { error: 'platform must be ios or android' },
      { status: 400 }
    );
  }
  const tz = (body.tz ?? '').trim() || null;

  // Upsert on expo_push_token. Reinstalls generate the same token so
  // the row stays alive; a new device gets a new token and a new row.
  // If the token was previously registered to a different user
  // (device transferred), overwrite user_id so the newer sign-in owns
  // it — Expo's device-level dedup means one token = one live device
  // at a time.
  const rows = await db
    .insert(pushDevices)
    .values({
      userId: viewer.userId,
      expoPushToken: token,
      platform,
      tz,
    })
    .onConflictDoUpdate({
      target: pushDevices.expoPushToken,
      set: {
        userId: viewer.userId,
        platform,
        tz,
        lastSeenAt: sql`now()`,
        // Un-revoke on re-register — if the user turned notifications
        // back on, we want them live again without a manual sweep.
        revokedAt: null,
      },
    })
    .returning({ id: pushDevices.id });

  logger.info('[push/register] device registered', {
    userId: viewer.userId,
    id: rows[0]?.id,
    platform,
    tz,
  });

  return NextResponse.json({ ok: true, id: rows[0]?.id });
}

export const dynamic = 'force-dynamic';
