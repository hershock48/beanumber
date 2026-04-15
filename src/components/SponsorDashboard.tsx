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
  photo?: string;
  age?: string;
  location?: string;
  sponsorshipStartDate?: string;
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

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Child Profile Header */}
      {childInfo && (
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="flex flex-col md:flex-row gap-6">
            {childInfo.photo && (
              <div className="relative w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                <Image
                  src={childInfo.photo}
                  alt={childInfo.name}
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {childInfo.name}
              </h1>
              {childInfo.age && (
                <p className="text-gray-600 mb-1">Age: {childInfo.age}</p>
              )}
              {childInfo.location && (
                <p className="text-gray-600 mb-1">Location: {childInfo.location}</p>
              )}
              {childInfo.sponsorshipStartDate && (
                <p className="text-sm text-gray-500 mt-2">
                  Sponsorship started: {new Date(childInfo.sponsorshipStartDate).toLocaleDateString()}
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
