/**
 * Client-side "unread updates" tracker.
 *
 * Model
 * ─────
 * When a personal child update (child_updates row, NOT the monthly
 * newsletter) is published for a kid, we want the sponsor's Your Kids
 * tab and the specific kid card on /me to flag "there's something new
 * for this kid you haven't read yet."
 *
 * Storage
 * ───────
 * localStorage["ban-updates-seen-v1"] = {
 *   "HSP/BAN-017": "2026-07-06T14:00:00.000Z",   // last time viewer
 *   "HSP/BAN-020": "2026-07-01T22:00:00.000Z",   // hit kid page
 *   ...
 * }
 *
 * Key is child_id_legacy (the "HSP/BAN-XXX" string) because it's
 * stable, human-readable, and the field every route already carries.
 *
 * Rules
 * ─────
 *   - `markSeen(id, now)` on kid-page mount. Never decreases; if the
 *     stored value is already newer we leave it alone (defensive
 *     against clock skew or race with a fresh update publish).
 *   - `isUnread(id, latestUpdatePublishedAt)` returns true when the
 *     kid has an update published AFTER the last recorded visit, or
 *     when the kid has an update and the viewer has never visited.
 *
 * Per-browser, no server round-trip. If a sponsor uses two devices,
 * the badge shows on both until they visit on both. That's the right
 * default — "new to this device."
 */

const STORAGE_KEY = 'ban-updates-seen-v1';

type SeenMap = Record<string, string>; // childIdLegacy → ISO timestamp

function readMap(): SeenMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: SeenMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage quota, private-browsing, etc. — silently degrade.
  }
}

export function getSeenAt(childIdLegacy: string | null | undefined): string | null {
  if (!childIdLegacy) return null;
  return readMap()[childIdLegacy] ?? null;
}

export function markSeen(
  childIdLegacy: string | null | undefined,
  at: Date | string = new Date()
): void {
  if (!childIdLegacy) return;
  const ts = typeof at === 'string' ? at : at.toISOString();
  const map = readMap();
  const current = map[childIdLegacy];
  if (!current || current < ts) {
    map[childIdLegacy] = ts;
    writeMap(map);
  }
}

/**
 * True when the kid has a published update and either:
 *   - viewer has never visited (seenAt = null), or
 *   - the update was published after the viewer's last visit.
 */
export function isUnread(
  childIdLegacy: string | null | undefined,
  latestUpdatePublishedAt: string | null | undefined
): boolean {
  if (!latestUpdatePublishedAt) return false;
  const seenAt = getSeenAt(childIdLegacy);
  if (!seenAt) return true;
  return seenAt < latestUpdatePublishedAt;
}
