/**
 * Admin: create a new newsletter draft
 *
 * POST /api/admin/newsletter/create
 *
 * Body: { title, subject, bodyHtml, author?, status?, sendDate? }
 *
 * Defaults Status to Draft. Status=Scheduled is allowed but caller must
 * also supply sendDate; otherwise the cron will pick it up immediately
 * (since IS_BEFORE(BLANK, NOW) is true).
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
import { createNewsletter } from '@/lib/airtable';

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
    bodyHtml?: string;
    author?: string;
    status?: 'Draft' | 'Scheduled';
    sendDate?: string;
    teaser?: string;
  };

  if (!body.title?.trim()) {
    throw new ValidationError('title is required');
  }
  if (!body.subject?.trim()) {
    throw new ValidationError('subject is required');
  }
  if (!body.bodyHtml?.trim()) {
    throw new ValidationError('bodyHtml is required');
  }

  // Defensive: if caller asks for Scheduled, require sendDate so we don't
  // accidentally send to everyone the moment cron next runs.
  const status = body.status ?? 'Draft';
  if (status === 'Scheduled' && !body.sendDate) {
    throw new ValidationError('sendDate is required when status is Scheduled');
  }

  const fields: Record<string, unknown> = {
    Title: body.title.trim(),
    Subject: body.subject.trim(),
    BodyHTML: body.bodyHtml,
    Status: status,
  };
  if (body.author?.trim()) fields.Author = body.author.trim();
  if (body.sendDate) fields.SendDate = body.sendDate;
  if (typeof body.teaser === 'string') fields.Teaser = body.teaser;

  const created = await createNewsletter(fields);

  logger.info('Admin created newsletter', {
    id: created.id,
    title: body.title,
    status,
  });

  logger.apiResponse(method, path, 200);
  return createSuccessResponse(
    {
      id: created.id,
      title: created.fields.Title,
      status: created.fields.Status,
    },
    'Newsletter created'
  );
}

export const POST = withErrorHandling(handler, 'POST', '/api/admin/newsletter/create');
