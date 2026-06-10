/**
 * POST /api/sponsor/logout — clears the sponsor_session cookie and
 * sends the user home.
 *
 * Called from the nav "Sign out" form. We use 303 (See Other) so the
 * browser switches the POST to a GET on /, which is the right
 * behavior for a post-form redirect.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION } from '@/lib/constants';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION.COOKIE_NAME);

  const home = new URL(
    '/',
    process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'
  );
  return NextResponse.redirect(home, 303);
}
