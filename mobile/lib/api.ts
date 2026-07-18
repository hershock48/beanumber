/**
 * Typed API client. All mobile → web calls go through here. Reads
 * the base URL from app.json's extra.apiBaseUrl so dev / prod
 * switching is one config edit, not a code search.
 *
 * Every shape mirrors what the corresponding /api route on
 * beanumber.org returns. When the web API contract changes, this
 * file changes in lockstep — that's the type-safety guarantee.
 *
 * Auth: `authFetch` attaches Bearer token when present and handles
 * the token-refresh dance transparently. When the server returns 401
 * with body `{ error: 'tokenExpired' }`, we call /refresh, get a
 * fresh token, and retry the original request once. If refresh
 * itself fails, we throw a 401 ApiError and the UI should show the
 * sign-in screen.
 */
import Constants from 'expo-constants';
import { getAccessToken, refreshToken } from './auth';

// Resolution order:
//   1. EXPO_PUBLIC_API_BASE_URL — set per-profile in eas.json, inlined
//      at build time. The one EAS builds actually use.
//   2. app.json extra.apiBaseUrl — dev/Expo Go escape hatch.
//   3. Production www host. Bare beanumber.org 307s to www, and a
//      redirect on a POST body is a straight request-eater — always
//      target www directly.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  'https://www.beanumber.org';

export { API_BASE_URL };

export interface Kid {
  reserved: boolean;
  record_id?: string;
  child_id?: string;
  display_name?: string;
  first_name?: string;
  last_initial?: string;
  age?: number;
  grade_class?: string;
  shirt_number?: number;
  photo_url?: string;
  photo_urls?: string[];
  home_village?: string;
  family_context?: string;
  loves?: string;
  child_quote?: string;
  teacher_name?: string;
  teacher_quote?: string;
  name_meaning?: string;
  notes?: string;
  student_of_month?: string;
  student_of_month_reason?: string;
  departed_at?: string;
  departure_note?: string;
}

export interface CampusNewsletter {
  id: string;
  title: string;
  subject: string;
  bodyHtml: string;
  heroPhotoUrl?: string;
  publishedAt?: string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function get<T>(path: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(body || res.statusText, res.status);
  }
  return (await res.json()) as T;
}

/**
 * Authenticated fetch. Attaches Bearer token from lib/auth.ts.
 * On 401 with body `{ error: 'tokenExpired' }`, refreshes once and
 * retries. On any other non-2xx, throws ApiError.
 */
export async function authFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

  const doFetch = async () => {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      ...((init.headers as Record<string, string>) || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(url, { ...init, headers });
  };

  let res = await doFetch();
  if (res.status === 401) {
    // Peek at the body to decide whether this is a refreshable
    // "token expired" or a hard "not signed in / revoked" case.
    const text = await res.clone().text().catch(() => '');
    let expired = false;
    try {
      const body = text ? JSON.parse(text) : {};
      expired = body?.error === 'tokenExpired';
    } catch {
      // Non-JSON — treat as hard failure.
    }

    if (expired) {
      const refreshed = await refreshToken();
      if (refreshed) {
        res = await doFetch();
        if (res.ok) return res;
      }
    }

    const finalBody = text || (await res.text().catch(() => ''));
    throw new ApiError(finalBody || 'Unauthorized', res.status);
  }
  return res;
}

/**
 * authFetch + JSON parse + non-2xx → ApiError convenience wrapper.
 *
 * Envelope unwrap: the /api/mobile/v1/* data routes wrap their
 * payloads in `{ success: true, data: <T>, timestamp }` (the server's
 * createSuccessResponse helper). Callers here type against the
 * PAYLOAD, so we unwrap transparently. Routes that return raw JSON
 * (auth, push, deferred-link, claim) pass through untouched — they
 * don't match the envelope shape.
 */
export async function authJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await authFetch(path, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(body || res.statusText, res.status);
  }
  const json = (await res.json()) as unknown;
  if (
    json !== null &&
    typeof json === 'object' &&
    (json as { success?: unknown }).success === true &&
    'data' in (json as Record<string, unknown>)
  ) {
    return (json as { data: T }).data;
  }
  return json as T;
}

/**
 * GET /api/children/[shirtNumber]
 * Returns the kid at that shirt number. Throws ApiError(404) when
 * no kid matches.
 */
export async function getKidByShirtNumber(shirtNumber: number): Promise<Kid> {
  return get<Kid>(`/api/children/${shirtNumber}`);
}

/**
 * GET /api/news (TBD endpoint — for now, no-op returning empty).
 * Phase 2 wires this against a real endpoint that mirrors the
 * web's getRecentCampusNewsletters.
 */
