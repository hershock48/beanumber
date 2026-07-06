/**
 * Omoro District atmospheric data — the live "postmark" pulled onto
 * /me and other campus surfaces so the site reads like a signal from
 * a real place, not a static marketing shell.
 *
 * Location: YDO campus, Omoro District, Northern Uganda.
 *   Latitude:  ~2.85° N (a hair north of the equator)
 *   Longitude: ~32.68° E
 *   Elevation: ~983 m (northern plateau; verified against Open-Meteo)
 *   Timezone:  Africa/Kampala (EAT, UTC+3, no DST)
 *
 * Weather source: Open-Meteo current-conditions endpoint. Free, no
 * API key, no auth, generous rate limits, WMO-standard weather codes.
 * We cache the response 15 minutes because campus weather doesn't
 * flip on the minute and we don't want to hammer their free tier.
 *
 * Design intent: the widget on the page shows something like
 *
 *     It's 3:45 PM in Omoro right now — 89°F, overcast.
 *
 * Time is client-refreshed every minute (no roundtrip); weather is
 * server-refreshed once every 15 minutes and passed to the client
 * as an initial-state prop. If Open-Meteo is down or slow, the
 * client still renders the time — atmosphere degrades gracefully.
 */

export const OMORO = {
  latitude: 2.85,
  longitude: 32.68,
  timezone: 'Africa/Kampala' as const,
  label: 'Omoro',
} as const;

export interface OmoroWeather {
  temperatureF: number;
  weatherCode: number;
  humidityPct: number;
  windMph: number;
  /**
   * Human-friendly one-word or short-phrase description of the
   * weather code, chosen to fit inline in prose ("89°F, overcast").
   */
  phrase: string;
  /**
   * The wall-clock time at the campus that the reading corresponds
   * to. ISO string in Africa/Kampala local time (no timezone
   * suffix — Open-Meteo returns it that way for convenience).
   */
  observedAt: string;
}

/**
 * WMO weather-code → conversational phrase, in a voice that reads
 * clean inside "89°F, {phrase}." Chosen to match the brand voice
 * (specific over vague — "afternoon showers" beats "precipitation").
 * See https://open-meteo.com/en/docs for the full code table.
 */
function weatherPhraseFor(code: number): string {
  if (code === 0) return 'clear';
  if (code === 1) return 'mostly clear';
  if (code === 2) return 'partly cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'foggy';
  if (code >= 51 && code <= 57) return 'drizzling';
  if (code === 61 || code === 63) return 'raining';
  if (code === 65 || code === 67) return 'heavy rain';
  if (code === 66) return 'freezing rain'; // vanishingly unlikely at 3°N
  if (code >= 71 && code <= 77) return 'snowing'; // never happens here, but map it
  if (code >= 80 && code <= 82) return 'afternoon showers';
  if (code === 85 || code === 86) return 'snow showers';
  if (code >= 95 && code <= 99) return 'thunderstorm';
  return 'unsettled';
}

const WEATHER_URL =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${OMORO.latitude}` +
  `&longitude=${OMORO.longitude}` +
  `&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m` +
  `&timezone=${encodeURIComponent(OMORO.timezone)}` +
  `&temperature_unit=fahrenheit` +
  `&wind_speed_unit=mph`;

/**
 * Server-side fetch for the current Omoro weather. Cached 15 minutes
 * via Next fetch revalidation (unstable_cache would work too, but
 * this is the same route the docs use and it colocates the cache
 * key with the URL).
 *
 * Returns `null` on any failure — never throws. Callers render the
 * atmosphere widget without weather when null, showing just the
 * time. The page never breaks because Open-Meteo hiccuped.
 */
export async function fetchOmoroWeather(): Promise<OmoroWeather | null> {
  try {
    const res = await fetch(WEATHER_URL, {
      // 15 minutes of cache. Weather doesn't move faster than that in
      // ways a sponsor cares about, and this keeps us well inside the
      // free-tier limits even at high traffic.
      next: { revalidate: 900 },
      // 4-second budget — /me is a warm surface that shouldn't stall
      // on a slow third-party. If the API is sluggish, degrade to
      // time-only rendering. AbortSignal.timeout requires Node 17+
      // (we're on 20 in the Vercel runtime), and is the modern
      // signature Next.js expects.
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      current?: {
        time?: string;
        temperature_2m?: number;
        weather_code?: number;
        relative_humidity_2m?: number;
        wind_speed_10m?: number;
      };
    };
    const c = data.current;
    if (
      !c ||
      typeof c.temperature_2m !== 'number' ||
      typeof c.weather_code !== 'number'
    ) {
      return null;
    }
    return {
      temperatureF: Math.round(c.temperature_2m),
      weatherCode: c.weather_code,
      humidityPct: Math.round(c.relative_humidity_2m ?? 0),
      windMph: Math.round(c.wind_speed_10m ?? 0),
      phrase: weatherPhraseFor(c.weather_code),
      observedAt: c.time ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * The server's current wall-clock time AT the campus. Client will
 * refine this to the current minute on hydration, but rendering the
 * server value first avoids a flash of "—:—" during hydration.
 *
 * Returns an ISO-8601-ish string WITHOUT a timezone suffix so the
 * client can format it as-if-local (there's no need to convert; the
 * client just displays it as the campus's wall clock).
 */
export function serverCampusNow(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OMORO.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) =>
    parts.find(p => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
