/**
 * Admin Updates List API
 * Lists all pending child_updates for admin review (REQUIRES ADMIN AUTH)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createSuccessResponse, withErrorHandling } from '@/lib/errors';
import { requireAdminAuth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { childUpdates, children } from '@/lib/db/schema';
import { desc, eq, or, sql } from 'drizzle-orm';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/admin/updates/list';
  logger.apiRequest(method, path);

  requireAdminAuth(request);

  // Pending = anything not yet Published / not yet Sent. Mirrors the
  // legacy filter `{Status}="Pending" OR {Status}="Pending Review"`.
  const rows = await db
    .select({
      id: childUpdates.id,
      childIdLegacy: childUpdates.childIdLegacy,
      sponsorCode: childUpdates.sponsorCode,
      updateType: childUpdates.updateType,
      title: childUpdates.title,
      content: childUpdates.content,
      status: childUpdates.status,
      requestedBySponsor: childUpdates.requestedBySponsor,
      requestedAt: childUpdates.requestedAt,
      submittedBy: childUpdates.submittedBy,
      submittedAt: childUpdates.submittedAt,
      photoUrls: childUpdates.photoUrls,
      createdAt: childUpdates.createdAt,
      kidChildIdLegacy: sql<string | null>`coalesce(${children.childId}, child_legacy.child_id)`,
    })
    .from(childUpdates)
    .leftJoin(children, eq(children.id, childUpdates.childId))
    .leftJoin(
      sql`children as child_legacy`,
      sql`child_legacy.child_id = ${childUpdates.childIdLegacy}`
    )
    .where(
      or(
        eq(childUpdates.status, 'Pending'),
        eq(childUpdates.status, 'Pending Review')
      )
    )
    .orderBy(desc(childUpdates.submittedAt), desc(childUpdates.createdAt));

  const updates = rows.map(r => ({
    id: r.id,
    childId: r.kidChildIdLegacy || r.childIdLegacy || '',
    sponsorCode: r.sponsorCode || '',
    updateType: r.updateType || '',
    title: r.title || '',
    content: r.content || '',
    photos: (r.photoUrls || []).map((url: string) => ({
      url,
      filename: url.split('/').pop() || '',
    })),
    status: r.status || '',
    requestedBySponsor: r.requestedBySponsor ?? false,
    requestedAt: r.requestedAt ? new Date(r.requestedAt).toISOString() : null,
    submittedBy: r.submittedBy || '',
    submittedAt: r.submittedAt ? new Date(r.submittedAt).toISOString() : null,
    createdTime: r.createdAt ? new Date(r.createdAt).toISOString() : null,
  }));

  logger.info('Listed pending updates for admin', {
    count: updates.length,
  });
  logger.apiResponse(method, path, 200);

  return createSuccessResponse({
    updates,
    count: updates.length,
  });
}

export const GET = withErrorHandling(handler, 'GET', '/api/admin/updates/list');
