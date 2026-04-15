import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import Link from 'next/link';
import { SponsorDashboard } from '@/components/SponsorDashboard';

interface SponsorPageProps {
  // Next 15+ passes params as a Promise.
  params: Promise<{ code: string }>;
}

/**
 * Portal metadata.
 *
 * This URL is only ever meant for the authenticated sponsor who owns the
 * code. If they paste the link into Slack, iMessage, or anywhere else, the
 * link preview must not reveal which child is behind it (or that this
 * person is even a sponsor). So:
 *
 *   - title/description are generic portal copy, no child name, no code.
 *   - robots: noindex, nofollow — search engines should never index
 *     per-sponsor URLs, since the `code` itself is sensitive.
 *   - no OG image — a rendered card with the BAN logo is fine; a rendered
 *     card with a child's photo would be a privacy problem.
 *   - twitter card is "summary" (small, no image) rather than
 *     "summary_large_image" for the same reason.
 *
 * We do not hit Airtable here — the only identifier we have is the URL
 * segment, which we treat as untrusted until the session cookie is
 * validated in the render path below.
 */
export function generateMetadata(): Metadata {
  return {
    title: 'Sponsor Portal · Be A Number',
    description:
      'Private sponsor portal. Sign in to see updates about the child you sponsor.',
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
      },
    },
    openGraph: {
      title: 'Be A Number · Sponsor Portal',
      description: 'Private portal for Be A Number sponsors.',
      images: undefined,
    },
    twitter: {
      card: 'summary',
      title: 'Be A Number · Sponsor Portal',
      description: 'Private portal for Be A Number sponsors.',
    },
  };
}

async function getSponsorSession(code: string) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('sponsor_session');

  if (!sessionCookie) {
    return null;
  }

  try {
    const session = JSON.parse(sessionCookie.value);

    // Check if session is expired
    if (new Date(session.expires) < new Date()) {
      return null;
    }

    // Verify sponsor code matches
    if (session.sponsorCode !== code) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export default async function SponsorPage({ params }: SponsorPageProps) {
  const { code } = await params;
  const session = await getSponsorSession(code);

  if (!session) {
    redirect('/sponsor/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <Logo className="h-8 w-8 text-gray-900" />
              <span className="text-xl font-semibold text-gray-900">Be A Number</span>
            </Link>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Sponsor Code: {code}</span>
              <form action="/api/sponsor/logout" method="POST">
                <button
                  type="submit"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      {/* Dashboard */}
      <SponsorDashboard sponsorCode={code} email={session.email} />
    </div>
  );
}
