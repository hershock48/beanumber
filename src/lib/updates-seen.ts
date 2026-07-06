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

/**
 * Same-tab change event. localStorage's native `storage` event only
 * fires in OTHER tabs — the tab that made the write gets nothing.
 * So when we mark a kid seen in-place (e.g., landing on the kid page),
 * the nav dot and the /me kid-card pill would stay red until a full
 * navigation forced a remount. That's the exact UX bug Kevin would
 * hit clicking through from /me to a kid page and back. This custom
 * event, dispatched by every write helper, is the in-tab signal.
 *
 * Consumers: UnreadYourKidsDot, KidCardUnreadBadge,
 * UnreadNewsletterPill. All subscribe on mount and re-evaluate.
 */
export const SEEN_CHANGE_EVENT = 'ban:updates-seen-change';

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

function dispatchSeenChange(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(SEEN_CHANGE_EVENT));
  } catch {
    // dispatchEvent is safe in modern browsers, but the whole
    // notification system tolerates a missing signal — silence it.
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
    dispatchSeenChange();
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
