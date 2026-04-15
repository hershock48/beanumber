/**
 * Newsletter Cron Job
 *
 * GET /api/cron/newsletter
 *
 * Runs once a day. Picks up every Newsletters record with Status=Scheduled
 * and SendDate <= now, and sends each one to all active sponsors.
 *
 * Secured by the CRON_SECRET env var (passed as Bearer token by Vercel Cron
 * or as ?secret= for manual testing).
 *
 * To draft + schedule a newsletter:
 *   1. Open the Newsletters table in Airtable.
 *   2. Add a row with Title, Subject, BodyHTML, optional HeroPhoto.
 *   3. Set Status = Scheduled, SendDate = whenever you want it to go out (UTC).
 *   4. Wait; the cron will send it within a day of that timestamp.
 *
 * To send immediately, use POST /api/admin/newsletter/send with { newsletterId }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { findNewslettersDueToSend } from '@/lib/airtable';
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

    for (const record of due) {
      const title = record.fields.Title || '(untitled)';
      const result = await sendCampusNewsletterTool({
        newsletterId: record.id,
      });

      results.push({
        newsletterId: record.id,
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
