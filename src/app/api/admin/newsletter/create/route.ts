/**
 * Admin: create a new newsletter draft
 *
 * POST /api/admin/newsletter/create
 *
 * Body: { title, subject, bodyHtml, author?, status?, sendDate? }
 *
 * Defaults Status to Draft. Status='Scheduled' requires sendDate.
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

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'POST';
  const path = '/api/admin/newsletter/create';
  logger.apiRequest(method, path);

  requireAdminAuth(request);

  const bodyResult = await parseRequestBody(request);
  if (!bodyResult.success) {
    throw new ValidationError(bodyResult.error!);
  }

  const body = bodyResult.data as {
    title?: string;
    subject?: string;
    teaser?: string;
    bodyHtml?: string;
    author?: string;
    status?: 'Draft' | 'Scheduled';
    sendDate?: string;
  };

  if (!body.title?.trim()) throw new ValidationError('title is required');
  if (!body.subject?.trim()) throw new ValidationError('subject is required');
  if (!body.bodyHtml?.trim()) throw new ValidationError('bodyHtml is required');

  const status = body.status ?? 'Draft';
  if (status === 'Scheduled' && !body.sendDate) {
    throw new ValidationError('sendDate is required when status is Scheduled');
  }

  const inserted = await db
    .insert(newsletters)
    .values({
      title: body.title.trim(),
      subject: body.subject.trim(),
      teaser: body.teaser?.trim() || null,
      bodyHtml: body.bodyHtml,
      status,
      author: body.author?.trim() || null,
      sendDate: body.sendDate ? new Date(body.sendDate) : null,
    })
    .returning();
  const created = inserted[0];

  logger.info('Admin created newsletter', {
    id: created.id,
    title: created.title,
    status: created.status,
  });

  logger.apiResponse(method, path, 200);
  return createSuccessResponse(
    {
      id: created.id,
      title: created.title,
      status: created.status,
    },
    'Newsletter created'
  );
}

export const POST = withErrorHandling(handler, 'POST', '/api/admin/newsletter/create');
