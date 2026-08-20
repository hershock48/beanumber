/**
 * Top-of-roster "due now" reminder. Three status lines:
 *
 *   1. Report cards — due at the end of the current quarter
 *   2. Letters from kids — due Dec 1
 *   3. This month's campus update — draft saved? word count?
 *
 * Each line shows the date, days remaining, and how many kids/items
 * are still missing the artifact. Color shifts gray → amber → red
 * as the deadline approaches.
 *
 * Server component — pulls the campus-update draft inline. The kid
 * counts come from the roster array already in memory on the parent
 * page (no extra Airtable call).
 */

import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { newsletters } from '@/lib/db/schema';
import { candidateTitlesForMonth } from '@/lib/newsletter-title';

/** Next quarter-end (Mar 31, Jun 30, Sep 30, Dec 31) on/after today. */
function nextReportCardDeadline(): Date {
  const today = new Date();
  const y = today.getFullYear();
  const quarterEnds = [
    new Date(y, 2, 31),
    new Date(y, 5, 30),
    new Date(y, 8, 30),
    new Date(y, 11, 31),
  ];
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (const d of quarterEnds) {
    if (d.getTime() >= startOfToday.getTime()) return d;
  }
  return new Date(y + 1, 2, 31);
}

/** Next Dec 1 (this year or next). */
function nextLetterDeadline(): Date {
  const today = new Date();
  const y = today.getFullYear();
  const dec1 = new Date(y, 11, 1);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (dec1.getTime() >= startOfToday.getTime()) return dec1;
  return new Date(y + 1, 11, 1);
}

/** "Q1" / "Q2" / "Q3" / "Q4" label for a quarter-end date. */
function quarterLabel(d: Date): string {
  return `Q${Math.floor(d.getMonth() / 3) + 1}`;
}

function daysUntil(d: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(d);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function tone(days: number): 'gray' | 'amber' | 'red' {
  if (days <= 7) return 'red';
  if (days <= 30) return 'amber';
  return 'gray';
}

function toneClasses(t: 'gray' | 'amber' | 'red' | 'green'): string {
  switch (t) {
    case 'red':
      return 'bg-red-50 border-red-200 text-red-700';
    case 'amber':
      return 'bg-amber-50 border-amber-200 text-amber-800';
    case 'green':
      return 'bg-green-50 border-green-200 text-green-700';
    default:
      return 'bg-[#f5f0e8] border-[#e8e0d4] text-[#666]';
  }
}

async function fetchThisMonthUpdate(): Promise<{ exists: boolean; wordCount: number }> {
  // Match either the new "{Month} at the campus" title or the legacy
  // "Campus update — <Month> <Year>" title so drafts under the old
  // naming still light up the "Not started / Started" banner.
  try {
    const rows = await db
      .select({ bodyHtml: newsletters.bodyHtml })
      .from(newsletters)
      .where(inArray(newsletters.title, candidateTitlesForMonth(new Date())))
      .limit(1);
    const row = rows[0];
    if (!row) return { exists: false, wordCount: 0 };
    const body = row.bodyHtml || '';
    const wordCount = body
      .replace(/<[^>]+>/g, ' ')
      .split(/\s+/)
      .filter(Boolean).length;
    return { exists: true, wordCount };
  } catch {
    return { exists: false, wordCount: 0 };
  }
}

export async function DeadlinesBanner({
  reportCardsPending,
  lettersPending,
  role,
}: {
  reportCardsPending: number;
  lettersPending: number;
  role: 'admin' | 'simon';
}) {
  const reportDue = nextReportCardDeadline();
  const letterDue = nextLetterDeadline();
  const reportDays = daysUntil(reportDue);
  const letterDays = daysUntil(letterDue);
  const reportTone = tone(reportDays);
  const letterTone = tone(letterDays);
  const update = await fetchThisMonthUpdate();
  const updateTone: 'gray' | 'amber' | 'red' | 'green' =
    update.exists && update.wordCount >= 150
      ? 'green'
      : update.exists
        ? 'amber'
        : 'red';

  const fmtDate = (d: Date) =>
    d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });

  return (
    <div className="mb-6">
      <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
        Due now
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <DeadlineCard
          tone={reportTone}
          label={`${quarterLabel(reportDue)} report cards`}
          due={`Due ${fmtDate(reportDue)} · ${reportDays} day${reportDays === 1 ? '' : 's'}`}
          detail={
            reportCardsPending > 0
              ? `${reportCardsPending} kid${reportCardsPending === 1 ? '' : 's'} waiting — tap to upload`
              : 'All uploaded ✓'
          }
          href="/admin/roster?missing=report-cards"
        />
        <DeadlineCard
          tone={letterTone}
          label="Letters from kids"
          due={`Due ${fmtDate(letterDue)} · ${letterDays} day${letterDays === 1 ? '' : 's'}`}
          detail={
            lettersPending > 0
              ? `${lettersPending} kid${lettersPending === 1 ? '' : 's'} waiting — tap to upload`
              : 'All uploaded ✓'
          }
          href="/admin/roster?missing=letters"
        />
        <DeadlineCard
          tone={updateTone}
          label={`${new Date().toLocaleString('en-US', { month: 'long' })} update`}
          due={
            update.exists
              ? `${update.wordCount} word${update.wordCount === 1 ? '' : 's'} drafted`
              : 'Not started'
          }
          detail={
            role === 'simon'
              ? update.exists
                ? 'Keep adding, or save to send to Kevin'
                : 'Start your monthly update'
              : update.exists
                ? 'Polish in /admin/newsletter'
                : 'Simon hasn’t started yet'
          }
          href="/admin/campus-update"
        />
      </div>
    </div>
  );
}

function DeadlineCard({
  tone,
  label,
  due,
  detail,
  href,
}: {
  tone: 'gray' | 'amber' | 'red' | 'green';
  label: string;
  due: string;
  detail: string;
  href?: string;
}) {
  const cls = toneClasses(tone);
  const body = (
    <div className={`border ${cls} px-3 py-2`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1 opacity-80">
        {label}
      </p>
      <p className="text-sm font-semibold leading-snug">{due}</p>
      <p className="text-xs mt-1 opacity-80">{detail}</p>
    </div>
  );
  if (href) {
    return (
      <a
        href={href}
        className="block cursor-pointer hover:opacity-90 hover:shadow-sm transition-all"
      >
        {body}
      </a>
    );
  }
  return body;
}
