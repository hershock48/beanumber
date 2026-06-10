/**
 * BANNavigation — server wrapper around BANNavigationClient.
 *
 * Reads the sponsor_session cookie on the server and passes a
 * `signedIn` boolean down to the client component so the auth slot
 * in the nav can render the correct CTA. Signed in → "Sign out"
 * form that POSTs to /api/sponsor/logout. Signed out → "Sign in"
 * link to /signin.
 *
 * Doing this server-side avoids a flicker between "no auth" and
 * "auth detected" on initial render, and avoids exposing whether
 * the user is signed in via a non-httpOnly client cookie.
 */

import { cookies } from 'next/headers';
import { SESSION } from '@/lib/constants';
import { BANNavigationClient } from './BANNavigationClient';

interface BANNavigationProps {
  currentPath?: string;
  transparent?: boolean;
}

async function readSignedIn(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION.COOKIE_NAME);
    if (!raw) return false;
    const session = JSON.parse(raw.value);
    if (!session?.email) return false;
    if (new Date(session.expires) < new Date()) return false;
    return true;
  } catch {
    return false;
  }
}

export async function BANNavigation(props: BANNavigationProps) {
  const signedIn = await readSignedIn();
  return <BANNavigationClient {...props} signedIn={signedIn} />;
}
