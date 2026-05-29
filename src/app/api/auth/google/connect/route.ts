/**
 * GET /api/auth/google/connect
 *
 * Kicks off the Gmail OAuth flow. Generates a CSRF state, stashes it
 * in a short-lived cookie, and redirects to Google's consent screen.
 * Google bounces back to /api/auth/google/callback with ?code= and
 * ?state= after the user grants permission.
 *
 * Admin-only — we don't want random visitors initiating OAuth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { verifyAdminToken } from '@/lib/auth';
import { buildAuthUrl, gmailOAuthConfigured } from '@/lib/gmail/oauth';

export async function GET(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  if (!gmailOAuthConfigured()) {
    return NextResponse.redirect(
      new URL('/admin/connect-gmail?error=not_configured', request.url)
    );
  }

  const state = randomBytes(24).toString('hex');
  const url = buildAuthUrl(state);

  const res = NextResponse.redirect(url);
  res.cookies.set('ban_gmail_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes — OAuth round-trip should take seconds
    path: '/',
  });
  return res;
}
