/**
 * Admin · Review queue.
 *
 * Surfaces every kid that has a pending structured-field edit from
 * Simon. Each card renders the diff: what&rsquo;s currently public next
 * to what Simon proposed, with Accept / Dismiss buttons per field
 * and an Approve-all shortcut.
 *
 * Sponsors don&rsquo;t see Simon&rsquo;s drafts until Kevin approves them here
 * (or via the editor). This page replaces "scroll the entire roster
 * looking for red dots."
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '../_components/AdminShell';
import { getRoster, type RosterKid } from '@/lib/admin/queries';
import { getAdminRole } from '@/lib/admin-session';
import { ReviewCard } from './ReviewCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const FIELD_LABELS: Record<string, string> = {
  nameMeaning: 'Name meaning',
  familyContext: 'Family',
  loves: 'Loves',
  childQuote: 'Child quote',
  notes: 'Notes',
};

export default async function AdminReviewPage() {
  const role = (await getAdminRole()) || 'admin';
  if (role !== 'admin') {
    // Simon shouldn&rsquo;t see the review queue — these are his own pending
    // edits awaiting Kevin&rsquo;s call. Bounce to roster.
    redirect('/admin/roster');
  }

  const kids = await getRoster();
  const queue = kids
    .filter(k => hasAnyPending(k))
    .sort((a, b) => {
      // Show the freshest Simon edits first &mdash; what he just touched is
      // probably what he wants Kevin&rsquo;s eyes on.
      const ta = a.lastEditedBySimon ? Date.parse(a.lastEditedBySimon) : 0;
      const tb = b.lastEditedBySimon ? Date.parse(b.lastEditedBySimon) : 0;
      return tb - ta;
    });

  return (
    <AdminShell activeTab="review" role={role}>
      <div className="max-w-4xl mx-auto px-5 py-6 md:py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
            Review queue
          </p>
          <h1
            className="text-3xl md:text-4xl text-[#0d0d0d] mb-2"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {queue.length === 0
              ? 'All caught up.'
              : `${queue.length} kid${queue.length === 1 ? '' : 's'} waiting on you.`}
          </h1>
          <p className="text-[#666]">
            {queue.length === 0
              ? 'Nothing pending from Simon right now. New edits show up here as soon as he saves.'
              : 'Simon proposed changes to these kids. Accept what you like, dismiss what you don&rsquo;t. Sponsors don&rsquo;t see any of this until you approve.'}
          </p>
        </div>

        {queue.length === 0 ? (
          <div className="bg-white border border-[#e8e0d4] p-8 text-center">
            <p className="text-[#666] mb-4">
              When Simon saves an edit, that kid lands here.
            </p>
            <Link
              href="/admin/roster"
              className="inline-block px-5 py-3 bg-[#0d0d0d] hover:bg-[#333] text-white text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Open roster
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {queue.map(kid => (
              <ReviewCard key={kid.recordId} kid={kid} labels={FIELD_LABELS} />
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function hasAnyPending(k: RosterKid): boolean {
  if (k.pendingFields && k.pendingFields.length > 0) return true;
  if (k.pendingDraft && Object.keys(k.pendingDraft).length > 0) return true;
  if (k.lastEditedBySimon) return true;
  return false;
}
