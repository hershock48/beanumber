/**
 * Tiny helper for reading the "was the app opened via /meet/[N]?"
 * intent that drives the sign-in screen's headline.
 *
 * Called from useDeepLinkShirtNumber() in the sign-in screen. Not
 * a hook itself — the caller is a component that owns the state
 * and re-runs if the URL arrives after mount (via Linking listener).
 */
import * as Linking from 'expo-linking';

/**
 * Extract a shirt number from a `/meet/N` path. Returns null when
 * the URL is null / not a meet path / not a valid number.
 */
export function extractMeetShirtNumber(url: string | null): number | null {
  if (!url) return null;
  try {
    // expo-linking parses both http(s) and custom-scheme URLs.
    const parsed = Linking.parse(url);
    // path is like "meet/48" or "meet/48/"
    if (!parsed.path) return null;
    const parts = parsed.path.split('/').filter(Boolean);
    if (parts[0] !== 'meet' || !parts[1]) return null;
    const n = Number(parts[1]);
    if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) return null;
    return n;
  } catch {
    return null;
  }
}

export async function getInitialMeetShirtNumber(): Promise<number | null> {
  try {
    const url = await Linking.getInitialURL();
    return extractMeetShirtNumber(url);
  } catch {
    return null;
  }
}
