'use client';

/**
 * CampusAtmosphere — the live "postmark" line at the top of /me.
 *
 * Reads like:
 *
 *     It's 3:45 PM in Omoro right now — 89°F, overcast.
 *
 * Structure:
 *   - Time is rendered from the server initial (no hydration flash),
 *     then re-computed every minute on the client using the campus
 *     timezone so it's actually live.
 *   - Weather is server-fetched (with 15-min cache) and passed in as
 *     a prop. We don't re-fetch it client-side — it's expensive and
 *     doesn't move fast enough to notice within a session.
 *   - When weather is null (Open-Meteo failed / timed out), the line
 *     still renders with just the time. Graceful degradation.
 *
 * Placement on /me: between the kicker and the H1, styled as a
 * subtle secondary line. Reads like a datestamp on a letter, not a
 * flashy widget.
 */

import { useEffect, useState } from 'react';
import type { OmoroWeather } from '@/lib/omoro';
import { OMORO } from '@/lib/omoro';

interface Props {
  initialCampusNow: string;
  weather: OmoroWeather | null;
}

function formatCampusTime(campusNow: Date): string {
  // Locale-formatted 12-hour clock. Intl.DateTimeFormat is safe
  // across every modern browser and it respects the user's locale
  // for AM/PM display while pegging the hour value to Omoro time.
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: OMORO.timezone,
  }).format(campusNow);
}

/**
 * Parse "2026-07-06T15:45" (no timezone) as if it were UTC so the
 * subsequent formatCampusTime (which converts back to Africa/Kampala)
 * displays the correct wall clock. The double conversion sounds
 * wasteful but it's the cleanest way to seed the client with the
 * server's snapshot and let Intl handle re-formatting.
 */
function parseServerSnapshot(serverIso: string): Date {
  // Adding 'Z' pins the wall-clock string to UTC, then Intl formats
  // that UTC instant back into Africa/Kampala. Because the original
  // string was already in Africa/Kampala wall time, this round-trips
  // to the same displayed time.
  //
  // Concrete example: server sees Omoro=15:45. We store "2026-07-06T15:45".
  // Parsing as UTC gives instant 15:45Z. formatCampusTime converts to
  // Africa/Kampala (+3), which would display 18:45 — WRONG.
  //
  // Correct approach: parse the wall-clock string as if it were UTC
  // AND format it as UTC. That's what we do for the initial render.
  // Then the setInterval takes over with real client-computed time.
  return new Date(serverIso + 'Z');
}

function formatInitialTime(serverIso: string): string {
  const d = parseServerSnapshot(serverIso);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(d);
}

export function CampusAtmosphere({ initialCampusNow, weather }: Props) {
  const [displayTime, setDisplayTime] = useState(() =>
    formatInitialTime(initialCampusNow)
  );

  useEffect(() => {
    // Immediately swap to real client-computed time so the display
    // catches up if the server-snapshot was stale (e.g. Vercel edge
    // cache serving a page from 30s ago).
    const tick = () => setDisplayTime(formatCampusTime(new Date()));
    tick();

    // Align the interval to the next minute boundary so all clients
    // update at the same moment (feels more "live" than each visitor
    // ticking on their own random schedule).
    const now = new Date();
    const msUntilNextMinute =
      60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const alignTimeout = setTimeout(() => {
      tick();
      intervalId = setInterval(tick, 60_000);
    }, Math.max(500, msUntilNextMinute));

    return () => {
      clearTimeout(alignTimeout);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const hasWeather = !!weather;

  return (
    <p
      className="text-sm text-[#7a6a55] mb-4 italic leading-relaxed"
      // The tiny gold dot below is decorative; screen readers should
      // get the whole sentence as prose without a stray "bullet."
      aria-label={`It's ${displayTime} in Omoro right now${
        hasWeather ? `, ${weather!.temperatureF} degrees Fahrenheit, ${weather!.phrase}` : ''
      }.`}
    >
      <span
        className="inline-block w-1.5 h-1.5 bg-[#D4A843] rounded-full align-middle mr-2"
        aria-hidden="true"
      />
      It&rsquo;s{' '}
      <span className="not-italic font-semibold text-[#3a2f24]">
        {displayTime}
      </span>{' '}
      in Omoro right now
      {hasWeather && (
        <>
          {' '}&mdash;{' '}
          <span className="not-italic font-semibold text-[#3a2f24]">
            {weather!.temperatureF}&deg;F
          </span>
          , {weather!.phrase}
        </>
      )}
      .
    </p>
  );
}
