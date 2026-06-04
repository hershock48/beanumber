/**
 * Typed API client. All mobile → web calls go through here. Reads
 * the base URL from app.json's extra.apiBaseUrl so dev / prod
 * switching is one config edit, not a code search.
 *
 * Every shape mirrors what the corresponding /api route on
 * beanumber.org returns. When the web API contract changes, this
 * file changes in lockstep — that's the type-safety guarantee.
 */
import Constants from 'expo-constants';

const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  'https://www.beanumber.org';

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
