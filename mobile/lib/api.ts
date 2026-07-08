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

const API_BASE_URL =
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
  return (await res.json()) as T;
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
