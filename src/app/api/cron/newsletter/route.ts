/**
 * Newsletter Cron Job
 *
 * GET /api/cron/newsletter
 *
 * Runs once a day. Picks up every Newsletters row with status='Scheduled'
 * and sendDate <= now, and sends each one through the campus newsletter
 * tool to every active sponsor + emailable non-sponsor donor.
 *
 * Secured by the CRON_SECRET env var (passed as Bearer token by Vercel Cron
 * or as ?secret= for manual testing).
 *
 * To draft + schedule a newsletter:
 *   1. Open the Newsletters admin page.
 *   2. Add a row with title, subject, bodyHtml, optional heroPhotoUrl.
 *   3. Set status='Scheduled', sendDate=whenever you want it to go out (UTC).
 *   4. Wait; the cron will send it within a day of that timestamp.
 *
 * To send immediately, use POST /api/admin/newsletter/send with { newsletterId }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { findNewslettersDueToSend } from '@/lib/db/queries';
import { sendCampusNewsletterTool } from '@/lib/tools/email';

function validateCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // If no secret configured, allow in dev only.
  if (!cronSecret) {
    return process.env.NODE_ENV !== 'production';
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7) === cronSecret;
  }

  const { searchParams } = new URL(request.url);
  return searchParams.get('secret') === cronSecret;
}

export async function GET(request: NextRequest) {
  if (!validateCronAuth(request)) {
    logger.warn('Unauthorized cron request to /api/cron/newsletter');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    logger.info('Cron job started: newsletter');

    const due = await findNewslettersDueToSend();

    if (due.length === 0) {
      logger.info('No newsletters due');
      return NextResponse.json({
        success: true,
        message: 'No newsletters due',
        data: { processed: 0, results: [] },
      });
    }

    const results: Array<{
      newsletterId: string;
      title: string;
      success: boolean;
      sentCount: number;
      failedCount: number;
      error?: string;
    }> = [];

    for (const row of due) {
      const title = row.title || '(untitled)';
      const result = await sendCampusNewsletterTool({
        newsletterId: row.id,
      });

      results.push({
        newsletterId: row.id,
        title,
        success: result.success,
        sentCount: result.data?.sentCount || 0,
        failedCount: result.data?.failedCount || 0,
        error: result.error,
      });
    }

    logger.info('Cron job completed: newsletter', {
      processed: results.length,
      totalSent: results.reduce((sum, r) => sum + r.sentCount, 0),
    });

    return NextResponse.json({
      success: true,
      message: 'Newsletter cron completed',
      data: {
        processed: results.length,
        results,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Cron job failed: newsletter', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
