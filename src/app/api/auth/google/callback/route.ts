/**
 * GET /api/auth/google/callback
 *
 * Google redirects back here after the user grants (or denies) the
 * OAuth consent. We verify the CSRF state matches what we set in the
 * connect step, exchange the authorization code for tokens, and store
 * the refresh token in AppSettings.
 *
 * After a successful exchange the admin is bounced to
 * /admin/connect-gmail?status=connected.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import {
  exchangeCodeForTokens,
  fetchUserEmail,
} from '@/lib/gmail/oauth';
import { setSetting, SETTING_KEYS } from '@/lib/admin/settings';

export async function GET(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/connect-gmail?error=${encodeURIComponent(error)}`, request.url)
    );
  }
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const stateCookie = request.cookies.get('ban_gmail_oauth_state')?.value;

  if (!code) {
    return NextResponse.redirect(
      new URL('/admin/connect-gmail?error=missing_code', request.url)
    );
  }
  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    return NextResponse.redirect(
      new URL('/admin/connect-gmail?error=state_mismatch', request.url)
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Shouldn't happen because we ask for prompt=consent + access_type=offline.
      return NextResponse.redirect(
        new URL('/admin/connect-gmail?error=no_refresh_token', request.url)
      );
    }
    const email = await fetchUserEmail(tokens.access_token);
    await setSetting(
      SETTING_KEYS.gmailRefreshToken,
      tokens.refresh_token,
      'Long-lived refresh token Google issued the first time Kevin authorized Gmail send.'
    );
    if (email) {
      await setSetting(
        SETTING_KEYS.gmailAuthorizedEmail,
        email,
        'The Gmail address that granted send-on-behalf-of permission.'
      );
    }

    const res = NextResponse.redirect(
      new URL('/admin/connect-gmail?status=connected', request.url)
    );
    // Clear the state cookie.
    res.cookies.set('ban_gmail_oauth_state', '', {
      maxAge: 0,
      path: '/',
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.redirect(
      new URL(
        `/admin/connect-gmail?error=${encodeURIComponent(message)}`,
        request.url
      )
    );
  }
}
