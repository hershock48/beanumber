/**
 * Admin · Batches.
 *
 * Read-only view of every shirt-number batch. Each batch row shows
 * the range, the snapshot size, and a sample of the cycle. Useful
 * for verifying the seeded historical batches match expectations
 * and for visually confirming the cycle math.
 *
 * Open-a-new-batch flow is a follow-up commit.
 *
 * Admin only.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '../_components/AdminShell';
import { getAdminRole } from '@/lib/admin-session';
import { listBatches, resolveShirtToKid } from '@/lib/cycle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

async function fetchKidNames(
  recordIds: string[]
): Promise<Map<string, { displayName: string; shirtNumber: number | null }>> {
  const map = new Map<
    string,
    { displayName: string; shirtNumber: number | null }
  >();
  if (recordIds.length === 0) return map;
  // Batch the fetches to avoid hammering Airtable.
  await Promise.all(
    recordIds.map(async id => {
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        CHILDREN_TABLE
      )}/${id}`;
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        const f = data.fields || {};
        map.set(id, {
          displayName:
            (f.DisplayName as string) ||
            (f.FirstName as string) ||
            '(unnamed)',
          shirtNumber: (f.ShirtNumber as number) ?? null,
        });
      } catch {
        // skip
      }
    })
  );
  return map;
}

export default async function BatchesPage() {
  const role = (await getAdminRole()) || 'admin';
  if (role === 'simon') redirect('/admin/roster');

  const batches = await listBatches();
  const allIds = Array.from(
    new Set(batches.flatMap(b => b.snapshot).filter(Boolean))
  );
  const kidNames = await fetchKidNames(allIds);

  // Pull a verification sample: 6 known shirt numbers + the kid they
  // resolve to. Helps spot wrong seeds at a glance.
  const sampleShirts = [1, 28, 53, 54, 99, 150];
  const samples = await Promise.all(
    sampleShirts.map(async n => {
      const r = await resolveShirtToKid(n, batches);
      const kid = r ? kidNames.get(r.childRecordId) : null;
      return {
        n,
        kid: kid?.displayName || '—',
        batch: r?.batch.name || '—',
        position: r?.positionInBatch ?? null,
      };
    })
  );

  return (
    <AdminShell activeTab="home" role={role}>
      <div className="max-w-5xl mx-auto px-5 py-6 md:py-10">
        <Link
          href="/admin"
          className="inline-flex items-center text-sm text-[#888] hover:text-[#0d0d0d] mb-6"
        >
          ← Back to admin
        </Link>

        <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
          Batches
        </p>
        <h1
          className="text-3xl md:text-4xl text-[#0d0d0d] mb-3"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          Shirt number cycle.
        </h1>
        <p className="text-[#666] text-sm mb-8 leading-relaxed">
          Each batch defines a block of shirt numbers tied to a locked
          snapshot of the roster. Inside a batch, shirts cycle through
          the snapshot in order. Mid-batch additions to the roster
          wait for the next batch. See{' '}
          <code className="text-xs bg-[#f5f0e8] px-1.5 py-0.5">
            docs/claude/core_model.md
          </code>{' '}
          for the full model.
        </p>

        {/* Verification samples */}
        <section className="mb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
            Sanity check
          </p>
          <p className="text-xs text-[#888] mb-3 leading-relaxed">
            A handful of shirt numbers run through the resolver. If
            these match the kids you expect, the historical batches
            are seeded correctly.
          </p>
          <table className="w-full text-sm border border-[#e8e0d4] bg-white">
            <thead>
              <tr className="bg-[#f5f0e8] text-left text-xs uppercase tracking-wider text-[#666]">
                <th className="px-3 py-2">Shirt</th>
                <th className="px-3 py-2">Resolves to</th>
                <th className="px-3 py-2">In batch</th>
                <th className="px-3 py-2">Snapshot position</th>
              </tr>
            </thead>
            <tbody>
              {samples.map(s => (
                <tr key={s.n} className="border-t border-[#e8e0d4]">
                  <td className="px-3 py-2 font-bold text-[#D4A843]">
                    #{s.n}
                  </td>
                  <td className="px-3 py-2 text-[#0d0d0d]">{s.kid}</td>
                  <td className="px-3 py-2 text-[#666]">{s.batch}</td>
                  <td className="px-3 py-2 text-[#888] tabular-nums">
                    {s.position ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Batches list */}
        <section>
          <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-3">
            Defined batches ({batches.length})
          </p>
          {batches.length === 0 ? (
            <p className="text-sm text-[#888] italic">
              No batches defined yet.
            </p>
          ) : (
            <ul className="space-y-4">
              {batches.map(batch => {
                const total =
                  batch.endShirtNumber - batch.startShirtNumber + 1;
                const cyclesFloat =
                  batch.snapshot.length > 0
                    ? total / batch.snapshot.length
                    : 0;
                return (
                  <li
                    key={batch.id}
                    className="border border-[#e8e0d4] bg-white"
                  >
                    <div className="p-4 md:p-5">
                      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-2">
                        <h2
                          className="text-lg md:text-xl text-[#0d0d0d]"
                          style={{
                            fontFamily: 'var(--font-lora), serif',
                            fontWeight: 600,
                          }}
                        >
                          {batch.name}
                        </h2>
                        <StatusBadge status={batch.status} />
                      </div>
                      <p className="text-sm text-[#666] mb-3">
                        Shirts <span className="text-[#0d0d0d] font-semibold">#{batch.startShirtNumber}</span> –{' '}
                        <span className="text-[#0d0d0d] font-semibold">#{batch.endShirtNumber}</span>
                        {' · '}
                        <span className="text-[#0d0d0d] font-semibold">
                          {batch.snapshot.length}
                        </span>{' '}
                        kid{batch.snapshot.length === 1 ? '' : 's'} in snapshot
                        {' · '}
                        <span className="text-[#0d0d0d] font-semibold">
                          {cyclesFloat.toFixed(2)}
                        </span>{' '}
                        cycle{cyclesFloat === 1 ? '' : 's'}
                      </p>
                      {batch.notes && (
                        <p className="text-xs text-[#888] mb-3 leading-relaxed italic">
                          {batch.notes}
                        </p>
                      )}
                      <details className="text-xs">
                        <summary className="cursor-pointer text-[#D4A843] hover:underline mb-2">
                          Snapshot (first 12 positions)
                        </summary>
                        <ol className="mt-2 space-y-1 text-[#666] pl-4">
                          {batch.snapshot.slice(0, 12).map((id, i) => {
                            const kid = kidNames.get(id);
                            return (
                              <li key={id} className="flex gap-2">
                                <span className="text-[#aaa] tabular-nums w-6 text-right">
                                  {i}
                                </span>
                                <span className="text-[#0d0d0d]">
                                  {kid?.displayName || id}
                                </span>
                                {kid?.shirtNumber != null && (
                                  <span className="text-[#aaa]">
                                    (#{kid.shirtNumber})
                                  </span>
                                )}
                              </li>
                            );
                          })}
                          {batch.snapshot.length > 12 && (
                            <li className="text-[#aaa] pl-8">
                              … {batch.snapshot.length - 12} more
                            </li>
                          )}
                        </ol>
                      </details>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Active'
      ? 'bg-green-50 text-green-700 border-green-200'
      : status === 'Closed'
        ? 'bg-[#f5f0e8] text-[#666] border-[#e8e0d4]'
        : 'bg-amber-50 text-amber-800 border-amber-200';
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider border px-2 py-0.5 ${cls}`}
    >
      {status || 'Unknown'}
    </span>
  );
}
