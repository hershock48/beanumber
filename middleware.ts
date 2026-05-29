/**
 * Next.js middleware — runs on the edge for every matching request.
 *
 * Responsibility: protect every `/admin/*` route with a single check
 * against the HMAC-signed admin session cookie. Unauthenticated
 * requests are redirected to `/admin/login`. The `/admin/login` route
 * itself is exempt (otherwise you couldn't reach the login form).
 *
 * API endpoints under `/api/admin/*` are NOT handled here — they're
 * checked individually via `requireAdminAuth()` in their route
 * handlers, which accepts either the cookie or the legacy
 * X-Admin-Token header (for scripts and cron jobs).
 */

import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, decodeSessionCookie } from '@/lib/admin-session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only guard /admin/* page routes. The login page itself must be
  // reachable without a session.
  if (!pathname.startsWith('/admin')) return NextResponse.next();
  if (pathname === '/admin/login') return NextResponse.next();

  const cookie = request.cookies.get(ADMIN_SESSION_COOKIE);
  const session = decodeSessionCookie(cookie?.value);

  if (session) return NextResponse.next();

  // Redirect to login, preserving the destination so we can bounce
  // back after successful auth.
  const loginUrl = new URL('/admin/login', request.url);
  if (pathname !== '/admin') {
    loginUrl.searchParams.set('next', pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Match all /admin/* routes but skip Next.js internals and static
  // files. /api/admin/* is intentionally not matched — those endpoints
  // do their own auth via requireAdminAuth().
  matcher: ['/admin/:path*'],
};
