'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Update {
  id: string;
  date: string;
  type: string;
  title: string;
  content: string;
  photos: string[];
}

interface SponsorMessage {
  id: string;
  date: string;
  content: string;
  status: string;
}

interface Sponsorship {
  startDate: string | null;
  totalPaid: number;
  monthlyAmount: number;
  monthsActive: number;
}

interface ChildInfo {
  name: string;
  firstName?: string;
  photo?: string;
  age?: string;
  location?: string;
  sponsorshipStartDate?: string;
  birthday?: string;
  homeVillage?: string;
  familyContext?: string;
  loves?: string;
  childQuote?: string;
  teacherName?: string;
  teacherQuote?: string;
  notes?: string;
}

// A single timeline entry — the component merges updates, messages, and
// computed milestones into this shape and sorts chronologically.
interface TimelineEntry {
  id: string;
  date: string;
  kind: 'update' | 'message' | 'milestone';
  // update fields
  type?: string;
  title?: string;
  content?: string;
  photos?: string[];
  // message fields
  messageStatus?: string;
  // milestone fields
  milestoneLabel?: string;
  milestoneIcon?: string;
}

interface SponsorDashboardProps {
  sponsorCode: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Count weekdays (Mon–Fri) between two dates. Uganda school calendar runs
 *  ~40 weeks per year with three terms and holidays, but we approximate with
 *  weekdays and discount 25% for term breaks, which lands close to reality. */
function countSchoolDays(start: Date, end: Date): number {
  let weekdays = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  while (d <= e) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) weekdays++;
    d.setDate(d.getDate() + 1);
  }
  // Discount ~25% for term breaks (Uganda has ~3 months of holidays per year)
  return Math.round(weekdays * 0.75);
}

/** Days between two dates. */
function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

function isBirthdaySoon(birthday: string | undefined): { upcoming: boolean; daysAway: number; dateLabel: string } {
  if (!birthday) return { upcoming: false, daysAway: 999, dateLabel: '' };

  const now = new Date();
  const bday = new Date(birthday);
  // Set birthday to this year
  const thisYear = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  // If it already passed this year, check next year
  const nextOccurrence = thisYear < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
    ? new Date(now.getFullYear() + 1, bday.getMonth(), bday.getDate())
    : thisYear;

  const diffMs = nextOccurrence.getTime() - now.getTime();
  const daysAway = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // Show if within 30 days ahead or 7 days behind (recent)
  const upcoming = daysAway <= 30 && daysAway >= -7;
  const dateLabel = nextOccurrence.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return { upcoming, daysAway, dateLabel };
}

// ---------------------------------------------------------------------------
// Animated counter — counts up from 0 when the element scrolls into view
// ---------------------------------------------------------------------------

function useCountUp(end: number, duration = 1800) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const step = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out quad
            const eased = 1 - (1 - progress) * (1 - progress);
            setCount(Math.round(eased * end));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [end, duration]);

  return { ref, count };
}