export async function getRecentNewsletters(): Promise<CampusNewsletter[]> {
  try {
    return await get<CampusNewsletter[]>('/api/news');
  } catch {
    return [];
  }
}

// ─── /api/mobile/v1/* typed clients ───────────────────────────────────

export interface MyKidRow {
  id: string;
  firstName: string;
  shirtNumber: number;
  photoUrl?: string | null;
  ageYears?: number | null;
  gradeLabel?: string | null;
  roleForViewer: 'monthly' | 'holder';
  unreadUpdatesCount: number;
  lastUpdatePreview?: string | null;
}

export async function getMyKids(): Promise<MyKidRow[]> {
  const data = await authJson<{ kids: MyKidRow[] }>('/api/mobile/v1/kids/mine');
  return data.kids ?? [];
}

export interface MobileKidBio {
  fullName?: string;
  ageYears?: number | null;
  gradeLabel?: string;
  favoriteClass?: string;
  wantsToBe?: string;
  family?: string;
  homeVillage?: string;
  sponsoredSince?: string;
}

export interface MobileKidViewer {
  roleForKid: 'monthly' | 'holder' | 'otherSponsor' | 'anonymous';
  canReadNotes: boolean;
  canWriteNotes: boolean;
  canReadUpdates: boolean;
  /** True when nobody holds this number yet and the viewer may claim
   *  it. Drives the reveal screen's "Keep #N" CTA. */
  canClaim?: boolean;
}

export interface MobileKidDetail {
  reserved?: boolean;
  id: string;
  firstName: string;
  shirtNumber: number;
  photoUrl?: string | null;
  photoUrls?: string[];
  ageYears?: number | null;
  gradeLabel?: string | null;
  intro?: string | null;
  bio: MobileKidBio;
  viewer: MobileKidViewer;
  location?: string;
  coSponsors?: string[]; // first names only
}

export async function getMobileKid(shirtNumber: number): Promise<MobileKidDetail> {
  // The kid detail IS the payload — no extra nesting.
  return authJson<MobileKidDetail>(`/api/mobile/v1/kids/${shirtNumber}`);
}

// ─── Claim + email linking ────────────────────────────────────────────

export interface ClaimResult {
  ok: true;
  role: 'monthly' | 'holder';
  alreadyYours: boolean;
  shirtNumber: number;
  kidFirstName: string;
}

export class NumberClaimedError extends ApiError {
  constructor() {
    super('number_claimed', 409);
  }
}

/**
 * POST /api/mobile/v1/claim — make this number the viewer's.
 * Throws NumberClaimedError when someone else already holds it;
 * plain ApiError on anything else.
 */
export async function claimNumber(shirtNumber: number): Promise<ClaimResult> {
  const res = await authFetch('/api/mobile/v1/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shirtNumber }),
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    if (body?.code === 'number_claimed') throw new NumberClaimedError();
    throw new ApiError(body?.error || 'Conflict', 409);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(text || res.statusText, res.status);
  }
  return (await res.json()) as ClaimResult;
}

/**
 * POST /api/mobile/v1/link/request — ask the server to email a
 * confirmation link to the viewer's purchase email. Always resolves
 * success-shaped (privacy: the server never reveals whether the email
 * exists); throws only on network/auth failures.
 */
export async function requestEmailLink(email: string): Promise<void> {
  await authJson<{ success: boolean }>('/api/mobile/v1/link/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export interface KidUpdate {
  id: string;
  publishedAt: string;
  caption: string;
  photoUrl?: string;
}

export async function getKidUpdates(shirtNumber: number): Promise<KidUpdate[]> {
  const data = await authJson<{ updates: KidUpdate[] }>(
    `/api/mobile/v1/kids/${shirtNumber}/updates`
  );
  return data.updates ?? [];
}

export interface KidTimelineEntry {
  id: string;
  occurredOn: string;
  type: 'sotm' | 'promotion' | 'milestone';
  title: string;
  subtitle?: string;
}

export async function getKidTimeline(
  shirtNumber: number
): Promise<KidTimelineEntry[]> {
  const data = await authJson<{ entries: KidTimelineEntry[] }>(
    `/api/mobile/v1/kids/${shirtNumber}/timeline`
  );
  return data.entries ?? [];
}

export interface ThreadResponse {
  messages: Array<{
    id: string;
    direction: 'sponsorToKid' | 'kidToSponsor';
    sentAt: string;
    body: string;
    statusText?: string;
    /** 1–4 letter-journey stage on sponsor notes; null on replies. */
    stage?: number | null;
  }>;
  kidIsWritingBack: boolean;
  locked?: boolean;
  unlockCopy?: string;
}

export async function getThread(shirtNumber: number): Promise<ThreadResponse> {
  try {
    const data = await authJson<ThreadResponse>(
      `/api/mobile/v1/kids/${shirtNumber}/thread`
    );
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      // Locked — the server returned the unlock copy in the body.
      try {
        const parsed = JSON.parse(err.message);
        return {
          messages: [],
          kidIsWritingBack: false,
          locked: true,
          unlockCopy: parsed.unlockCopy,
        };
      } catch {
        return { messages: [], kidIsWritingBack: false, locked: true };
      }
    }
    throw err;
  }
}

