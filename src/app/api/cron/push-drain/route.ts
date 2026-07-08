/**
 * GET /api/cron/push-drain
 *
 * Hourly companion to sendPush(). sendPush queues rows with
 * scheduled_for set to the recipient's next local 09:00 when the
 * event lands outside their 09:00–20:00 window. This cron picks up
 * every row whose scheduled_for has passed and hasn't sent, applies
 * the caps a second time (a queued row from last night can be over-
 * cap by morning), then ships to Expo.
 *
 * Secured with CRON_SECRET, same pattern as /api/cron/drip.
 */
import { NextRequest, NextResponse } from 'next/server';
import { drainDelayed } from '@/lib/push/send';
import { logger } from '@/lib/logger';

function validateCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== 'production';
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7) === cronSecret;
  }
  const { searchParams } = new URL(request.url);
  return searchParams.get('secret') === cronSecret;
}

export async function GET(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await drainDelayed();
    logger.info('[cron/push-drain] complete', result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error('[cron/push-drain] failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
