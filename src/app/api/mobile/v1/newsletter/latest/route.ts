/**
 * GET /api/mobile/v1/newsletter/latest
 *
 * The most recent published campus newsletter. Powers the mobile
 * "News" tab. Returns 200 with a null id when there's no published
 * newsletter yet — the client shows a "no newsletter yet" empty state
 * instead of erroring.
 *
 * Uses getRecentCampusNewsletters(1) — same read path the web /news
 * page uses so mobile stays in lockstep with the web.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createSuccessResponse, withErrorHandling } from '@/lib/errors';
import { requireMobileAuth } from '@/lib/auth';
import { getRecentCampusNewsletters } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface MobileNewsletterLatestResponse {
  id: string | null;
  title: string;
  subject: string;
  teaser: string;
  heroPhotoUrl: string | null;
  bodyHtml: string;
  publishedAt: string | null;
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/mobile/v1/newsletter/latest';
  logger.apiRequest(method, path);

  await requireMobileAuth(request);

  const rows = await getRecentCampusNewsletters(1);
  const latest = rows[0];

  const body: MobileNewsletterLatestResponse = latest
    ? {
        id: latest.id,
        title: latest.title,
        subject: latest.subject,
        // The teaser column is a separate field on the newsletters row
        // that getRecentCampusNewsletters doesn't currently expose;
        // derive one from the first ~200 chars of the body HTML with
        // tags stripped. The web renders the full body — mobile home
        // shows just the tease card.
        teaser: extractTeaser(latest.bodyHtml, 200),
        heroPhotoUrl: latest.heroPhotoUrl ?? null,
        bodyHtml: latest.bodyHtml,
        publishedAt: latest.publishedAt ?? null,
      }
    : {
        id: null,
        title: '',
        subject: '',
        teaser: '',
        heroPhotoUrl: null,
        bodyHtml: '',
        publishedAt: null,
      };

  logger.apiResponse(method, path, 200);
  return createSuccessResponse(body);
}

/**
 * Very simple HTML → teaser. Strips tags, collapses whitespace, and
 * truncates. Good enough for a card tease; not intended for sanitizing
 * user-authored input elsewhere.
 */
function extractTeaser(html: string, max: number): string {
  if (!html) return '';
  const stripped = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length <= max) return stripped;
  return `${stripped.slice(0, max - 1).trimEnd()}…`;
}

export const GET = withErrorHandling(
  handler,
  'GET',
  '/api/mobile/v1/newsletter/latest'
);
