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
    } catch (error) {
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
      } else {
        const errorData = await response.json();
        setMessageError(errorData.error || 'Failed to send message. Please try again.');
      }
    } catch (error) {
      setMessageError('Failed to send message. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  }

  // Manual reveal — used when the sponsor has lost the shirt or just
  // doesn't want to wait. Confirmed inline, since it intentionally breaks
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
  // LOCKBOX VIEW — no child details until the reveal has happened.
  // -------------------------------------------------------------------
  if (!childRevealed) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 md:py-20">
        <div className="bg-white border border-[#e8e0d4] p-8 md:p-10 text-center">
          <div className="w-14 h-14 bg-[#FFF8F0] border border-[#e8e0d4] rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-7 h-7 text-[#D4A843]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
            Your sponsorship is active
          </p>

          <h1
            className="text-2xl md:text-3xl text-[#0d0d0d] mb-4"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Your child is waiting for you to open the package.
          </h1>

          <p className="text-[#666] leading-relaxed mb-6 max-w-md mx-auto">
            Be A Number works like this: when your shirt arrives, look at the
            tag. There&rsquo;s a number on it. That number belongs to a real
            child in Northern Uganda. Go to{' '}
            <Link href="/" className="text-[#D4A843] font-medium hover:underline">
              beanumber.org
            </Link>
            , enter your number, and meet them.
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
            <a href="mailto:kevin@beanumber.org" className="text-[#D4A843] hover:underline">
              kevin@beanumber.org
            </a>
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // FULL DASHBOARD — reveal has happened, show everything.
  // -------------------------------------------------------------------
  const daysUntilCanRequest = nextRequestEligibleAt
    ? Math.max(0, Math.ceil((new Date(nextRequestEligibleAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const firstName =
    childInfo?.firstName ||
    childInfo?.name?.split(' ')[0] ||
    'them';

  const hasStructured = Boolean(
    childInfo?.homeVillage ||
    childInfo?.familyContext ||
    childInfo?.loves ||
    childInfo?.childQuote ||
    childInfo?.teacherQuote
  );

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
      {/* Child Profile Header — cream/gold/Lora, the emotional anchor. */}
      {childInfo && (
        <div className="bg-white border border-[#e8e0d4] p-6 md:p-10 mb-6">
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

              {/* Pull quote from the child */}
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

              {/* Structured fact lines */}
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

              {/* Teacher quote */}
              {childInfo.teacherQuote && (
                <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-5 mb-6">
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

              {/* No structured intake yet */}
              {!hasStructured && (
                <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-5 mb-6">
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

      {/* Two-column action row on desktop: request update + write to child */}
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
                  : `You can request your next update in ${daysUntilCanRequest} days. We limit requests to once per quarter so the YDO team can focus on the kids.`}
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

      {/* Updates Feed */}
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-4">
          Updates
        </p>

        {updates.length === 0 ? (
          <div className="bg-white border border-[#e8e0d4] p-8 md:p-10">
            <h2
              className="text-xl md:text-2xl text-[#0d0d0d] mb-3"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Welcome to your portal.
            </h2>
            <p className="text-[#666] leading-relaxed mb-4 max-w-lg">
              This is where updates about {firstName} will live — photos from the campus,
              notes from their teacher, and anything the YDO team wants you to see.
              The first update is on its way.
            </p>
            <p className="text-[#666] leading-relaxed mb-6 max-w-lg">
              In the meantime, you can request an update or write {firstName} a message
              using the forms above. Every message gets delivered through our team on
              the ground in Omoro District.
            </p>
            <p className="text-sm text-[#aaa]">
              Questions about anything? Email{' '}
              <a href="mailto:kevin@beanumber.org" className="text-[#D4A843] hover:underline">
                kevin@beanumber.org
              </a>
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {updates.map((update) => (
              <div key={update.id} className="bg-white border border-[#e8e0d4] overflow-hidden">
                <div className="p-6 md:p-8">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <span className="inline-block px-3 py-1 bg-[#FFF8F0] border border-[#e8e0d4] text-[#888] text-xs font-bold uppercase tracking-[0.1em] mb-2">
                        {update.type}
                      </span>
                      <h3
                        className="text-xl text-[#0d0d0d]"
                        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                      >
                        {update.title}
                      </h3>
                    </div>
                    <time className="text-sm text-[#aaa] whitespace-nowrap ml-4">
                      {new Date(update.date).toLocaleDateString()}
                    </time>
                  </div>

                  <div className="mb-4">
                    <p className="text-[#444] leading-relaxed whitespace-pre-line">
                      {update.content}
                    </p>
                  </div>

                  {update.photos && update.photos.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                      {update.photos.map((photo, idx) => (
                        <div key={idx} className="relative aspect-video bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden">
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
            ))}
          </div>
        )}
      </div>

      {/* Sponsor code reminder at bottom */}
      <div className="mt-8 text-center">
        <p className="text-xs text-[#aaa]">
          Your sponsor code: <span className="font-mono tracking-wider">{sponsorCode}</span>
        </p>
      </div>
    </div>
  );
}
