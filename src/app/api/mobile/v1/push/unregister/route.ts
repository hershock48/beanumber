/**
 * POST /api/mobile/v1/push/unregister
 *
 * Soft-deletes a device row (sets revoked_at=now) so send.ts stops
 * targeting it. The client calls this on sign-out and when the user
 * denies notification permission after previously granting it.
 *
 * Body: { expoPushToken: string }
 * Auth: mobile bearer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { pushDevices } from '@/lib/db/schema';
import { requireMobileAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  let viewer;
  try {
    viewer = await requireMobileAuth(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 401 });
  }

  let body: { expoPushToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const token = (body.expoPushToken ?? '').trim();
  if (!token) {
    return NextResponse.json(
      { error: 'expoPushToken is required' },
      { status: 400 }
    );
  }

  // Only revoke rows this user owns. Prevents a signed-in user from
  // burning a token that belongs to somebody else's device.
  const updated = await db
    .update(pushDevices)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(pushDevices.expoPushToken, token),
        eq(pushDevices.userId, viewer.userId)
      )
    )
    .returning({ id: pushDevices.id });

  logger.info('[push/unregister] device revoked', {
    userId: viewer.userId,
    updated: updated.length,
  });

  return NextResponse.json({ ok: true, revoked: updated.length });
}

export const dynamic = 'force-dynamic';
