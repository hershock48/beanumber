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
import { getRoster, type RosterKid } from '@/lib/admin/queries';
import { getAdminRole } from '@/lib/admin-session';
import { AddKidButton } from './AddKidButton';
import { DeadlinesBanner } from './DeadlinesBanner';

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
            <p className="text-[#D4A843] text-sm mt-2 font-semibold">
              {pendingReview} kid{pendingReview === 1 ? '' : 's'} have edits from Simon waiting for your review (red dot).
            </p>
          )}
        </div>

        <DeadlinesBanner
          reportCardsPending={reportCardsPending}
          lettersPending={lettersPending}
          role={role}
        />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {kids.map(kid => (
            <RosterCard key={kid.recordId} kid={kid} role={role} />
          ))}
          <AddKidButton />
        </div>
      </div>
    </AdminShell>
  );
}

function RosterCard({ kid, role }: { kid: RosterKid; role: 'admin' | 'simon' }) {
  const completeness =
    Number(kid.has.photo) +
    Number(kid.has.nameMeaning) +
    Number(kid.has.familyContext) +
    Number(kid.has.loves) +
    Number(kid.has.notes);
  const total = 5;

  // Per-field pending status. Photo doesn't go through the pending
  // tracker — uploads are immediate and don't need polish — so it
  // can only be empty or published.
  const isPending = (key: string) =>
    role === 'admin' && kid.pendingFields.includes(key);

  // "Fully complete and reviewed" — all 5 dots are content-filled AND
  // none of the four content-tracked fields are pending review. That
  // earns the kid a celebration badge in place of the dot strip.
  const allFilledAndReviewed =
    completeness === total &&
    !isPending('NameMeaning') &&
    !isPending('FamilyContext') &&
    !isPending('Loves') &&
    !isPending('Notes');

  return (
    <Link
      href={`/admin/roster/${kid.shirtNumber}`}
      className={`block bg-white border ${
        role === 'admin' && (kid.hasPendingIntake || !!kid.lastEditedBySimon)
          ? 'border-red-400 ring-2 ring-red-100'
          : 'border-[#e8e0d4]'
      } hover:border-[#D4A843] transition-colors overflow-hidden relative`}
    >
      <div className="aspect-[4/5] bg-[#f5f0e8] relative">
        {kid.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={kid.photoUrl}
            alt={kid.displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-3xl opacity-30">👤</p>
          </div>
        )}
        {role === 'admin' && (kid.hasPendingIntake || !!kid.lastEditedBySimon) && (
          <div className="absolute top-2 left-2 w-3 h-3 rounded-full bg-red-500 ring-2 ring-white" title="Simon edited this kid — review and polish" />
        )}
        {role === 'admin' && kid.deletionRequestedAt && (
          <div
            className="absolute bottom-2 left-2 inline-flex items-center justify-center bg-red-600 text-white w-6 h-6 text-xs ring-2 ring-white"
            title="Deletion requested — review in editor"
            aria-hidden
          >
            🗑
          </div>
        )}
        {/* Gold ★ for the current Student of the Month; red ★ for a
            pending pick (admin sees both, Simon sees only the gold). */}
        {kid.studentOfMonth && (
          <span
            className="absolute top-2 right-2 inline-flex items-center justify-center bg-[#D4A843] text-[#0d0d0d] w-7 h-7 text-base font-bold ring-2 ring-white"
            title={`Student of the Month · ${kid.studentOfMonth}`}
            aria-hidden
          >
            ★
          </span>
        )}
        {role === 'admin' && !kid.studentOfMonth && kid.pendingSOTMMonth && (
          <span
            className="absolute top-2 right-2 inline-flex items-center justify-center bg-red-500 text-white w-7 h-7 text-base font-bold ring-2 ring-white"
            title={`Pending SOTM pick · ${kid.pendingSOTMMonth}`}
            aria-hidden
          >
            ★
          </span>
        )}
      </div>

      <div className="p-3">
        <p
          className="text-base text-[#0d0d0d] leading-snug truncate"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          {kid.displayName}
        </p>
        {kid.gradeClass && (
          <p className="text-xs text-[#888] mt-1 truncate">{kid.gradeClass}</p>
        )}

        {/* Completeness indicator. Three dot states:
             - gray:   field empty
             - red:    field has unpublished Simon edits (admin only)
             - orange: field filled and reviewed (published)
            When all five are filled AND reviewed, the strip collapses
            into a single green check badge — the celebration state. */}
        {allFilledAndReviewed ? (
          <div className="flex items-center gap-2 mt-3">
            <span
              className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-bold uppercase tracking-wider px-2 py-1 border border-green-200"
              title="All five fields filled and reviewed"
            >
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4L9 11.6l6.3-6.3a1 1 0 011.4 0z" clipRule="evenodd" />
              </svg>
              Complete
            </span>
            <span className="ml-auto text-xs text-[#aaa] tabular-nums">{completeness}/{total}</span>
          </div>
        ) : (
          <div
            className="flex items-center gap-1 mt-3"
            aria-label={`${completeness} of ${total} fields complete`}
          >
            {[
              { has: kid.has.photo, label: 'Photo', pendingKey: null },
              { has: kid.has.nameMeaning, label: 'Name meaning', pendingKey: 'NameMeaning' },
              { has: kid.has.familyContext, label: 'Family', pendingKey: 'FamilyContext' },
              { has: kid.has.loves, label: 'Loves', pendingKey: 'Loves' },
              { has: kid.has.notes, label: 'Bio', pendingKey: 'Notes' },
            ].map((dot, i) => {
              const pending = dot.pendingKey ? isPending(dot.pendingKey) : false;
              const color = pending
                ? 'bg-red-500'
                : dot.has
                  ? 'bg-[#D4A843]'
                  : 'bg-[#e8e0d4]';
              const status = pending
                ? 'unpublished — Simon edited'
                : dot.has
                  ? '✓'
                  : '—';
              return (
                <span
                  key={i}
                  title={`${dot.label}: ${status}`}
                  className={`block w-2 h-2 rounded-full ${color}`}
                />
              );
            })}
            <span className="ml-auto text-xs text-[#aaa] tabular-nums">
              {completeness}/{total}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
