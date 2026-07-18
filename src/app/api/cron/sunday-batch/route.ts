/**
 * GET /api/cron/sunday-batch — the weekly letter-day ping.
 *
 * Runs Sunday 13:00 UTC (vercel.json). Letters physically travel in
 * the Sunday batch from the campus, so once a week the app asks the
 * one on-brand question: "Anything for Desmond before it goes?"
 *
 * Recipients: every mobile user with at least one live push device
 * AND at least one Active monthly sponsorship. Holders are excluded
 * — they can't write yet, so the ping would be an upsell disguised
 * as a reminder, which is exactly the kind of push that gets the
 * app's notification permission revoked.
 *
 * Personalization: the user's first monthly kid by claim recency
 * (mine-kids row order). One push per user per Sunday — threadId is
 * sunday-batch:<date>, and sendPush's daily caps apply on top.
 *
 * Secured with CRON_SECRET, same pattern as /api/cron/push-drain.
 */
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { getMobileMineKidsForEmails } from '@/lib/db/queries';
import { sendPush } from '@/lib/push/send';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

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

  // Guard: only fire on Sunday (campus calendar = UTC+3; at the
  // 13:00 UTC cron slot the UTC date and Omoro date agree). A manual
  // mid-week invocation with ?force=1 skips the guard for testing.
  const now = new Date();
  const force = new URL(request.url).searchParams.get('force') === '1';
  if (now.getUTCDay() !== 0 && !force) {
    return NextResponse.json({ ok: true, skipped: 'not_sunday' });
  }
  const batchDate = now.toISOString().slice(0, 10);

  // Every user with ≥1 live push device, plus their provider and
  // linked emails in one pass.
  const users = await db.execute<{
    user_id: string;
    email: string;
    linked_sponsor_email: string | null;
  }>(sql`
    SELECT DISTINCT mu.id AS user_id, mu.email, mu.linked_sponsor_email
    FROM mobile_users mu
    JOIN push_devices pd ON pd.user_id = mu.id AND pd.revoked_at IS NULL
  `);

  let sent = 0;
  let skippedNoMonthly = 0;
  let failed = 0;

  for (const u of users) {
    try {
      const emails = [u.email, u.linked_sponsor_email].filter(
        (v): v is string => !!v
      );
      const rows = await getMobileMineKidsForEmails(emails);
      const monthly = rows.find(
        r =>
          r.status === 'Active' &&
          Number(r.monthlyAmount ?? 0) > 0 &&
          (r.claimedShirtNumber ?? r.shirtNumber) != null &&
          r.firstName
      );
      if (!monthly) {
        skippedNoMonthly += 1;
        continue;
      }
      const result = await sendPush({
        kind: 'sundayBatch',
        recipientUserId: u.user_id,
        kidFirstName: monthly.firstName as string,
        kidShirtNumber: (monthly.claimedShirtNumber ??
          monthly.shirtNumber) as number,
        batchDate,
      });
      if (result.sent > 0 || result.queued > 0) sent += 1;
    } catch (err) {
      failed += 1;
      logger.error('[cron/sunday-batch] per-user send failed', {
        userId: u.user_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('[cron/sunday-batch] done', {
    candidates: users.length,
    sent,
    skippedNoMonthly,
    failed,
  });
  return NextResponse.json({
    ok: true,
    candidates: users.length,
    sent,
    skippedNoMonthly,
    failed,
  });
}
