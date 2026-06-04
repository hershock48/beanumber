/**
 * AsyncStorage wrapper. Tracks:
 *
 *  - Recents: kids the user has met (last 8, dedup by shirt #).
 *  - Reveal flags: which kids the user has seen the ceremonial
 *    reveal for. Subsequent visits skip the typewriter.
 *  - First-met dates per kid: drives the "with [name] for N days"
 *    metric. Stored as YYYY-MM-DD per shirt number.
 *  - Visitor since date: first time the app was opened, ever.
 *    Drives the identity strip on home.
 *
 * Quiet failure throughout — reads return safe defaults, writes
 * no-op on storage errors so the app never crashes on storage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENTS_KEY = 'ban.recents.v1';
const REVEALED_KEY = 'ban.revealed.v1';
const FIRST_MET_KEY = 'ban.firstMet.v1';
const VISITOR_SINCE_KEY = 'ban.visitorSince.v1';
const MAX_RECENTS = 8;

export interface RecentKid {
  shirtNumber: number;
  firstName: string;
  displayName: string;
  photoUrl?: string;
  lastSeenAt: number;
}

export async function getRecents(): Promise<RecentKid[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentKid[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(k => k && typeof k.shirtNumber === 'number')
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export async function pushRecent(kid: Omit<RecentKid, 'lastSeenAt'>): Promise<void> {
  try {
    const list = await getRecents();
    const filtered = list.filter(k => k.shirtNumber !== kid.shirtNumber);
    filtered.unshift({ ...kid, lastSeenAt: Date.now() });
    const trimmed = filtered.slice(0, MAX_RECENTS);
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(trimmed));
  } catch {}
}

export async function hasRevealed(shirtNumber: number): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(REVEALED_KEY);
    const set = raw ? new Set<number>(JSON.parse(raw)) : new Set<number>();
    return set.has(shirtNumber);
  } catch {
    return false;
  }
}

export async function markRevealed(shirtNumber: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(REVEALED_KEY);
    const set = raw ? new Set<number>(JSON.parse(raw)) : new Set<number>();
    set.add(shirtNumber);
    await AsyncStorage.setItem(REVEALED_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

/**
 * Record the first time the user opened this kid's profile.
 * Subsequent calls are ignored — the first date is the one we
 * keep, so "with Marvin for N days" counts from the actual
 * meeting moment.
 */
export async function recordFirstMet(shirtNumber: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(FIRST_MET_KEY);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, string>;
    const key = String(shirtNumber);
    if (!map[key]) {
      const today = new Date().toISOString().slice(0, 10);
      map[key] = today;
      await AsyncStorage.setItem(FIRST_MET_KEY, JSON.stringify(map));
    }
  } catch {}
}

export async function getFirstMet(shirtNumber: number): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(FIRST_MET_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[String(shirtNumber)] || null;
  } catch {
    return null;
  }
}

/**
 * "Days with [kid]" — integer days since first met. 0 if today.
 */
export function daysSince(isoDate: string): number {
  const then = new Date(isoDate + 'T00:00:00').getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * The very first time the user opened the app. We stamp this on
 * the first call to ensureVisitorSince() and never overwrite.
 */
export async function ensureVisitorSince(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(VISITOR_SINCE_KEY);
    if (existing) return existing;
    const today = new Date().toISOString().slice(0, 10);
    await AsyncStorage.setItem(VISITOR_SINCE_KEY, today);
    return today;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export async function getVisitorSince(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(VISITOR_SINCE_KEY);
  } catch {
    return null;
  }
}