export interface SentMessage {
  id: string;
  direction: 'sponsorToKid' | 'kidToSponsor';
  sentAt: string;
  body: string;
  statusText?: string;
  /** 1–4 letter-journey stage — a fresh send starts at 1. */
  stage?: number | null;
}

export async function sendNote(
  shirtNumber: number,
  body: string
): Promise<SentMessage> {
  // The created message IS the payload — no extra nesting.
  return authJson<SentMessage>(`/api/mobile/v1/kids/${shirtNumber}/thread`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

export interface CampusFeedItem {
  id: string;
  publishedAt: string;
  kind: 'update' | 'sotm' | 'milestone' | 'campusPost';
  title: string;
  body?: string;
  photoUrl?: string;
  kidRef?: {
    firstName: string;
    shirtNumber: number;
  } | null;
}

export interface CampusFeedResponse {
  items: CampusFeedItem[];
  nextCursor?: string | null;
}

export async function getCampusFeed(
  opts: { limit?: number; before?: string } = {}
): Promise<CampusFeedResponse> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.before) params.set('before', opts.before);
  const suffix = params.toString() ? `?${params}` : '';
  return authJson<CampusFeedResponse>(`/api/mobile/v1/campus/feed${suffix}`);
}

export interface ExploreKidRow {
  id: string;
  firstName: string;
  shirtNumber: number;
  photoUrl?: string | null;
  ageYears?: number | null;
  gradeLabel?: string | null;
  /** Tile-ready "Loves football" line from the server, or null. */
  lovesPhrase?: string | null;
}

export async function getExploreKids(
  opts: { limit?: number; excludeMine?: boolean } = { excludeMine: true }
): Promise<ExploreKidRow[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.excludeMine !== undefined)
    params.set('excludeMine', String(opts.excludeMine));
  const data = await authJson<{ kids: ExploreKidRow[] }>(
    `/api/mobile/v1/campus/explore?${params}`
  );
  return data.kids ?? [];
}

export interface LatestNewsletter {
  id: string;
  title: string;
  subject?: string;
  teaser?: string;
  heroPhotoUrl?: string;
  bodyHtml?: string;
  publishedAt: string;
}

export async function getLatestNewsletter(): Promise<LatestNewsletter | null> {
  try {
    // The newsletter IS the payload; the server signals "none yet"
    // with id: null rather than a 404.
    const data = await authJson<
      (LatestNewsletter & { id: string | null }) | null
    >('/api/mobile/v1/newsletter/latest');
    if (!data || !data.id) return null;
    return data as LatestNewsletter;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export interface MeMineSponsorship {
  kidFirstName: string;
  shirtNumber: number;
  monthlyAmount: number;
  sponsoredBy: 'you' | 'someoneElse';
  sponsorOfRecord?: { firstName: string };
}

export interface MePurchase {
  shirtDisplay: string;
  sizeCode?: string;
  colorLabel?: string;
  purchasedOn: string;
  amountUsd?: number | null;
}

export interface MeBilling {
  cardLast4?: string | null;
  receiptsEmail?: string;
  hasCardOnFile: boolean;
}

export interface MeResponse {
  userId: string;
  email: string;
  firstName?: string | null;
  sponsorships: MeMineSponsorship[];
  purchases: MePurchase[];
  billing: MeBilling;
}

export async function getMe(): Promise<MeResponse> {
  return authJson<MeResponse>('/api/mobile/v1/me');
}

/**
 * POST /api/mobile/v1/account/delete
 *
 * Apple's mandatory in-app account-deletion path (Guideline 5.1.1(v)).
 * Wipes the mobile_users row + cascades to push devices / prompts /
 * deliveries. Does NOT cancel Stripe subscriptions — that's the
 * sponsor's separate call, spelled out in the confirmation copy.
 */
export async function deleteAccount(): Promise<{ ok: boolean }> {
  return authJson<{ ok: boolean }>('/api/mobile/v1/account/delete', {
    method: 'POST',
  });
}
