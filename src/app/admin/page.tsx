/**
 * Admin OS — triage home.
 *
 * Server-rendered single page. Reads all card data in parallel from
 * Airtable via `getAdminHomeData()`. Each card has a one-line headline,
 * a count or status, and one or two actions. No nav menu — the cards
 * are the nav.
 *
 * Mobile-first single column layout, full-width cards, thumb-reachable
 * buttons. Scales up to a centered max-w-2xl on desktop.
 *
 * Auth: protected by `middleware.ts` — unauthenticated requests are
 * redirected to `/admin/login`. No password prompt here.
 */

import Link from 'next/link';
import { getAdminHomeData } from '@/lib/admin/queries';
import { AdminShell } from './_components/AdminShell';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default async function AdminHomePage() {
  const data = await getAdminHomeData();
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <AdminShell activeTab="home">
      <div className="max-w-2xl mx-auto px-5 py-6 md:py-10">
        {/* Hello */}
        <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
          {today}
        </p>
        <h1
          className="text-3xl md:text-4xl text-[#0d0d0d] mb-8"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          What&rsquo;s waiting on you.
        </h1>

        <div className="space-y-4">
          {/* ── Card: Updates pending publish ────────────────────── */}
          <Card
            label="Updates from the campus"
            urgent={data.pendingUpdates.count > 0}
            error={data.pendingUpdates.error}
          >
            {data.pendingUpdates.count > 0 ? (
              <>
                <Headline>
                  {data.pendingUpdates.count} child update
                  {data.pendingUpdates.count === 1 ? '' : 's'} waiting for you.
                </Headline>
                {data.pendingUpdates.recent.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-[#666]">
                    {data.pendingUpdates.recent.slice(0, 3).map(u => (
                      <li key={u.id}>
                        <span className="font-medium text-[#0d0d0d]">{u.childDisplayName}</span>
                        {' — '}
                        {u.title}
                      </li>
                    ))}
                    {data.pendingUpdates.recent.length > 3 && (
                      <li className="text-[#aaa]">+ {data.pendingUpdates.recent.length - 3} more</li>
                    )}
                  </ul>
                )}
                <Actions>
                  <PrimaryLink href="/admin/dashboard">Review &amp; publish</PrimaryLink>
                </Actions>
              </>
            ) : (
              <CalmState>No updates waiting. Inbox zero.</CalmState>
            )}
          </Card>

          {/* ── Card: Shirts to ship ────────────────────────────── */}
          <Card
            label="Fulfillment"
            urgent={data.shirtsToShip.count > 0}
            error={data.shirtsToShip.error}
          >
            {data.shirtsToShip.count > 0 ? (
              <>
                <Headline>
                  {data.shirtsToShip.count} order{data.shirtsToShip.count === 1 ? '' : 's'} to ship.
                </Headline>
                <p className="mt-2 text-sm text-[#666]">
                  Print packing slips, mark shipped, send tracking.
                </p>
                <Actions>
                  <PrimaryLink href="/admin/fulfillment">Open shipping queue</PrimaryLink>
                </Actions>
              </>
            ) : (
              <CalmState>Nothing to ship. The queue is clear.</CalmState>
            )}
          </Card>

          {/* ── Card: Newsletter due ────────────────────────────── */}
          <Card
            label="Monthly newsletter"
            urgent={data.newsletterDue.due}
            error={data.newsletterDue.error}
          >
            {data.newsletterDue.lastSentAt ? (
              <>
                <Headline>
                  {data.newsletterDue.daysSinceLast !== null
                    ? `${data.newsletterDue.daysSinceLast} days since the last one went out.`
                    : 'Send one when you&rsquo;re ready.'}
                </Headline>
                <p className="mt-2 text-sm text-[#666]">
                  Last sent: {formatRelativeDate(data.newsletterDue.lastSentAt)}
                  {data.newsletterDue.lastSubject && (
                    <> · &ldquo;{data.newsletterDue.lastSubject}&rdquo;</>
                  )}
                </p>
              </>
            ) : (
              <Headline>No newsletter has gone out yet.</Headline>
            )}
            <Actions>
              <PrimaryLink href="/admin/newsletter">
                {data.newsletterDue.due ? 'Compose newsletter' : 'Open editor'}
              </PrimaryLink>
            </Actions>
          </Card>

          {/* ── Card: Sponsor activity ─────────────────────────── */}
          <Card
            label="Sponsors"
            error={data.sponsorActivity.error}
          >
            <Headline>
              {data.sponsorActivity.newThisWeek > 0
                ? `${data.sponsorActivity.newThisWeek} new sponsor${data.sponsorActivity.newThisWeek === 1 ? '' : 's'} this week.`
                : 'No new sponsors this week.'}
            </Headline>
            {data.sponsorActivity.newRecent.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-[#666]">
                {data.sponsorActivity.newRecent.slice(0, 5).map(s => (
                  <li key={s.id}>
                    <span className="font-medium text-[#0d0d0d]">{s.sponsorName}</span>
                    {' → '}
                    {s.childDisplayName}
                  </li>
                ))}
                {data.sponsorActivity.newRecent.length > 5 && (
                  <li className="text-[#aaa]">+ {data.sponsorActivity.newRecent.length - 5} more</li>
                )}
              </ul>
            )}
            <Actions>
              <SecondaryLink href="/admin/sponsors">View all sponsors</SecondaryLink>
            </Actions>
          </Card>

          {/* ── Card: Roster gaps ──────────────────────────────── */}
          <Card
            label="Roster"
            error={data.rosterGaps.error}
          >
            <Headline>
              {data.rosterGaps.fullyComplete} of {data.rosterGaps.totalKids} profiles complete.
            </Headline>
            {data.rosterGaps.totalKids > data.rosterGaps.fullyComplete && (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-[#666]">
                <GapLine label="Missing photo" count={data.rosterGaps.missingPhoto} />
                <GapLine label="Missing name meaning" count={data.rosterGaps.missingNameMeaning} />
                <GapLine label="Missing family" count={data.rosterGaps.missingFamilyContext} />
                <GapLine label="Missing loves" count={data.rosterGaps.missingLoves} />
                <GapLine label="Missing bio" count={data.rosterGaps.missingNotes} />
              </div>
            )}
            <Actions>
              <SecondaryLink href="/admin/roster">Open roster manager</SecondaryLink>
            </Actions>
          </Card>

          {/* ── Card: This month numbers ───────────────────────── */}
          <Card
            label="This month"
            error={data.thisMonth.error}
          >
            <div className="grid grid-cols-2 gap-4">
              <Stat
                value={String(data.thisMonth.newSponsorshipsThisMonth)}
                label="New sponsorships"
              />
              <Stat
                value={formatDollars(data.thisMonth.donationsThisMonthCents)}
                label="Donations this month"
              />
              <Stat
                value={String(data.thisMonth.activeSponsorships)}
                label="Active sponsorships"
              />
              <Stat
                value={`${formatDollars(data.thisMonth.monthlyRecurringCents)}/mo`}
                label="Recurring monthly"
              />
            </div>
          </Card>
        </div>

        <footer className="mt-10 pb-10 text-center text-xs text-[#aaa]">
          One login per device, 30-day session. Logout when you&rsquo;re on a shared computer.
        </footer>
      </div>
    </AdminShell>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Local presentation components
// ────────────────────────────────────────────────────────────────────────

function Card({
  label,
  urgent,
  error,
  children,
}: {
  label: string;
  urgent?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`bg-white border ${
        urgent ? 'border-[#D4A843]' : 'border-[#e8e0d4]'
      } p-5 md:p-6`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
        {label}
      </p>
      {error ? (
        <p className="text-sm text-red-600">
          Couldn&rsquo;t load this card: {error}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xl md:text-2xl text-[#0d0d0d] leading-snug"
      style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
    >
      {children}
    </p>
  );
}

function CalmState({ children }: { children: React.ReactNode }) {
  return <p className="text-base text-[#888]">{children}</p>;
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex flex-wrap gap-3">{children}</div>;
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center bg-[#D4A843] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider px-5 py-3 hover:bg-[#c49a3a] transition-colors"
    >
      {children}
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center bg-white text-[#0d0d0d] font-bold text-xs uppercase tracking-wider px-5 py-3 border border-[#e8e0d4] hover:border-[#D4A843] transition-colors"
    >
      {children}
    </Link>
  );
}

function GapLine({ label, count }: { label: string; count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-base font-bold text-[#0d0d0d] tabular-nums">{count}</span>
      <span className="text-xs uppercase tracking-wider text-[#888]">{label}</span>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p
        className="text-2xl md:text-3xl text-[#0d0d0d] leading-none"
        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
      >
        {value}
      </p>
      <p className="text-xs uppercase tracking-wider text-[#888] mt-1">{label}</p>
    </div>
  );
}
