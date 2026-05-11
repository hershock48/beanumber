/**
 * Admin Auth Verification
 * Lightweight endpoint that checks admin credentials without touching Airtable.
 * Used by the dashboard login form so auth failures are distinct from data-loading failures.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest): Promise<NextResponse> {
  logger.apiRequest('POST', '/api/admin/auth');

  const isValid = verifyAdminToken(request);

  if (!isValid) {
    logger.apiResponse('POST', '/api/admin/auth', 401);
    return NextResponse.json(
      { ok: false, message: 'Invalid password' },
      { status: 401 }
    );
  }

  logger.apiResponse('POST', '/api/admin/auth', 200);
  return NextResponse.json({ ok: true });
}
