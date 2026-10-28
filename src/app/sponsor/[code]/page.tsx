import { redirect } from 'next/navigation';

/**
 * /sponsor/BAN-YYYY-NNN was the code-keyed sponsor portal, retired
 * 2026-10-28. The kid page and /me are the portal now; a signed-in
 * sponsor lands on their kids from /signin. The code in the URL is
 * ignored on purpose: it was never a secret and never a session.
 */
export default function SponsorCodeRedirect() {
  redirect('/signin');
}
