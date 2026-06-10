/**
 * GET /api/session/status — tiny cookie-presence check.
 *
 * Returns { signedIn: boolean } based on whether the viewer has a
 * valid (non-expired) sponsor_session cookie. Used by the nav so
 * client-component pages (HomePageContent, ShirtsPageContent, the
 * rep dashboard) can render the correct auth slot.
 *
 * Doesn't reveal the email, sponsor code, or any other session
 * contents — just a boolean. The cookie itself is httpOnly, so the
 * client can't read it directly; this endpoint is the read path.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION.COOKIE_NAME);
    if (!raw) return NextResponse.json({ signedIn: false });
    const session = JSON.parse(raw.value);
    if (!session?.email) return NextResponse.json({ signedIn: false });
    if (new Date(session.expires) < new Date()) {
      return NextResponse.json({ signedIn: false });
    }
    return NextResponse.json({ signedIn: true });
  } catch {
    return NextResponse.json({ signedIn: false });
  }
}
