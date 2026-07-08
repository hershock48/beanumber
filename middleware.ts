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

/**
 * CORS: the mobile v1 API is called by native app runtimes (which
 * don't enforce CORS) AND by Kevin's browser-based development
 * previews via `expo start --web` (which do). Open CORS wide for
 * anything under /api/mobile/v1/*. This surface is bearer-token
 * auth'd, so opening CORS doesn't leak anything — a browser without
 * a token can't do anything past the auth endpoints, and the auth
 * endpoints themselves need a valid Apple/Google identity token
 * (or the env-gated dev-sign-in flag).
 */
function withMobileCors(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, DELETE, PATCH, OPTIONS'
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Mobile v1 API: attach CORS on every response and short-circuit
  // OPTIONS preflight with 204.
  if (pathname.startsWith('/api/mobile/v1/')) {
    if (request.method === 'OPTIONS') {
      return withMobileCors(new NextResponse(null, { status: 204 }));
    }
    return withMobileCors(NextResponse.next());
  }

  // Admin session gate (unchanged).
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
  matcher: ['/admin/:path*', '/api/mobile/v1/:path*'],
};
