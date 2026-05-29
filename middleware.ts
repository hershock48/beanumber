/**
 * Next.js middleware — runs on the Edge runtime for every matching request.
 *
 * Responsibility: protect every `/admin/*` route with a single check
 * against the HMAC-signed admin session cookie. Unauthenticated
 * requests are redirected to `/admin/login`. The `/admin/login` route
 * itself is exempt (otherwise you couldn't reach the login form).
 *
 * Uses Web Crypto (via `admin-session-edge.ts`) because Node's
 * `crypto` module isn't available on the Edge runtime where middleware
 * runs. The Node-side `admin-session.ts` is used by Server Components
 * and Route Handlers.
 *
 * API endpoints under `/api/admin/*` are NOT handled here — they're
 * checked individually via `requireAdminAuth()` in their route
 * handlers, which accepts either the cookie or the legacy
 * X-Admin-Token header (for scripts and cron jobs).
 */

import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, isValidSessionCookieEdge } from '@/lib/admin-session-edge';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/admin')) return NextResponse.next();
  if (pathname === '/admin/login') return NextResponse.next();

  const cookie = request.cookies.get(ADMIN_SESSION_COOKIE);
  if (await isValidSessionCookieEdge(cookie?.value)) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/admin/login', request.url);
  if (pathname !== '/admin') {
    loginUrl.searchParams.set('next', pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*'],
};
