/**
 * Admin Updates Submit API
 * Allows field team to submit updates (REQUIRES ADMIN AUTH)
 */

import { NextRequest, NextResponse } from 'next/server';
import { submitUpdate } from '@/lib/airtable';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  createdResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/errors';
import { requireAdminAuth } from '@/lib/auth';
import { validateUpdateSubmission, parseRequestBody } from '@/lib/validation';
import { checkUpdateSubmissionRateLimit } from '@/lib/rate-limit';
import { SUCCESS_MESSAGES } from '@/lib/constants';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'POST';
  const path = '/api/admin/updates/submit';

  logger.apiRequest(method, path);

  // CRITICAL: Require admin authentication
  requireAdminAuth(request);

  // Rate limiting
  const rateLimitError = checkUpdateSubmissionRateLimit(request);
  if (rateLimitError) {
    throw rateLimitError;
  }

  // Parse request body (handle both JSON and FormData)
  let data: any;

  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const bodyResult = await parseRequestBody(request);
    if (!bodyResult.success) {
      throw new ValidationError(bodyResult.error!);
    }
    data = bodyResult.data;
  } else if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    data = {
      childId: formData.get('childId'),
      sponsorCode: formData.get('sponsorCode'),
      updateType: formData.get('updateType'),
      title: formData.get('title'),
      content: formData.get('content'),
      submittedBy: formData.get('submittedBy'),
      // Note: Photo upload handling would go here
    };
  } else {
    throw new ValidationError('Invalid content type');
  }

  // Validate input
  const validation = validateUpdateSubmission(data);
  if (!validation.success) {
    throw new ValidationError(validation.error!);
  }

  const updateData = validation.data!;

  // Submit update to Airtable
  const record = await submitUpdate(updateData);

  logger.info('Update submitted by admin', {
    updateId: record.id,
    childId: updateData.childId,
    type: updateData.updateType,
    submittedBy: updateData.submittedBy,
  });

  logger.apiResponse(method, path, 201);

  return createdResponse(
    { updateId: record.id },
    SUCCESS_MESSAGES.UPDATE_SUBMITTED
  );
}

export const POST = withErrorHandling(handler, 'POST', '/api/admin/updates/submit');
