/**
 * GET /api/mobile/v1/newsletter/[id]
 *
 * One published newsletter by id. The mobile newsletter screen was
 * fetching /latest regardless of which issue was tapped — correct
 * only by coincidence while every entry point happened to point at
 * the newest issue. This route makes the id real, so pushes and
 * cards for older issues open the issue they name.
 *
 * Response shape mirrors /newsletter/latest exactly (the client
 * reuses the same type). Unknown / unpublished id → 404.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
  NotFoundError,
} from '@/lib/errors';
import { requireMobileAuth } from '@/lib/auth';
import { getNewsletterById } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function handler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/mobile/v1/newsletter/[id]';
  logger.apiRequest(method, path);

  await requireMobileAuth(request);

  const { id } = await context.params;
  const n = await getNewsletterById(id);
  if (!n) {
    throw new NotFoundError('Newsletter not found');
  }

  logger.apiResponse(method, path, 200);
  return createSuccessResponse({
    id: n.id,
    title: n.title,
    subject: n.subject,
    teaser: n.teaser ?? '',
    heroPhotoUrl: n.heroPhotoUrl ?? null,
    bodyHtml: n.bodyHtml,
    publishedAt: n.publishedAt ?? null,
  });
}

export const GET = withErrorHandling(
  handler,
  'GET',
  '/api/mobile/v1/newsletter/[id]'
);
