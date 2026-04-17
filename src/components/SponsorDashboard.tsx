'use client';

import { useState, useEffect, useMemo } from 'react';
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

  // Write-to-child form state
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const [messageError, setMessageError] = useState('');

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

    // Anniversary milestones
    if (sponsorship.startDate) {
      const start = new Date(sponsorship.startDate);
      const now = new Date();
      const milestonesMonths = [6, 12, 24, 36, 48, 60];
      for (const m of milestonesMonths) {
        const milestoneDate = new Date(start);
        milestoneDate.setMonth(milestoneDate.getMonth() + m);
        if (milestoneDate <= now) {
          const label = m < 12
            ? `${m} months of sponsorship.`
            : m === 12
              ? `1 year of sponsorship.`
              : `${m / 12} years of sponsorship.`;
          entries.push({
            id: `milestone-${m}mo`,
            date: milestoneDate.toISOString().split('T')[0],
            kind: 'milestone',
            milestoneLabel: label,
            milestoneIcon: 'star',
          });
        }
      }
    }

    // Sort newest first
    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return entries;
  }, [updates, sponsorMessages, sponsorship.startDate, firstName]);

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
    if (!messageText.trim() || sendingMessage) return;
    setSendingMessage(true);
    setMessageError('');
    setMessageSent(false);

    try {
      const response = await fetch('/api/sponsor/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorCode, email, message: messageText.trim() }),
      });

      if (response.ok) {
        setMessageSent(true);
        setMessageText('');
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
      {sponsorship.monthsActive > 0 && (
        <div className="bg-white border border-[#e8e0d4] p-6 md:p-8 mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-4">
            Your partnership so far
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <div>
              <p className="text-2xl md:text-3xl text-[#0d0d0d] font-semibold"
                style={{ fontFamily: 'var(--font-lora), serif' }}>
                {sponsorship.monthsActive}
              </p>
              <p className="text-sm text-[#888] mt-1">
                {sponsorship.monthsActive === 1 ? 'month' : 'months'} sponsoring
              </p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl text-[#0d0d0d] font-semibold"
                style={{ fontFamily: 'var(--font-lora), serif' }}>
                ${sponsorship.totalPaid > 0 ? sponsorship.totalPaid.toLocaleString() : (sponsorship.monthsActive * sponsorship.monthlyAmount).toLocaleString()}
              </p>
              <p className="text-sm text-[#888] mt-1">contributed</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl text-[#0d0d0d] font-semibold"
                style={{ fontFamily: 'var(--font-lora), serif' }}>
                {sponsorship.monthsActive * 2}
              </p>
              <p className="text-sm text-[#888] mt-1">meals per day, every school day</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl text-[#0d0d0d] font-semibold"
                style={{ fontFamily: 'var(--font-lora), serif' }}>
                {sponsorship.monthsActive}
              </p>
              <p className="text-sm text-[#888] mt-1">
                {sponsorship.monthsActive === 1 ? 'month' : 'months'} of school fees + medical care
              </p>
            </div>
          </div>
          <p className="text-xs text-[#aaa] mt-5">
            ${sponsorship.monthlyAmount}/mo covers breakfast and lunch at the campus, school fees, basic medical care, and mentorship through the YDO team.
          </p>
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

        {/* Write to Your Child */}
        <div className="bg-white border border-[#e8e0d4] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
            Write to {firstName}
          </p>
          {messageSent ? (
            <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-4 text-sm text-[#444]">
              <p className="font-medium text-[#0d0d0d] mb-1">Message sent.</p>
              <p className="text-[#666]">
                Kevin will make sure it gets to {firstName} through the YDO team on the ground.
              </p>
              <button
                onClick={() => setMessageSent(false)}
                className="mt-3 text-sm text-[#D4A843] hover:underline font-medium"
              >
                Write another message
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-[#666] leading-relaxed mb-3">
                Send a note, a question, encouragement — whatever you want {firstName} to hear.
                Kevin relays every message through the YDO team.
              </p>
              {messageError && (
                <div className="bg-[#FFF8F0] border border-[#D4A843] text-[#0d0d0d] px-3 py-2 text-sm mb-3">
                  {messageError}
                </div>
              )}
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={`Hey ${firstName}...`}
                rows={3}
                maxLength={2000}
                className="w-full px-4 py-3 border border-[#e8e0d4] bg-white text-[#0d0d0d] text-sm leading-relaxed focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] transition-colors resize-none mb-3"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#aaa]">{messageText.length}/2000</span>
                <button
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() || sendingMessage}
                  className="px-5 py-2.5 bg-[#D4A843] text-[#0d0d0d] font-bold text-sm tracking-[0.05em] hover:bg-[#c49a3a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingMessage ? 'SENDING...' : 'SEND MESSAGE'}
                </button>
              </div>
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
