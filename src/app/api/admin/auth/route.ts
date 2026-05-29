/**
 * Admin auth — verify password and issue an HMAC-signed session cookie.
 *
 * Accepts either:
 *   - POST body `{ "password": "..." }` (new flow, used by /admin/login)
 *   - X-Admin-Token header equal to ADMIN_PASSWORD (legacy flow used by
 *     the old dashboard code; kept so any leftover internal references
 *     don't break before migration is done)
 *
 * On success, sets the `ban_admin_session` cookie (30-day TTL) and
 * returns 200. On failure, returns 401 with no cookie set.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  issueSessionCookie,
  verifyAdminPassword,
} from '@/lib/admin-session';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest): Promise<NextResponse> {
  logger.apiRequest('POST', '/api/admin/auth');

  let candidate = '';
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.password === 'string') candidate = body.password;
  } catch {
    // ignore
  }
  if (!candidate) {
    const headerToken = request.headers.get('X-Admin-Token');
    if (headerToken) candidate = headerToken;
  }

  if (!candidate) {
    logger.apiResponse('POST', '/api/admin/auth', 400);
    return NextResponse.json(
      { ok: false, message: 'Password required' },
      { status: 400 }
    );
  }

  const role = verifyAdminPassword(candidate);
  if (!role) {
    logger.apiResponse('POST', '/api/admin/auth', 401);
    return NextResponse.json(
      { ok: false, message: 'Wrong password' },
      { status: 401 }
    );
  }

  await issueSessionCookie(role);
  logger.apiResponse('POST', '/api/admin/auth', 200);
  return NextResponse.json({ ok: true, role });
}
