/**
 * Sponsor Login Verification API
 * Handles sponsor authentication with email and sponsor code
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { findSponsorshipByCredentials } from '@/lib/airtable';
import { logger } from '@/lib/logger';
import {
  createErrorResponse,
  createSuccessResponse,
  AuthenticationError,
  withErrorHandling,
} from '@/lib/errors';
import { validateLoginCredentials, parseRequestBody } from '@/lib/validation';
import { checkLoginRateLimit } from '@/lib/rate-limit';
import { SESSION, SUCCESS_MESSAGES, ERROR_MESSAGES } from '@/lib/constants';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'POST';
  const path = '/api/sponsor/verify';

  logger.apiRequest(method, path);

  // Rate limiting
  const rateLimitError = checkLoginRateLimit(request);
  if (rateLimitError) {
    throw rateLimitError;
  }

  // Parse and validate request body
  const bodyResult = await parseRequestBody(request);
  if (!bodyResult.success) {
    throw new AuthenticationError(bodyResult.error);
  }

  const validationResult = validateLoginCredentials(bodyResult.data);
  if (!validationResult.success) {
    throw new AuthenticationError(validationResult.error);
  }

  const { email, code } = validationResult.data!;

  // Verify credentials against database
  logger.auth('login_attempt', true, {
    email: logger.maskEmail(email),
    code: logger.maskSponsorCode(code),
  });

  const sponsorship = await findSponsorshipByCredentials(email, code);

  if (!sponsorship) {
    logger.auth('login_failed', false, {
      email: logger.maskEmail(email),
      code: logger.maskSponsorCode(code),
      reason: 'invalid_credentials',
    });

    throw new AuthenticationError(ERROR_MESSAGES.INVALID_CREDENTIALS);
  }

  const fields = sponsorship.fields;

  // Create session cookie
  const cookieStore = await cookies();
  const expires = new Date();
  expires.setTime(expires.getTime() + SESSION.MAX_AGE * 1000);

  const sessionData = {
    email: fields.SponsorEmail,
    sponsorCode: fields.SponsorCode,
    expires: expires.toISOString(),
  };

  // Set secure session cookie
  cookieStore.set(SESSION.COOKIE_NAME, JSON.stringify(sessionData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires,
    path: SESSION.PATH,
  });

  logger.auth('login_success', true, {
    email: logger.maskEmail(fields.SponsorEmail),
    sponsorCode: logger.maskSponsorCode(fields.SponsorCode),
  });

  logger.apiResponse(method, path, 200);

  return createSuccessResponse(
    {
      sponsorCode: fields.SponsorCode,
      name: fields.SponsorName || '',
    },
    SUCCESS_MESSAGES.LOGIN_SUCCESS
  );
}

export const POST = withErrorHandling(handler, 'POST', '/api/sponsor/verify');
