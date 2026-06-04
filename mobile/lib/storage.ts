/**
 * AsyncStorage wrapper. Persists "kids the user has met" as a
 * thin {shirtNumber, firstName, photoUrl, lastSeenAt} ring so the
 * home screen can show a recents row. Holds the last 8.
 *
 * Quiet failure: if storage is unavailable, reads return [] and
 * writes no-op. The app never crashes on a storage error.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENTS_KEY = 'ban.recents.v1';
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
  } catch {
    // No-op.
  }
}

/**
 * Tracked "have we shown the reveal animation for this kid yet"
 * flag. First-visit gets the full ceremonial reveal; second visit
 * cross-fades in to skip the wait.
 */
const REVEALED_KEY = 'ban.revealed.v1';

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
  } catch {
    // No-op.
  }
}
