/**
 * Sponsor relationship detection — shared between /children/[N] and
 * /meet/[childId] so both surfaces can recognize signed-in sponsors
 * via the same code path.
 *
 * Pulls the viewer&rsquo;s email from the sponsor_session cookie, then asks
 * Airtable: does an Active or Holder Sponsorship exist for this email
 * AND this kid? Uses the dual-OR formula (ChildID equality OR
 * FIND-on-Children-link with comma-bracketing) for robustness against
 * legacy rows where ChildID was left blank.
 *
 * Returns null when there&rsquo;s no signed-in viewer or no matching
 * sponsorship, allowing the calling page to fall through to its
 * cold-visitor view.
 */

import { cookies } from 'next/headers';
import { SESSION } from '@/lib/constants';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || '';
const SPONSORSHIPS_TABLE =
  process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';

export interface ViewerRelationship {
  /** 'sponsor' when Active + monthly > 0, 'holder' otherwise. */
  kind: 'sponsor' | 'holder';
  sponsorCode: string;
  monthlyAmount: number;
  /** ISO date when the sponsorship started, or undefined. */
  startDate?: string;
  /** ISO timestamp when the sponsor first revealed this kid. */
  childRevealedAt?: string;
}

/**
 * Read the sponsor_session cookie and return the viewer&rsquo;s email
 * (lowercased, trimmed), or null if not signed in / cookie expired.
 */
export async function getViewerEmail(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION.COOKIE_NAME);
    if (!raw) return null;
    const session = JSON.parse(raw.value);
    if (new Date(session.expires) < new Date()) return null;
    const email = (session.email as string | undefined)?.trim().toLowerCase();
    return email && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

/**
 * Returns the viewer&rsquo;s sponsorship of the given kid, if any. Pass the
 * kid&rsquo;s ChildID (e.g., "HSP/BAN-002") so the formula matches against
 * both the denormalized text field and the Children linked-record
 * primary field via FIND.
 */
export async function getViewerSponsorshipForChild(
  childId: string
): Promise<ViewerRelationship | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return null;
  if (!childId) return null;

  const email = await getViewerEmail();
  if (!email) return null;

  try {
    const safeEmail = email.toLowerCase().replace(/"/g, '\\"');
    const safeChildId = childId.replace(/"/g, '\\"');
    const formula = encodeURIComponent(
      `AND(LOWER({SponsorEmail})="${safeEmail}", OR({Status}="Active",{Status}="Holder"), OR({ChildID}="${safeChildId}", FIND("," & "${safeChildId}" & ",", "," & ARRAYJOIN({Children}, ",") & ",")))`
    );
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        SPONSORSHIPS_TABLE
      )}?filterByFormula=${formula}&maxRecords=1`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const record = data.records?.[0];
    if (!record) return null;
    const f = record.fields || {};
    const status = (f.Status as string) || '';
    const amount = (f.MonthlyAmount as number) || 0;
    const kind: 'sponsor' | 'holder' =
      status === 'Active' && amount > 0 ? 'sponsor' : 'holder';
    return {
      kind,
      sponsorCode: (f.SponsorCode as string) || '',
      monthlyAmount: amount,
      startDate: f.SponsorshipStartDate as string | undefined,
      childRevealedAt: f.ChildRevealedAt as string | undefined,
    };
  } catch {
    return null;
  }
}