function ImpactStat({ end, prefix, sublabel, detail }: {
  end: number;
  prefix?: string;
  sublabel: string;
  detail?: string;
}) {
  const { ref, count } = useCountUp(end);
  return (
    <div ref={ref}>
      <p className="text-2xl md:text-3xl text-[#0d0d0d] font-semibold tabular-nums"
        style={{ fontFamily: 'var(--font-lora), serif' }}>
        {prefix || ''}{count.toLocaleString()}
      </p>
      <p className="text-sm text-[#888] mt-1">{sublabel}</p>
      {detail && <p className="text-xs text-[#bbb] mt-0.5">{detail}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SponsorDashboard({ sponsorCode, email }: SponsorDashboardProps) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [sponsorMessages, setSponsorMessages] = useState<SponsorMessage[]>([]);
  const [childInfo, setChildInfo] = useState<ChildInfo | null>(null);
  const [childRevealed, setChildRevealed] = useState<boolean>(false);
  const [sponsorship, setSponsorship] = useState<Sponsorship>({ startDate: null, totalPaid: 0, monthlyAmount: 25, monthsActive: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [nextRequestEligibleAt, setNextRequestEligibleAt] = useState<string | null>(null);
  const [canRequestUpdate, setCanRequestUpdate] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [requestingUpdate, setRequestingUpdate] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);

  // Write-to-child guided flow state
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [msgStep, setMsgStep] = useState<1 | 2 | 3>(1); // 1 = tell about you, 2 = ask child, 3 = free-text
  const [selectedSharePrompt, setSelectedSharePrompt] = useState<string | null>(null);
  const [shareAnswer, setShareAnswer] = useState('');
  const [selectedAskPrompt, setSelectedAskPrompt] = useState<string | null>(null);

  useEffect(() => {
    loadSponsorData();
  }, [sponsorCode]);

  async function loadSponsorData() {
    try {
      const response = await fetch(`/api/sponsor/updates?sponsorCode=${sponsorCode}`);
      const data = await response.json();

      if (response.ok) {
        setUpdates(data.updates || []);
        setSponsorMessages(data.sponsorMessages || []);
        setChildInfo(data.childInfo || null);
        setChildRevealed(!!data.childRevealed);
        setSponsorship(data.sponsorship || { startDate: null, totalPaid: 0, monthlyAmount: 25, monthsActive: 0 });
        setNextRequestEligibleAt(data.nextRequestEligibleAt);

        if (data.nextRequestEligibleAt) {
          const eligibleDate = new Date(data.nextRequestEligibleAt);
          setCanRequestUpdate(new Date() >= eligibleDate);
        } else {
          setCanRequestUpdate(true);
        }
      }
    } catch (error) {
      console.error('Failed to load sponsor data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // Derive first name early — needed by useMemo below.
  const firstName =
    childInfo?.firstName ||
    childInfo?.name?.split(' ')[0] ||
    'them';

  // Birthday
  const birthdayInfo = isBirthdaySoon(childInfo?.birthday);

  // -------------------------------------------------------------------
  // Build the timeline — merges updates, messages, and milestones
  // -------------------------------------------------------------------
  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [];

    // Sponsorship start
    if (sponsorship.startDate) {
      entries.push({
        id: 'milestone-start',
        date: sponsorship.startDate,
        kind: 'milestone',
        milestoneLabel: `You started sponsoring ${firstName}.`,
        milestoneIcon: 'heart',
      });
    }

    // YDO updates
    for (const u of updates) {
      entries.push({
        id: u.id,
        date: u.date,
        kind: 'update',
        type: u.type,
        title: u.title,
        content: u.content,
        photos: u.photos,
      });
    }

    // Sponsor messages
    for (const m of sponsorMessages) {
      entries.push({
        id: m.id,
        date: m.date,
        kind: 'message',
        content: m.content,
        messageStatus: m.status,
      });
    }

    // Anniversary milestones (month-based)
    if (sponsorship.startDate) {
      const start = new Date(sponsorship.startDate);
      const now = new Date();
      const milestonesMonths = [3, 6, 12, 24, 36, 48, 60];
      for (const m of milestonesMonths) {
        const milestoneDate = new Date(start);
        milestoneDate.setMonth(milestoneDate.getMonth() + m);
        if (milestoneDate <= now) {
          const label = m < 12
            ? `${m} months of sponsorship.`
            : m === 12
              ? `1 year of sponsorship!`
              : `${m / 12} years of sponsorship!`;
          entries.push({
            id: `milestone-${m}mo`,
            date: milestoneDate.toISOString().split('T')[0],
            kind: 'milestone',
            milestoneLabel: label,
            milestoneIcon: m >= 12 ? 'trophy' : 'star',
          });
        }
      }

      // Day-count milestones
      const dayMilestones = [100, 365, 500, 1000];
      for (const d of dayMilestones) {
        const milestoneDate = new Date(start);
        milestoneDate.setDate(milestoneDate.getDate() + d);
        if (milestoneDate <= now) {
          entries.push({
            id: `milestone-${d}days`,
            date: milestoneDate.toISOString().split('T')[0],
            kind: 'milestone',
            milestoneLabel: d === 365
              ? `365 days together.`
              : `${d.toLocaleString()} days of sponsorship.`,
            milestoneIcon: 'calendar',
          });
        }
      }
    }

    // First message milestone
    if (sponsorMessages.length > 0) {
      const firstMsg = [...sponsorMessages].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )[0];
      if (firstMsg) {
        entries.push({
          id: 'milestone-first-message',
          date: firstMsg.date,
          kind: 'milestone',
          milestoneLabel: `You wrote your first message to ${firstName}.`,
          milestoneIcon: 'pencil',
        });
      }
    }

    // Child's birthday (each year since sponsorship started)
    if (childInfo?.birthday && sponsorship.startDate) {
      const start = new Date(sponsorship.startDate);
      const now = new Date();
      const bday = new Date(childInfo.birthday);
      // Add birthday milestone for each year the sponsor has been active
      for (let year = start.getFullYear(); year <= now.getFullYear(); year++) {
        const bdayThisYear = new Date(year, bday.getMonth(), bday.getDate());
        if (bdayThisYear >= start && bdayThisYear <= now) {
          const age = year - bday.getFullYear();
          entries.push({
            id: `milestone-birthday-${year}`,
            date: bdayThisYear.toISOString().split('T')[0],
            kind: 'milestone',
            milestoneLabel: `${firstName} turned ${age}.`,
            milestoneIcon: 'cake',
          });
        }
      }
    }

    // Sort newest first
    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return entries;
  }, [updates, sponsorMessages, sponsorship.startDate, firstName, childInfo?.birthday]);

  // Collect all photos from updates for the gallery
  const allPhotos = useMemo(() => {
    const photos: { url: string; date: string; title: string }[] = [];
    for (const u of updates) {
      if (u.photos?.length) {
        for (const url of u.photos) {
          photos.push({ url, date: u.date, title: u.title });
        }
      }
    }
    return photos;
  }, [updates]);

  // -------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------

  async function handleRequestUpdate() {
    if (!canRequestUpdate || requestingUpdate) return;
    setRequestingUpdate(true);
    setRequestSuccess(false);

    try {
      const response = await fetch('/api/sponsor/request-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorCode, email }),
      });

      if (response.ok) {
        setRequestSuccess(true);
        await loadSponsorData();
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to submit request. Please try again.');
      }
    } catch {
      alert('Failed to submit request. Please try again.');
    } finally {
      setRequestingUpdate(false);
    }
  }

  async function handleSendMessage() {
    // Compose the full message from guided prompts + free text
    const parts: string[] = [];
    if (selectedSharePrompt && shareAnswer.trim()) {
      parts.push(`${selectedSharePrompt}\n${shareAnswer.trim()}`);
    }
    if (selectedAskPrompt) {
      parts.push(`Question for ${firstName || 'the child'}: ${selectedAskPrompt}`);
    }
    if (messageText.trim()) {
      parts.push(messageText.trim());
    }

    const fullMessage = parts.join('\n\n');
    if (!fullMessage || sendingMessage) return;

    setSendingMessage(true);
    setMessageError('');
    setMessageSent(false);

    try {
      const response = await fetch('/api/sponsor/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorCode, email, message: fullMessage }),
      });

      if (response.ok) {
        setMessageSent(true);
        setMessageText('');
        setShareAnswer('');
        setSelectedSharePrompt(null);
        setSelectedAskPrompt(null);
        setMsgStep(1);
        // Reload so the message appears in the timeline
        await loadSponsorData();
      } else {
        const errorData = await response.json();
        setMessageError(errorData.error || 'Failed to send message. Please try again.');
      }
    } catch {
      setMessageError('Failed to send message. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleRevealAnyway() {
    const ok = confirm(
      "Reveal now? The magic of Be A Number is meeting your child when your shirt arrives, but if you'd rather not wait, we won't stop you."
    );
    if (!ok) return;

    setRevealing(true);
    try {
      const res = await fetch('/api/sponsor/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.revealed) {
        await loadSponsorData();
      } else if (data?.reason === 'airtable_patch_failed') {
        alert(
          "Your portal is still being set up on our end. Please try again in a bit, or email kevin@beanumber.org and we'll unlock it for you."
        );
      } else {
        alert('We could not unlock your portal. Please email kevin@beanumber.org.');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setRevealing(false);
    }
  }

  // -------------------------------------------------------------------
  // LOADING STATE
  // -------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#D4A843] mx-auto"></div>
          <p className="mt-4 text-[#888]">Loading your portal...</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // LOCKBOX VIEW
  // -------------------------------------------------------------------
  if (!childRevealed) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 md:py-20">
        <div className="bg-white border border-[#e8e0d4] p-8 md:p-10 text-center">
          <div className="w-14 h-14 bg-[#FFF8F0] border border-[#e8e0d4] rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-[#D4A843]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
            Your sponsorship is active
          </p>

          <h1 className="text-2xl md:text-3xl text-[#0d0d0d] mb-4"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}>
            Your child is waiting for you to open the package.
          </h1>

          <p className="text-[#666] leading-relaxed mb-6 max-w-md mx-auto">
            Be A Number works like this: when your shirt arrives, look at the
            tag. There&rsquo;s a number on it. That number belongs to a real
            child in Northern Uganda. Go to{' '}
            <Link href="/" className="text-[#D4A843] font-medium hover:underline">beanumber.org</Link>,
            enter your number, and meet them.
          </p>

          <p className="text-[#666] leading-relaxed mb-8 max-w-md mx-auto">
            Once you&rsquo;ve met them, this portal will unlock with their
            full profile, updates from our team on the campus, and a place
            to write back.
          </p>

          <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-4 mb-8 text-sm text-[#666] inline-block">
            <p className="mb-1">
              <strong className="text-[#0d0d0d]">Your sponsor code:</strong>{' '}
              <span className="font-mono tracking-wider">{sponsorCode}</span>
            </p>
            <p className="text-xs text-[#aaa]">
              Keep this somewhere safe. You&rsquo;ll use it to log back in.
            </p>
          </div>

          <div className="mb-8">
            <button
              onClick={handleRevealAnyway}
              disabled={revealing}
              className="text-sm text-[#aaa] hover:text-[#D4A843] underline underline-offset-4 transition-colors disabled:opacity-50"
            >
              {revealing ? 'Unlocking...' : "Can't wait? Reveal anyway."}
            </button>
          </div>

          <p className="text-xs text-[#aaa]">
            Questions? Email{' '}
            <a href="mailto:kevin@beanumber.org" className="text-[#D4A843] hover:underline">kevin@beanumber.org</a>
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // FULL DASHBOARD
  // -------------------------------------------------------------------
  const daysUntilCanRequest = nextRequestEligibleAt
    ? Math.max(0, Math.ceil((new Date(nextRequestEligibleAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const hasStructured = Boolean(
    childInfo?.homeVillage || childInfo?.familyContext || childInfo?.loves ||
    childInfo?.childQuote || childInfo?.teacherQuote
  );

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">

      {/* ============================================================
          BIRTHDAY BANNER — shows if birthday is within 30 days
          ============================================================ */}
      {birthdayInfo.upcoming && birthdayInfo.daysAway >= 0 && (
        <div className="bg-[#FFF8F0] border border-[#D4A843] p-4 md:p-5 mb-6 flex items-center gap-4">
          <span className="text-2xl flex-shrink-0" role="img" aria-label="birthday">🎂</span>
          <div>
            <p className="text-[#0d0d0d] font-medium">
              {birthdayInfo.daysAway === 0
                ? `Today is ${firstName}'s birthday!`
                : birthdayInfo.daysAway === 1
                  ? `${firstName}'s birthday is tomorrow.`
                  : `${firstName}'s birthday is ${birthdayInfo.dateLabel} — ${birthdayInfo.daysAway} days away.`}
            </p>
            <p className="text-sm text-[#666] mt-0.5">
              {birthdayInfo.daysAway <= 7
                ? `Write ${firstName} a birthday message using the form below.`
                : `A perfect time to send a note.`}
            </p>
          </div>
        </div>
      )}
      {/* Recent birthday — within last 7 days */}
      {birthdayInfo.upcoming && birthdayInfo.daysAway < 0 && (
        <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-4 md:p-5 mb-6 flex items-center gap-4">
          <span className="text-2xl flex-shrink-0" role="img" aria-label="birthday">🎂</span>
          <p className="text-[#666]">
            {firstName} just had a birthday on {birthdayInfo.dateLabel}. It&rsquo;s not too late to send a message.
          </p>
        </div>
      )}

      {/* ============================================================
          CHILD PROFILE CARD
          ============================================================ */}
      {childInfo && (
        <div className="bg-white border border-[#e8e0d4] p-6 md:p-10 mb-6">
          <div className="grid md:grid-cols-[minmax(0,1fr)_1.6fr] gap-8 md:gap-10 items-start">
            {/* Photo */}
            <div className="aspect-[4/5] bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden relative">
              {childInfo.photo ? (
                <Image src={childInfo.photo} alt={childInfo.name} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-[#aaa] text-sm">Photo coming soon</p>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex flex-col justify-center">
              <h1 className="text-3xl md:text-4xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}>
                {childInfo.name}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-[#777] mb-6">
                {childInfo.age && <span className="text-base">Age {childInfo.age}</span>}
                {childInfo.age && childInfo.location && <span className="text-[#ccc]">&middot;</span>}
                {childInfo.location && <span className="text-base">{childInfo.location}</span>}
              </div>

              {childInfo.childQuote && (
                <div className="mb-6">
                  <p className="text-xl md:text-2xl text-[#0d0d0d] leading-snug"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 500, fontStyle: 'italic' }}>
                    &ldquo;{childInfo.childQuote}&rdquo;
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[#aaa]">— {firstName}</p>
                </div>
              )}

              {hasStructured && (
                <div className="mb-6 space-y-4">
                  {childInfo.homeVillage && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">Home</p>
                      <p className="text-[#444] leading-relaxed">{childInfo.homeVillage}</p>
                    </div>
                  )}
                  {childInfo.familyContext && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">Family</p>
                      <p className="text-[#444] leading-relaxed">{childInfo.familyContext}</p>
                    </div>
                  )}
                  {childInfo.loves && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">What {firstName} loves</p>
                      <p className="text-[#444] leading-relaxed">{childInfo.loves}</p>
                    </div>
                  )}
                </div>
              )}

              {childInfo.teacherQuote && (
                <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-5 mb-6">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">From {firstName}&rsquo;s teacher</p>
                  <p className="text-[#444] leading-relaxed italic">&ldquo;{childInfo.teacherQuote}&rdquo;</p>
                  {childInfo.teacherName && (
                    <p className="mt-3 text-sm text-[#888]">— {childInfo.teacherName}</p>
                  )}
                </div>
              )}

              {!hasStructured && (
                <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-5 mb-6">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">{firstName}&rsquo;s story</p>
                  <p className="text-[#666] leading-relaxed">
                    We&rsquo;re gathering {firstName}&rsquo;s full profile from the campus in Omoro District
                    right now — home, family, what they love, and a note from their teacher.
                    It&rsquo;ll land here as soon as it&rsquo;s in our hands.
                  </p>
                </div>
              )}

              {childInfo.sponsorshipStartDate && (
                <p className="text-sm text-[#888] mt-2">
                  Sponsoring since {formatDate(childInfo.sponsorshipStartDate)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          IMPACT MATH — what your money has done
          ============================================================ */}
      {sponsorship.startDate && (
        <div className="bg-white border border-[#e8e0d4] p-6 md:p-8 mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-4">
            Your partnership so far
          </p>
          {(() => {
            const startDate = new Date(sponsorship.startDate!);
            const now = new Date();
            const days = daysBetween(startDate, now);
            const schoolDays = countSchoolDays(startDate, now);
            const meals = schoolDays * 2; // breakfast + lunch
            const contributed = sponsorship.totalPaid > 0
              ? sponsorship.totalPaid
              : sponsorship.monthsActive * sponsorship.monthlyAmount;
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  <ImpactStat
                    end={days}
                    sublabel={`${days === 1 ? 'day' : 'days'} sponsoring ${firstName}`}
                  />
                  <ImpactStat
                    end={contributed}
                    prefix="$"
                    sublabel="contributed"
                  />
                  <ImpactStat
                    end={meals}
                    sublabel="meals covered"
                    detail="breakfast + lunch, every school day"
                  />
                  <ImpactStat
                    end={schoolDays}
                    sublabel="school days covered"
                    detail="fees, medical care, mentorship"
                  />
                </div>
                <p className="text-xs text-[#aaa] mt-5">
                  ${sponsorship.monthlyAmount}/mo covers breakfast and lunch at the campus, school fees, basic medical care, and mentorship through the YDO team.
                </p>
              </>
            );
          })()}
        </div>
      )}

      {/* ============================================================
          PHOTO GALLERY — if there are photos from updates
          ============================================================ */}
      {allPhotos.length > 0 && (
        <div className="bg-white border border-[#e8e0d4] p-6 md:p-8 mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-4">
            Photos of {firstName}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {allPhotos.slice(0, 8).map((photo, idx) => (
              <div key={idx} className="relative aspect-square bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden group">
                <Image
                  src={photo.url}
                  alt={`${firstName} — ${photo.title || 'update photo'}`}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              </div>
            ))}
          </div>
          {allPhotos.length > 8 && (
            <p className="text-xs text-[#aaa] mt-3">
              {allPhotos.length - 8} more {allPhotos.length - 8 === 1 ? 'photo' : 'photos'} in the timeline below.
            </p>
          )}
        </div>
      )}

      {/* ============================================================
          ACTION ROW — request update + write to child
          ============================================================ */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Request Update */}
        <div className="bg-white border border-[#e8e0d4] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
            Request an Update
          </p>
          {requestSuccess ? (
            <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-4 text-sm text-[#444]">
              <p className="font-medium text-[#0d0d0d] mb-1">Request submitted.</p>
              <p className="text-[#666]">
                Our team on the ground at YDO will put together a fresh update about {firstName}.
                You&rsquo;ll see it here when it&rsquo;s ready.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-[#666] leading-relaxed mb-4">
                {canRequestUpdate
                  ? `Ask our field team at YDO for a new update about ${firstName}. Photos, a note from their teacher, how they're doing in class.`
                  : `You can request your next update in ${daysUntilCanRequest} days. We space requests so the YDO team can focus on the kids.`}
              </p>
              <button
                onClick={handleRequestUpdate}
                disabled={!canRequestUpdate || requestingUpdate}
                className="px-5 py-2.5 bg-[#D4A843] text-[#0d0d0d] font-bold text-sm tracking-[0.05em] hover:bg-[#c49a3a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {requestingUpdate ? 'SUBMITTING...' : 'REQUEST UPDATE'}
              </button>
            </>
          )}
        </div>

        {/* Write to Your Child — Guided Flow */}
        <div className="bg-white border border-[#e8e0d4] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
            Write to {firstName}
          </p>

          {messageSent ? (
            <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-4 text-sm text-[#444]">
              <p className="font-medium text-[#0d0d0d] mb-1">Message sent.</p>
              <p className="text-[#666] mb-2">
                Kevin will relay your message to {firstName} through the YDO team on the ground in Omoro District.
              </p>
              <div className="bg-white border border-[#e8e0d4] p-3 text-xs text-[#888] mb-3">
                <p className="font-semibold text-[#666] mb-1">What happens next</p>
                <p>Your message goes to Kevin, then to the YDO team, then to {firstName}. If you asked a question, {firstName}&rsquo;s response comes back the same way. Expect 2&ndash;4 weeks &mdash; mail between here and Northern Uganda takes time, and that&rsquo;s okay.</p>
              </div>
              <button
                onClick={() => { setMessageSent(false); setMsgStep(1); }}
                className="text-sm text-[#D4A843] hover:underline font-medium"
              >
                Write another message
              </button>
            </div>
          ) : (
            <>
              {messageError && (
                <div className="bg-[#FFF8F0] border border-[#D4A843] text-[#0d0d0d] px-3 py-2 text-sm mb-3">
                  {messageError}
                </div>
              )}

              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-4">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                        msgStep === s
                          ? 'bg-[#D4A843] text-[#0d0d0d]'
                          : msgStep > s
                          ? 'bg-[#D4A843]/20 text-[#D4A843]'
                          : 'bg-[#f0ece4] text-[#bbb]'
                      }`}
                    >
                      {msgStep > s ? '✓' : s}
                    </div>
                    {s < 3 && <div className={`w-6 h-px ${msgStep > s ? 'bg-[#D4A843]/40' : 'bg-[#e8e0d4]'}`} />}
                  </div>
                ))}
                <span className="text-xs text-[#aaa] ml-2">
                  {msgStep === 1 ? 'Share about you' : msgStep === 2 ? `Ask ${firstName} something` : 'Add a note'}
                </span>
              </div>

              {/* ── Step 1: Tell the child about yourself ── */}
              {msgStep === 1 && (
                <div>
                  <p className="text-sm text-[#666] leading-relaxed mb-3">
                    Pick a question to answer so {firstName} can get to know you.
                  </p>
                  <div className="space-y-2 mb-4">
                    {[
                      'What do you do for work or school?',
                      'What do you like to do on weekends?',
                      'What is your favorite food?',
                      'Do you have any pets or siblings?',
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => setSelectedSharePrompt(prompt)}
                        className={`block w-full text-left px-4 py-3 border text-sm transition-colors ${
                          selectedSharePrompt === prompt
                            ? 'border-[#D4A843] bg-[#FFF8F0] text-[#0d0d0d]'
                            : 'border-[#e8e0d4] bg-white text-[#666] hover:border-[#D4A843]/50'
                        }`}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  {selectedSharePrompt && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-2">Your answer</p>
                      <textarea
                        value={shareAnswer}
                        onChange={(e) => setShareAnswer(e.target.value)}
                        placeholder="Write your answer here..."
                        rows={3}
                        maxLength={500}
                        className="w-full px-4 py-3 border border-[#e8e0d4] bg-white text-[#0d0d0d] text-sm leading-relaxed focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] transition-colors resize-none"
                      />
                      <span className="text-xs text-[#aaa]">{shareAnswer.length}/500</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => { setSelectedSharePrompt(null); setShareAnswer(''); setMsgStep(2); }}
                      className="text-xs text-[#aaa] hover:text-[#666] transition-colors"
                    >
                      Skip this step
                    </button>
                    <button
                      onClick={() => setMsgStep(2)}
                      disabled={!selectedSharePrompt || !shareAnswer.trim()}
                      className="px-5 py-2.5 bg-[#D4A843] text-[#0d0d0d] font-bold text-sm tracking-[0.05em] hover:bg-[#c49a3a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      NEXT
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 2: Ask the child a question ── */}
              {msgStep === 2 && (
                <div>
                  <p className="text-sm text-[#666] leading-relaxed mb-3">
                    Pick a question you&rsquo;d like to ask {firstName}.
                  </p>
                  <div className="space-y-2 mb-4">
                    {[
                      'What is your favorite subject in school?',
                      'What do you like to do with your friends?',
                      'What do you want to be when you grow up?',
                      'What is something that made you happy this week?',
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => setSelectedAskPrompt(selectedAskPrompt === prompt ? null : prompt)}
                        className={`block w-full text-left px-4 py-3 border text-sm transition-colors ${
                          selectedAskPrompt === prompt
                            ? 'border-[#D4A843] bg-[#FFF8F0] text-[#0d0d0d]'
                            : 'border-[#e8e0d4] bg-white text-[#666] hover:border-[#D4A843]/50'
                        }`}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setMsgStep(1)}
                      className="text-xs text-[#aaa] hover:text-[#666] transition-colors"
                    >
                      ← Back
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => { setSelectedAskPrompt(null); setMsgStep(3); }}
                        className="text-xs text-[#aaa] hover:text-[#666] transition-colors"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => setMsgStep(3)}
                        disabled={!selectedAskPrompt}
                        className="px-5 py-2.5 bg-[#D4A843] text-[#0d0d0d] font-bold text-sm tracking-[0.05em] hover:bg-[#c49a3a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        NEXT
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 3: Free-text + review + send ── */}
              {msgStep === 3 && (
                <div>
                  {/* Summary of what they picked */}
                  {(selectedSharePrompt || selectedAskPrompt) && (
                    <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-3 mb-4 text-sm space-y-2">
                      {selectedSharePrompt && shareAnswer.trim() && (
                        <div>
                          <p className="text-xs font-semibold text-[#D4A843] uppercase tracking-wider">You shared</p>
                          <p className="text-[#666] italic">&ldquo;{selectedSharePrompt}&rdquo;</p>
                          <p className="text-[#444]">{shareAnswer.trim()}</p>
                        </div>
                      )}
                      {selectedAskPrompt && (
                        <div>
                          <p className="text-xs font-semibold text-[#D4A843] uppercase tracking-wider">You asked {firstName}</p>
                          <p className="text-[#444]">&ldquo;{selectedAskPrompt}&rdquo;</p>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-sm text-[#666] leading-relaxed mb-3">
                    Anything else you want to say? A greeting, encouragement, anything at all. Or just send what you have.
                  </p>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder={`Hey ${firstName}...`}
                    rows={3}
                    maxLength={1000}
                    className="w-full px-4 py-3 border border-[#e8e0d4] bg-white text-[#0d0d0d] text-sm leading-relaxed focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] transition-colors resize-none mb-2"
                  />
                  <span className="text-xs text-[#aaa] block mb-3">{messageText.length}/1000</span>

                  {/* Response time expectation */}
                  <div className="bg-[#f9f6f0] border border-[#e8e0d4] px-3 py-2 text-xs text-[#888] mb-4 flex items-start gap-2">
                    <svg className="w-4 h-4 text-[#D4A843] mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Messages travel from Kevin to the YDO team to {firstName} in Northern Uganda. If you asked a question, expect a response in 2&ndash;4 weeks. That&rsquo;s the reality of the distance &mdash; and part of what makes the connection real.</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setMsgStep(2)}
                      className="text-xs text-[#aaa] hover:text-[#666] transition-colors"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleSendMessage}
                      disabled={(!selectedSharePrompt || !shareAnswer.trim()) && !selectedAskPrompt && !messageText.trim() || sendingMessage}
                      className="px-5 py-2.5 bg-[#D4A843] text-[#0d0d0d] font-bold text-sm tracking-[0.05em] hover:bg-[#c49a3a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingMessage ? 'SENDING...' : 'SEND MESSAGE'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ============================================================
          TIMELINE
          ============================================================ */}
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-4">
          Your story with {firstName}
        </p>

        {timeline.length === 0 ? (
          <div className="bg-white border border-[#e8e0d4] p-8 md:p-10">
            <h2 className="text-xl md:text-2xl text-[#0d0d0d] mb-3"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}>
              Welcome to your portal.
            </h2>
            <p className="text-[#666] leading-relaxed mb-4 max-w-lg">
              This is where your relationship with {firstName} will take shape — updates from the campus,
              photos, notes from their teacher, and messages you send.
              The first update is on its way.
            </p>
            <p className="text-[#666] leading-relaxed mb-6 max-w-lg">
              In the meantime, you can request an update or write {firstName} a message
              using the forms above. Every message gets delivered through our team on
              the ground in Omoro District.
            </p>
            <p className="text-sm text-[#aaa]">
              Questions? Email{' '}
              <a href="mailto:kevin@beanumber.org" className="text-[#D4A843] hover:underline">kevin@beanumber.org</a>
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[15px] md:left-[19px] top-2 bottom-2 w-px bg-[#e8e0d4]" />

            <div className="space-y-0">
              {timeline.map((entry, idx) => (
                <div key={entry.id} className="relative pl-10 md:pl-12 pb-8 last:pb-0">
                  {/* Timeline dot */}
                  <div className={`absolute left-[9px] md:left-[13px] top-1.5 w-[13px] h-[13px] rounded-full border-2 ${
                    entry.kind === 'milestone'
                      ? 'bg-[#D4A843] border-[#D4A843]'
                      : entry.kind === 'message'
                        ? 'bg-white border-[#D4A843]'
                        : 'bg-white border-[#888]'
                  }`} />

                  {/* Date */}
                  <p className="text-xs text-[#aaa] mb-1.5">{formatDate(entry.date)}</p>

                  {/* MILESTONE */}
                  {entry.kind === 'milestone' && (
                    <div className="bg-[#FFF8F0] border border-[#e8e0d4] px-4 py-3">
                      <p className="text-sm text-[#0d0d0d] font-medium"
                        style={{ fontFamily: 'var(--font-lora), serif' }}>
                        {entry.milestoneIcon === 'heart' && '❤️ '}
                        {entry.milestoneIcon === 'star' && '⭐ '}
                        {entry.milestoneLabel}
                      </p>
                    </div>
                  )}

                  {/* SPONSOR MESSAGE */}
                  {entry.kind === 'message' && (
                    <div className="bg-white border border-[#e8e0d4] px-5 py-4">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
                        You wrote
                      </p>
                      <p className="text-[#444] leading-relaxed whitespace-pre-line text-sm">
                        {entry.content}
                      </p>
                      {entry.messageStatus === 'Pending Review' && (
                        <p className="text-xs text-[#aaa] mt-2 italic">Queued for delivery</p>
                      )}
                    </div>
                  )}

                  {/* YDO UPDATE */}
                  {entry.kind === 'update' && (
                    <div className="bg-white border border-[#e8e0d4] overflow-hidden">
                      <div className="px-5 py-4 md:px-6 md:py-5">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            {entry.type && (
                              <span className="inline-block px-2.5 py-0.5 bg-[#FFF8F0] border border-[#e8e0d4] text-[#888] text-xs font-bold uppercase tracking-[0.1em] mb-2">
                                {entry.type}
                              </span>
                            )}
                            {entry.title && (
                              <h3 className="text-lg text-[#0d0d0d]"
                                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}>
                                {entry.title}
                              </h3>
                            )}
                          </div>
                        </div>

                        {entry.content && (
                          <p className="text-[#444] leading-relaxed whitespace-pre-line text-sm">
                            {entry.content}
                          </p>
                        )}

                        {entry.photos && entry.photos.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                            {entry.photos.map((photo, pidx) => (
                              <div key={pidx} className="relative aspect-video bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden">
                                <Image src={photo} alt={`Update photo ${pidx + 1}`} fill className="object-cover" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sponsor code reminder */}
      <div className="mt-8 text-center">
        <p className="text-xs text-[#aaa]">
          Your sponsor code: <span className="font-mono tracking-wider">{sponsorCode}</span>
        </p>
      </div>
    </div>
  );
}
