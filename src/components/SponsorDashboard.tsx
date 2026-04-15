'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface Update {
  id: string;
  date: string;
  type: string;
  title: string;
  content: string;
  photos: string[];
}

interface ChildInfo {
  name: string;
  firstName?: string;
  photo?: string;
  age?: string;
  location?: string;
  sponsorshipStartDate?: string;
  // Structured intake fields — mirror /children/[number]. Any may be empty;
  // each block is rendered conditionally so a half-filled profile still
  // looks intentional.
  homeVillage?: string;
  familyContext?: string;
  loves?: string;
  childQuote?: string;
  teacherName?: string;
  teacherQuote?: string;
  notes?: string;
}

interface SponsorDashboardProps {
  sponsorCode: string;
  email: string;
}

export function SponsorDashboard({ sponsorCode, email }: SponsorDashboardProps) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [childInfo, setChildInfo] = useState<ChildInfo | null>(null);
  const [childRevealed, setChildRevealed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [nextRequestEligibleAt, setNextRequestEligibleAt] = useState<string | null>(null);
  const [canRequestUpdate, setCanRequestUpdate] = useState(false);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    loadSponsorData();
  }, [sponsorCode]);

  async function loadSponsorData() {
    try {
      const response = await fetch(`/api/sponsor/updates?sponsorCode=${sponsorCode}`);
      const data = await response.json();

      if (response.ok) {
        setUpdates(data.updates || []);
        setChildInfo(data.childInfo || null);
        setChildRevealed(!!data.childRevealed);
        setNextRequestEligibleAt(data.nextRequestEligibleAt);

        // Check if can request update using NextRequestEligibleAt
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

  async function handleRequestUpdate() {
    if (!canRequestUpdate) return;

    try {
      const response = await fetch('/api/sponsor/request-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorCode, email }),
      });

      if (response.ok) {
        alert('Update request submitted! Our field team will prepare an update for you.');
        // Reload data to get updated NextRequestEligibleAt
        await loadSponsorData();
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to submit request. Please try again.');
      }
    } catch (error) {
      alert('Failed to submit request. Please try again.');
    }
  }

  // Manual reveal — used when the sponsor has lost the shirt or just
  // doesn't want to wait. Confirmed click, since it intentionally breaks
  // the surprise.
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
        body: JSON.stringify({}), // no number => "reveal anyway" path
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.revealed) {
        await loadSponsorData();
      } else if (data?.reason === 'airtable_patch_failed') {
        // Field doesn't exist yet on the Airtable side. Tell the sponsor
        // the portal hasn't finished setup and to try again later.
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

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // LOCKBOX VIEW — no child details until the reveal has happened.
  // The sponsor sees a confirmation that the sponsorship is active,
  // a clear explanation of why the portal is waiting, and a small
  // "reveal anyway" escape hatch for when the shirt is lost.
  // ---------------------------------------------------------------
  if (!childRevealed) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="bg-white rounded-lg shadow-lg p-10 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-7 h-7 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M12 11c.828 0 1.5-.672 1.5-1.5S12.828 8 12 8s-1.5.672-1.5 1.5S11.172 11 12 11zM20 12a8 8 0 11-16 0 8 8 0 0116 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M12 11v4"
              />
            </svg>
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3">
            Your sponsorship is active
          </p>

          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Your child is waiting for you to open the package.
          </h1>

          <p className="text-gray-600 leading-relaxed mb-6 max-w-md mx-auto">
            Be A Number works like this: when your shirt arrives, look at the
            tag. There&rsquo;s a number on it. That number belongs to a real
            child in Northern Uganda. Go to <Link href="/" className="text-gray-900 font-medium underline underline-offset-2">beanumber.org</Link>, enter your number, and meet them.
          </p>

          <p className="text-gray-600 leading-relaxed mb-8 max-w-md mx-auto">
            Once you&rsquo;ve met them, this portal will unlock with their
            full profile, updates from our team on the campus, and a place
            to write back.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-8 text-sm text-gray-600">
            <p className="mb-1">
              <strong className="text-gray-800">Your sponsor code:</strong>{' '}
              <span className="font-mono">{sponsorCode}</span>
            </p>
            <p className="text-xs text-gray-500">
              Keep this somewhere safe. You&rsquo;ll use it to log back in.
            </p>
          </div>

          <button
            onClick={handleRevealAnyway}
            disabled={revealing}
            className="text-sm text-gray-500 hover:text-gray-900 underline underline-offset-4 disabled:opacity-50"
          >
            {revealing ? 'Unlocking…' : "Can't wait? Reveal anyway."}
          </button>

          <p className="text-xs text-gray-400 mt-8">
            Questions? Email{' '}
            <a href="mailto:kevin@beanumber.org" className="underline">
              kevin@beanumber.org
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // FULL DASHBOARD — reveal has happened, show everything.
  // ---------------------------------------------------------------
  const daysUntilCanRequest = nextRequestEligibleAt
    ? Math.max(0, Math.ceil((new Date(nextRequestEligibleAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Derive a single first-name token for labels like "What {firstName} loves".
  // Falls back through FirstName → first word of display name → "them" so a
  // partial record never renders "What undefined loves".
  const firstName =
    childInfo?.firstName ||
    childInfo?.name?.split(' ')[0] ||
    'them';

  // True if ANY of the structured intake fields are populated. When none
  // are, we fall back to the Notes prose so older records still render
  // something human rather than an empty scaffold.
  const hasStructured = Boolean(
    childInfo?.homeVillage ||
    childInfo?.familyContext ||
    childInfo?.loves ||
    childInfo?.childQuote ||
    childInfo?.teacherQuote
  );

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Child Profile Header — mirrors the structured treatment on
          /children/[number]. Cream/gold/Lora instead of the portal's
          gray chrome, because this card is the emotional anchor of the
          page and should feel like the brand, not like a SaaS dashboard. */}
      {childInfo && (
        <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-8 md:p-10 mb-8">
          <div className="grid md:grid-cols-[minmax(0,1fr)_1.6fr] gap-8 md:gap-10 items-start">
            {/* Photo */}
            <div className="aspect-[4/5] bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden relative">
              {childInfo.photo ? (
                <Image
                  src={childInfo.photo}
                  alt={childInfo.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-[#aaa] text-sm">Photo coming soon</p>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex flex-col justify-center">
              <h1
                className="text-3xl md:text-4xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                {childInfo.name}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-[#777] mb-6">
                {childInfo.age && <span className="text-base">Age {childInfo.age}</span>}
                {childInfo.age && childInfo.location && <span className="text-[#ccc]">&middot;</span>}
                {childInfo.location && <span className="text-base">{childInfo.location}</span>}
              </div>

              {/* Pull quote from the child — in their own voice. The single
                  strongest element on the card when it's present. */}
              {childInfo.childQuote && (
                <div className="mb-6">
                  <p
                    className="text-xl md:text-2xl text-[#0d0d0d] leading-snug"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 500, fontStyle: 'italic' }}
                  >
                    &ldquo;{childInfo.childQuote}&rdquo;
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[#aaa]">
                    — {firstName}
                  </p>
                </div>
              )}

              {/* Structured fact lines. Each block hides itself when its
                  field is empty, so a half-filled profile still looks
                  intentional instead of leaving dead scaffold. */}
              {hasStructured && (
                <div className="mb-6 space-y-4">
                  {childInfo.homeVillage && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                        Home
                      </p>
                      <p className="text-[#444] leading-relaxed">{childInfo.homeVillage}</p>
                    </div>
                  )}
                  {childInfo.familyContext && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                        Family
                      </p>
                      <p className="text-[#444] leading-relaxed">{childInfo.familyContext}</p>
                    </div>
                  )}
                  {childInfo.loves && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                        What {firstName} loves
                      </p>
                      <p className="text-[#444] leading-relaxed">{childInfo.loves}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Teacher quote — attributed, second human voice on the card.
                  Only appears when TeacherQuote is present. */}
              {childInfo.teacherQuote && (
                <div className="bg-white border border-[#e8e0d4] p-5 mb-6">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
                    From {firstName}&rsquo;s teacher
                  </p>
                  <p className="text-[#444] leading-relaxed italic">
                    &ldquo;{childInfo.teacherQuote}&rdquo;
                  </p>
                  {childInfo.teacherName && (
                    <p className="mt-3 text-sm text-[#888]">— {childInfo.teacherName}</p>
                  )}
                </div>
              )}

              {/* Placeholder when no structured intake fields are populated.
                  IMPORTANT: we do NOT fall back to childInfo.notes. The legacy
                  Notes field on most records is AI-template boilerplate
                  ("bright and hopeful", "peasant farmers", "humble background",
                  "life full of potential and hope") that violates voice.md.
                  Better to show an honest, dignified "story coming" line than
                  to ship savior-narrative copy under our brand. */}
              {!hasStructured && (
                <div className="bg-white border border-[#e8e0d4] p-5 mb-6">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
                    {firstName}&rsquo;s story
                  </p>
                  <p className="text-[#666] leading-relaxed">
                    We&rsquo;re gathering {firstName}&rsquo;s full profile from
                    the campus in Omoro District right now — home, family,
                    what they love, and a note from their teacher. It&rsquo;ll
                    land here as soon as it&rsquo;s in our hands.
                  </p>
                </div>
              )}

              {childInfo.sponsorshipStartDate && (
                <p className="text-sm text-[#888] mt-2">
                  Sponsoring since {new Date(childInfo.sponsorshipStartDate).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Request Update Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Request an Update
            </h2>
            <p className="text-sm text-gray-600">
              {canRequestUpdate
                ? 'You can request a new update about your sponsored child.'
                : `You can request your next update in ${daysUntilCanRequest} days.`}
            </p>
          </div>
          <button
            onClick={handleRequestUpdate}
            disabled={!canRequestUpdate}
            className="px-6 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Request Update
          </button>
        </div>
      </div>

      {/* Updates Feed */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Updates</h2>

        {updates.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <p className="text-gray-600 mb-4">
              No updates yet. Check back soon or request an update above.
            </p>
          </div>
        ) : (
          updates.map((update) => (
            <div key={update.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-full mb-2">
                      {update.type}
                    </span>
                    <h3 className="text-xl font-bold text-gray-900">{update.title}</h3>
                  </div>
                  <time className="text-sm text-gray-500">
                    {new Date(update.date).toLocaleDateString()}
                  </time>
                </div>

                <div className="prose max-w-none mb-4">
                  <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                    {update.content}
                  </p>
                </div>

                {update.photos && update.photos.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    {update.photos.map((photo, idx) => (
                      <div key={idx} className="relative aspect-video bg-gray-200 rounded-lg overflow-hidden">
                        <Image
                          src={photo}
                          alt={`Update photo ${idx + 1}`}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
