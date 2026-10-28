import { redirect } from 'next/navigation';

/**
 * The code-based sponsor login was retired 2026-10-28. Sign-in is the
 * magic link at /signin (email in, one tap, no code). This stub keeps
 * old bookmarks and any lingering email links working.
 */
export default function SponsorLoginRedirect() {
  redirect('/signin');
}
