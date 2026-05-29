/**
 * Admin: list all newsletters
 *
 * GET /api/admin/newsletter/list
 *
 * Returns every newsletter row, newest first. Powers /admin/newsletter.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
} from '@/lib/errors';
import { requireAdminAuth } from '@/lib/auth';
import { listAllNewsletters } from '@/lib/airtable';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/admin/newsletter/list';
  logger.apiRequest(method, path);

  requireAdminAuth(request);

  const records = await listAllNewsletters();

  // Strip down to what the UI needs — keeps payload light and makes it
  // obvious what fields the editor expects.
  const newsletters = records.map((r) => ({
    id: r.id,
    createdTime: r.createdTime,
    title: r.fields.Title || '',
    subject: r.fields.Subject || '',
    bodyHtml: r.fields.BodyHTML || '',
    status: r.fields.Status || 'Draft',
    sendDate: r.fields.SendDate || null,
    publishedAt: r.fields.PublishedAt || null,
    recipientCount: r.fields.RecipientCount ?? 0,
    sentCount: r.fields.SentCount ?? 0,
    failedCount: r.fields.FailedCount ?? 0,
    sendNotes: r.fields.SendNotes || '',
    author: r.fields.Author || '',
    heroPhoto: r.fields.HeroPhoto?.[0]?.url || null,
    teaser: r.fields.Teaser || '',
  }));

  logger.apiResponse(method, path, 200);
  return createSuccessResponse({ newsletters, count: newsletters.length });
}

export const GET = withErrorHandling(handler, 'GET', '/api/admin/newsletter/list');
