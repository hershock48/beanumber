/**
 * Admin · Donor profile.
 *
 * Server-rendered shell. Pulls the donor + linked sponsorships + linked
 * donations + interactions in one fetch (see getDonorById), renders the
 * static structure (header, stats, sponsoring cards, timeline), and
 * hands the interactive bits (notes, Mark contacted, Add interaction)
 * off to the client component <DonorProfileActions>.
 *
 * Admin only — Simon doesn't see donor data. Middleware enforces the
 * /admin/* gate; this page additionally redirects Simon to the roster
 * if he ever lands here.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '../../_components/AdminShell';
import { getAdminRole } from '@/lib/admin-session';
import { getDonorById, type TimelineEvent } from '@/lib/admin/donor';
import { DonorProfileActions } from './DonorProfileActions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
}

function fmtMoney(dollars: number): string {
  if (dollars === 0) return '$0';
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

function fmtRelative(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return fmtDate(iso);
  const days = Math.round((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days < 0) return `in ${-days}d`;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

function monthsBetween(start: string | null): number | null {
  if (!start) return null;
  const t = new Date(start).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / (1000 * 60 * 60 * 24 * 30.44)));
}

export default async function DonorProfilePage({ params }: Props) {
  const role = (await getAdminRole()) || 'admin';
  if (role === 'simon') redirect('/admin/roster');

  const { id } = await params;
  if (!id || !id.startsWith('rec')) notFound();

  const donor = await getDonorById(id);
  if (!donor) notFound();

  const monthsAsDonor = monthsBetween(donor.donorSince);

  return (
    <AdminShell activeTab="home" role={role}>
      <div className="max-w-3xl mx-auto px-5 py-6 md:py-10">
        <Link
          href="/admin"
          className="inline-flex items-center text-sm text-[#888] hover:text-[#0d0d0d] mb-6"
        >
          ← Back to admin
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h1
            className="text-3xl md:text-4xl text-[#0d0d0d] mb-1"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {donor.name}
          </h1>
          {donor.organization && (
            <p className="text-[#666] mb-1">{donor.organization}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#666]">
            {donor.email && (
              <a
                href={`mailto:${donor.email}`}
                className="hover:text-[#D4A843] hover:underline"
              >
                {donor.email}
              </a>
            )}
            {donor.phone && <span>{donor.phone}</span>}
            {donor.address && <span>{donor.address}</span>}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {donor.recurringSupporter && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-[#D4A843] text-[#0d0d0d] px-2 py-0.5">
                Recurring
              </span>
            )}
            {donor.status && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-[#f5f0e8] text-[#666] px-2 py-0.5">
                {donor.status}
              </span>
            )}
            {donor.donorSince && (
              <span className="text-xs text-[#888]">
                Donor since {fmtDate(donor.donorSince)}
              </span>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-8 border border-[#e8e0d4] bg-white">
          <Stat label="Lifetime giving" value={fmtMoney(donor.lifetimeGiving)} />
          <Stat
            label="Active sponsorships"
            value={String(donor.activeSponsorshipCount)}
            sub={
              donor.monthlySponsorshipTotal > 0
                ? `${fmtMoney(donor.monthlySponsorshipTotal)}/mo`
                : undefined
            }
          />
          <Stat
            label="Months as donor"
            value={monthsAsDonor != null ? String(monthsAsDonor) : '—'}
          />
          <Stat
            label="Last gift"
            value={fmtDate(donor.mostRecentDonation)}
            sub={
              donor.mostRecentDonation
                ? fmtRelative(donor.mostRecentDonation)
                : undefined
            }
          />
        </div>

        {/* Sponsoring */}
        {donor.sponsorships.length > 0 && (
          <section className="mb-8">
            <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-3">
              Sponsoring
            </p>
            <div className="space-y-2">
              {donor.sponsorships.map(s => (
                <div
                  key={s.recordId}
                  className="flex items-center gap-3 border border-[#e8e0d4] bg-white px-3 py-2"
                >
                  {s.childPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.childPhotoUrl}
                      alt=""
                      className="w-12 h-14 object-cover bg-[#f5f0e8] flex-shrink-0"
                    />
                  ) : (
                    <span className="w-12 h-14 bg-[#f5f0e8] flex items-center justify-center text-xl opacity-30 flex-shrink-0">
                      👤
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#0d0d0d] truncate">
                      {s.childName || 'Unknown kid'}
                      {s.childShirtNumber ? (
                        <span className="text-[#aaa] font-normal ml-2">
                          #{s.childShirtNumber}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-[#666]">
                      {s.status || 'Unknown'}
                      {s.startDate ? ` · since ${fmtDate(s.startDate)}` : ''}
                      {s.monthlyAmount
                        ? ` · ${fmtMoney(s.monthlyAmount)}/mo`
                        : ''}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {s.childShirtNumber && (
                      <>
                        <Link
                          href={`/admin/roster/${s.childShirtNumber}`}
                          className="text-xs text-[#D4A843] hover:underline whitespace-nowrap"
                        >
                          Edit profile →
                        </Link>
                        <Link
                          href={`/children/${s.childShirtNumber}`}
                          target="_blank"
                          className="text-xs text-[#888] hover:text-[#0d0d0d] whitespace-nowrap"
                        >
                          Public page ↗
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Drip status */}
        {donor.dripPipeline && (
          <section className="mb-8">
            <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
              Drip status
            </p>
            <div className="border border-[#e8e0d4] bg-white px-3 py-2 text-sm">
              <p className="text-[#0d0d0d] font-semibold">
                {donor.dripPipeline}
                {donor.dripStage ? ` · stage ${donor.dripStage}` : ''}
              </p>
              <p className="text-xs text-[#666] mt-0.5">
                {donor.dripNextSend
                  ? `Next email ${fmtDate(donor.dripNextSend)}`
                  : 'No more emails scheduled'}
                {donor.dripChildName ? ` · about ${donor.dripChildName}` : ''}
              </p>
            </div>
          </section>
        )}

        {/* Last contact */}
        <section className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
            Last contact
          </p>
          <p className="text-sm text-[#0d0d0d]">
            {donor.lastContactAt ? (
              <>
                {fmtDate(donor.lastContactAt)}{' '}
                <span className="text-[#888]">
                  · {fmtRelative(donor.lastContactAt)}
                </span>
                {donor.lastContactSummary ? (
                  <span className="text-[#666] block text-xs mt-1">
                    {donor.lastContactSummary}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-[#888]">
                No interactions logged yet. Hit{' '}
                <span className="font-semibold">Mark contacted</span> below the
                next time you reach out.
              </span>
            )}
          </p>
        </section>

        {/* Notes (editable) + actions */}
        <DonorProfileActions
          donorRecordId={donor.recordId}
          donorFirstName={donor.name.split(/\s+/)[0] || donor.name}
          initialNotes={donor.notes}
        />

        {/* Timeline */}
        <section className="mt-10">
          <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-3">
            Timeline
          </p>
          {donor.timeline.length === 0 ? (
            <p className="text-sm text-[#888]">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {donor.timeline.slice(0, 100).map((ev, i) => (
                <TimelineRow key={i} ev={ev} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="p-3 border-r border-b border-[#e8e0d4] last:border-r-0 md:border-b-0">
      <p className="text-[10px] uppercase tracking-[0.15em] text-[#aaa] mb-1">
        {label}
      </p>
      <p className="text-base font-bold text-[#0d0d0d]">{value}</p>
      {sub && <p className="text-xs text-[#888] mt-0.5">{sub}</p>}
    </div>
  );
}

function TimelineRow({ ev }: { ev: TimelineEvent }) {
  const iconByKind: Record<string, string> = {
    donation: '💵',
    sponsorship_started: '★',
    sponsorship_ended: '✕',
    shirt_ordered: '👕',
    shirt_shipped: '📦',
    interaction: '✉',
  };
  const icon = iconByKind[ev.kind] || '·';
  const d = new Date(ev.at);
  const dateLabel = Number.isNaN(d.getTime())
    ? ev.at
    : d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      });
  return (
    <li className="flex gap-3 items-start py-1.5 border-b border-[#f5f0e8] last:border-b-0">
      <span className="text-xs text-[#aaa] w-16 flex-shrink-0 pt-0.5 tabular-nums">
        {dateLabel}
      </span>
      <span className="w-4 flex-shrink-0 text-center text-sm leading-tight pt-0.5" aria-hidden>
        {icon}
      </span>
      <span className="text-sm text-[#0d0d0d] flex-1 min-w-0">
        {ev.summary}
        {ev.detail ? (
          <span className="block text-xs text-[#666] mt-0.5 leading-snug">
            {ev.detail}
          </span>
        ) : null}
      </span>
    </li>
  );
}
