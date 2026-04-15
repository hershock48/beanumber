/**
 * Admin: Send Campus Newsletter
 *
 * POST /api/admin/newsletter/send
 *
 * Body:
 *   { newsletterId: string, force?: boolean, dryRun?: boolean }
 *
 * Requires admin auth. Triggers an immediate send of the named Newsletters
 * record to every active sponsor.
 *
 * For scheduled sends (status=Scheduled + SendDate in the future), the
 * /api/cron/newsletter cron job handles it automatically.
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
import { sendCampusNewsletterTool } from '@/lib/tools/email';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'POST';
  const path = '/api/admin/newsletter/send';

  logger.apiRequest(method, path);

  // Admin auth
  requireAdminAuth(request);

  // Parse body
  const bodyResult = await parseRequestBody(request);
  if (!bodyResult.success) {
    throw new ValidationError(bodyResult.error!);
  }

  const body = bodyResult.data as {
    newsletterId?: string;
    force?: boolean;
    dryRun?: boolean;
  };

  if (!body.newsletterId) {
    throw new ValidationError('newsletterId is required');
  }

  const result = await sendCampusNewsletterTool({
    newsletterId: body.newsletterId,
    force: body.force === true,
    dryRun: body.dryRun === true,
  });

  if (!result.success) {
    throw new ValidationError(result.error || 'Newsletter send failed');
  }

  logger.info('Admin newsletter send completed', {
    newsletterId: body.newsletterId,
    sentCount: result.data?.sentCount,
    failedCount: result.data?.failedCount,
    dryRun: result.data?.dryRun,
  });

  logger.apiResponse(method, path, 200);
  return createSuccessResponse(
    result.data,
    result.data?.dryRun ? 'Dry run complete' : 'Newsletter sent'
  );
}

export const POST = withErrorHandling(handler, 'POST', '/api/admin/newsletter/send');
