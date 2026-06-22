/**
 * Admin: list all newsletters
 *
 * GET /api/admin/newsletter/list
 *
 * Returns every newsletter row, newest first. Powers /admin/newsletter.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createSuccessResponse, withErrorHandling } from '@/lib/errors';
import { requireAdminAuth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { newsletters } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/admin/newsletter/list';
  logger.apiRequest(method, path);

  requireAdminAuth(request);

  const rows = await db
    .select()
    .from(newsletters)
    .orderBy(desc(newsletters.createdAt));

  const out = rows.map(r => ({
    id: r.id,
    createdTime: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    title: r.title || '',
    subject: r.subject || '',
    bodyHtml: r.bodyHtml || '',
    status: r.status || 'Draft',
    sendDate: r.sendDate ? new Date(r.sendDate).toISOString() : null,
    publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
    recipientCount: r.recipientCount ?? 0,
    sentCount: r.sentCount ?? 0,
    failedCount: r.failedCount ?? 0,
    sendNotes: r.sendNotes || '',
    author: r.author || '',
    heroPhoto: r.heroPhotoUrl || null,
    teaser: '', // teaser column not in Postgres schema; preserved as empty for UI compat
  }));

  logger.apiResponse(method, path, 200);
  return createSuccessResponse({ newsletters: out, count: out.length });
}

export const GET = withErrorHandling(handler, 'GET', '/api/admin/newsletter/list');
