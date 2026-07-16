/**
 * /signin — the site-wide sign-in page.
 *
 * Replaces the modal/overlay approach (which never worked cleanly on
 * iPhone Safari — keyboard overlap, viewport sizing, layering). A
 * dedicated route is the standard pattern for a reason: no scrim
 * fights, no z-index puzzles, no min-height tricks. Just a page.
 *
 * Query params:
 *   ?n=38      pre-fill the shirt number (used when arriving from
 *              /[N]'s claim card)
 *   ?next=/foo redirect target after the magic link is clicked
 *              (handled in /api/sponsor/recover/callback)
 *
 * Same backend mechanism as before: POST to /api/sponsor/recover/send-link
 * with email + optional shirt number. Server handles sign-in,
 * first-time claim, and email-only lookup transparently.
 */

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { SignInForm } from './SignInForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
  // Utility page — nothing for a search result. noindex keeps the
  // crawl budget on the pages that convert.
  robots: { index: false, follow: true },
};

export default function SignInPage() {
  return (
    <div className="bg-[#FFF8F0] min-h-screen flex flex-col">
      <BANNavigation currentPath="/signin" />
      <main className="flex-1 flex items-start justify-center px-4 py-8 md:py-16">
        <div className="w-full max-w-md">
          <Suspense fallback={null}>
            <SignInForm />
          </Suspense>
        </div>
      </main>
      <BANFooter />
    </div>
  );
}
