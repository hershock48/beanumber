/**
 * Admin logout — clear the session cookie. Idempotent.
 */
import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/admin-session';
import { logger } from '@/lib/logger';

export async function POST(): Promise<NextResponse> {
  logger.apiRequest('POST', '/api/admin/logout');
  await clearSessionCookie();
  logger.apiResponse('POST', '/api/admin/logout', 200);
  return NextResponse.json({ ok: true });
}
