/**
 * Admin: update an existing newsletter draft
 *
 * POST /api/admin/newsletter/update
 *
 * Body: { id, title?, subject?, bodyHtml?, author?, status?, sendDate? }
 *
 * Only changed fields need to be sent.
 *
 * Refuses to mutate newsletters that have already been Sent or are
 * actively Sending — those are immutable from the editor.
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
import { getNewsletterById, updateNewsletter } from '@/lib/airtable';

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
    bodyHtml?: string;
    author?: string;
    status?: 'Draft' | 'Scheduled';
    sendDate?: string | null;
  };

  if (!body.id) throw new ValidationError('id is required');

  const existing = await getNewsletterById(body.id);
  if (!existing) throw new ValidationError('Newsletter not found');

  const currentStatus = existing.fields.Status;
  if (currentStatus === 'Sent' || currentStatus === 'Sending') {
    throw new ValidationError(
      `Cannot edit a newsletter with status "${currentStatus}". Create a new draft instead.`
    );
  }

  // Build patch object — only include fields the caller actually provided.
  const fields: Record<string, unknown> = {};
  if (body.title !== undefined) fields.Title = body.title.trim();
  if (body.subject !== undefined) fields.Subject = body.subject.trim();
  if (body.bodyHtml !== undefined) fields.BodyHTML = body.bodyHtml;
  if (body.author !== undefined) fields.Author = body.author.trim();
  if (body.status !== undefined) fields.Status = body.status;
  // Allow nulling out send date by passing null explicitly.
  if (body.sendDate !== undefined) fields.SendDate = body.sendDate;

  // Same defensive guard as create: scheduled with no date is dangerous.
  const finalStatus = (fields.Status as string | undefined) ?? currentStatus;
  const finalSendDate =
    fields.SendDate !== undefined ? fields.SendDate : existing.fields.SendDate;
  if (finalStatus === 'Scheduled' && !finalSendDate) {
    throw new ValidationError('sendDate is required when status is Scheduled');
  }

  if (Object.keys(fields).length === 0) {
    throw new ValidationError('Nothing to update');
  }

  const updated = await updateNewsletter(body.id, fields);

  logger.info('Admin updated newsletter', { id: body.id, fieldKeys: Object.keys(fields) });

  logger.apiResponse(method, path, 200);
  return createSuccessResponse(
    {
      id: updated.id,
      title: updated.fields.Title,
      status: updated.fields.Status,
    },
    'Newsletter updated'
  );
}

export const POST = withErrorHandling(handler, 'POST', '/api/admin/newsletter/update');
