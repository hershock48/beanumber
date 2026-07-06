/**
 * Admin · Roster manager — grid of every canonical kid with a
 * profile-completeness indicator. Tap a card to open the editor
 * for that kid.
 *
 * Server-rendered. Pulls the roster from Airtable, no client-side
 * state. The cards are sorted by shirt number ascending (natural
 * roster order).
 *
 * Admin (Kevin) sees a red dot on cards Simon has touched since the
 * last review — clicking through to the editor lets Kevin polish the
 * copy and clear the flag. Simon sees the same cards but no dots.
 */

import Link from 'next/link';
import { AdminShell } from '../_components/AdminShell';
import { getRoster } from '@/lib/admin/queries';
import { getAdminRole } from '@/lib/admin-session';
import { DeadlinesBanner } from './DeadlinesBanner';
import { RosterGrid } from './RosterGrid';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminRosterPage() {
  const kids = await getRoster();
  const role = (await getAdminRole()) || 'admin';
  const totalKids = kids.length;
  const fullyComplete = kids.filter(k =>
    k.has.photo && k.has.nameMeaning && k.has.familyContext && k.has.loves && k.has.notes
  ).length;
  // A kid needs Kevin's review when Simon has touched the structured
  // fields recently, OR there's raw intake text sitting in the
  // dedicated notes field. Either way Kevin gets the red dot.
  const pendingReview = kids.filter(
    k => k.hasPendingIntake || !!k.lastEditedBySimon
  ).length;
  // Counts that drive the top-of-page deadlines banner.
  const reportCardsPending = kids.filter(k => !k.hasReportCards).length;
  const lettersPending = kids.filter(k => !k.hasLetters).length;

  return (
    <AdminShell activeTab="roster" role={role}>
      <div className="max-w-6xl mx-auto px-5 py-6 md:py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
            Roster
          </p>
          <h1
            className="text-3xl md:text-4xl text-[#0d0d0d] mb-2"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {role === 'simon' ? 'The kids on the campus.' : 'The kids at Hope Bridge.'}
          </h1>
          <p className="text-[#666]">
            {role === 'simon'
              ? 'Tap a kid to add or update notes. Save when you’re done. Use the + tile at the end to add a new child.'
              : `${fullyComplete} of ${totalKids} profiles fully written. Tap a card to edit.`}
          </p>
          {role === 'admin' && pendingReview > 0 && (
            <Link
              href="/admin/review"
              className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] text-xs font-bold uppercase tracking-wider transition-colors"
            >
              {pendingReview} kid{pendingReview === 1 ? '' : 's'} waiting on you &mdash; open review queue &rarr;
            </Link>
          )}
        </div>

        <DeadlinesBanner
          reportCardsPending={reportCardsPending}
          lettersPending={lettersPending}
          role={role}
        />

        {/* Client-side wrapper: filter (All / Needs finishing), sort
            incompletes to the top, plain-language 'Missing' text on
            each incomplete card. See RosterGrid for the full logic. */}
        <RosterGrid kids={kids} role={role} />
      </div>
    </AdminShell>
  );
}
