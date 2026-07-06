/**
 * Admin: update an existing newsletter draft
 *
 * POST /api/admin/newsletter/update
 *
 * Body: { id, title?, subject?, bodyHtml?, author?, status?, sendDate? }
 *
 * Only changed fields need to be sent. Refuses to mutate newsletters
 * already Sent or actively Sending — those are immutable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/errors';
import { requireAdminAuth } from '@/lib/auth';
import { parseRequestBody } from '@/lib/validation';
import { db } from '@/lib/db/client';
import { newsletters } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'POST';
  const path = '/api/admin/newsletter/update';
  logger.apiRequest(method, path);

  requireAdminAuth(request);

  const bodyResult = await parseRequestBody(request);
  if (!bodyResult.success) {
    throw new ValidationError(bodyResult.error!);
  }

  const body = bodyResult.data as {
    id?: string;
    title?: string;
    subject?: string;
    teaser?: string;
    bodyHtml?: string;
    author?: string;
    status?: 'Draft' | 'Scheduled';
    sendDate?: string | null;
  };

  if (!body.id) throw new ValidationError('id is required');

  const existing = (
    await db.select().from(newsletters).where(eq(newsletters.id, body.id)).limit(1)
  )[0];
  if (!existing) throw new ValidationError('Newsletter not found');

  if (existing.status === 'Sent' || existing.status === 'Sending') {
    throw new ValidationError(
      `Cannot edit a newsletter with status "${existing.status}". Create a new draft instead.`
    );
  }

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title.trim();
  if (body.subject !== undefined) patch.subject = body.subject.trim();
  if (body.teaser !== undefined) patch.teaser = body.teaser.trim();
  if (body.bodyHtml !== undefined) patch.bodyHtml = body.bodyHtml;
  if (body.author !== undefined) patch.author = body.author.trim();
  if (body.status !== undefined) patch.status = body.status;
  if (body.sendDate !== undefined) {
    patch.sendDate = body.sendDate ? new Date(body.sendDate) : null;
  }

  const finalStatus = (patch.status as string | undefined) ?? existing.status;
  const finalSendDate =
    patch.sendDate !== undefined ? patch.sendDate : existing.sendDate;
  if (finalStatus === 'Scheduled' && !finalSendDate) {
    throw new ValidationError('sendDate is required when status is Scheduled');
  }

  if (Object.keys(patch).length === 0) {
    throw new ValidationError('Nothing to update');
  }
  patch.updatedAt = new Date();

  const updatedRows = await db
    .update(newsletters)
    .set(patch)
    .where(eq(newsletters.id, body.id))
    .returning();
  const updated = updatedRows[0];

  logger.info('Admin updated newsletter', {
    id: body.id,
    fieldKeys: Object.keys(patch).filter(k => k !== 'updatedAt'),
  });

  logger.apiResponse(method, path, 200);
  return createSuccessResponse(
    {
      id: updated.id,
      title: updated.title,
      status: updated.status,
    },
    'Newsletter updated'
  );
}

export const POST = withErrorHandling(handler, 'POST', '/api/admin/newsletter/update');
