/**
 * Admin · Roster manager — grid of every canonical kid (1–53) with
 * a profile-completeness indicator. Tap a card to open the editor
 * for that kid.
 *
 * Server-rendered. Pulls the roster from Airtable, no client-side
 * state. The cards are sorted by shirt number ascending (natural
 * roster order).
 */

import Link from 'next/link';
import { AdminShell } from '../_components/AdminShell';
import { getRoster, type RosterKid } from '@/lib/admin/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminRosterPage() {
  const kids = await getRoster();
  const totalKids = kids.length;
  const fullyComplete = kids.filter(k =>
    k.has.photo && k.has.nameMeaning && k.has.familyContext && k.has.loves && k.has.notes
  ).length;

  return (
    <AdminShell activeTab="roster">
      <div className="max-w-6xl mx-auto px-5 py-6 md:py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
            Roster
          </p>
          <h1
            className="text-3xl md:text-4xl text-[#0d0d0d] mb-2"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            The kids at Hope Bridge.
          </h1>
          <p className="text-[#666]">
            {fullyComplete} of {totalKids} profiles fully written. Tap a card to edit.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {kids.map(kid => (
            <RosterCard key={kid.recordId} kid={kid} />
          ))}
        </div>
      </div>
    </AdminShell>
  );
}

function RosterCard({ kid }: { kid: RosterKid }) {
  const completeness =
    Number(kid.has.photo) +
    Number(kid.has.nameMeaning) +
    Number(kid.has.familyContext) +
    Number(kid.has.loves) +
    Number(kid.has.notes);
  const total = 5;

  return (
    <Link
      href={`/admin/roster/${kid.shirtNumber}`}
      className="block bg-white border border-[#e8e0d4] hover:border-[#D4A843] transition-colors overflow-hidden"
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
        <div className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm px-2 py-1">
          <span className="text-xs font-bold text-[#D4A843]">#{kid.shirtNumber}</span>
        </div>
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

        {/* Five-dot completeness indicator. Filled = field present. */}
        <div className="flex items-center gap-1 mt-3" aria-label={`${completeness} of ${total} fields complete`}>
          {[
            { has: kid.has.photo, label: 'Photo' },
            { has: kid.has.nameMeaning, label: 'Name meaning' },
            { has: kid.has.familyContext, label: 'Family' },
            { has: kid.has.loves, label: 'Loves' },
            { has: kid.has.notes, label: 'Bio' },
          ].map((dot, i) => (
            <span
              key={i}
              title={`${dot.label}: ${dot.has ? '✓' : '—'}`}
              className={`block w-2 h-2 rounded-full ${
                dot.has ? 'bg-[#D4A843]' : 'bg-[#e8e0d4]'
              }`}
            />
          ))}
          <span className="ml-auto text-xs text-[#aaa] tabular-nums">
            {completeness}/{total}
          </span>
        </div>
      </div>
    </Link>
  );
}
