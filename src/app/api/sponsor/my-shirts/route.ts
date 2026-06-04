/**
 * GET /api/sponsor/my-shirts
 *
 * Returns the list of kids the visitor is already tied to through
 * prior shirt purchases. Used by /sponsorship to surface "your
 * kids" at the top of the page so a shirt buyer who clicks
 * "Sponsor monthly" defaults to one of the kids on the back of a
 * shirt they actually own — instead of being matched to a random
 * kid from the full roster.
 *
 * Closes the Chad-style mismatch where a multi-shirt buyer ends
 * up sponsoring a kid that's on none of their shirts.
 *
 * Identification (in priority order):
 *   1. sponsor_session cookie → existing sponsor's email
 *   2. ban_buyer_session cookie → the most recent shirt checkout's
 *      Donation → that Donation's email
 *
 * Whichever path resolves an email, we then pull every Donation
 * with that email + a Shirt source, map each one to its linked
 * Child record, and return the unique (shirtNumber, firstName,
 * photoUrl) tuples. Sorted by most recent donation first.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION } from '@/lib/constants';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const DONATIONS_TABLE = process.env.AIRTABLE_DONATIONS_TABLE || 'Donations';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

interface MyShirtKid {
  recordId: string;
  childId: string;
  firstName: string;
  displayName: string;
  shirtNumber: number;
  photoUrl: string | null;
  /** Most recent donation date that touches this kid (ISO yyyy-mm-dd). */
  lastDonationAt: string | null;
}

async function getSponsorEmailFromSession(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION.COOKIE_NAME);
    if (!raw) return null;
    const session = JSON.parse(raw.value);
    if (new Date(session.expires) < new Date()) return null;
    return typeof session.email === 'string' ? session.email : null;
  } catch {
    return null;
  }
}

async function getBuyerEmailFromSession(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('ban_buyer_session');
    if (!raw) return null;
    const sessionId = raw.value.trim();
    if (!sessionId.startsWith('cs_')) return null;
    // Look up the Donation with this checkout session ID to find
    // the buyer's email. Same path /children/[number] uses to
    // resolve buyer context.
    const formula = encodeURIComponent(
      `{Stripe Checkout Session ID}="${sessionId}"`
    );
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      DONATIONS_TABLE
    )}?filterByFormula=${formula}&maxRecords=1`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const email = data.records?.[0]?.fields?.['Donor Email at Donation'];
    return typeof email === 'string' ? email : null;
  } catch {
    return null;
  }
}

/**
 * Pull every Donation for this email whose Donation Source is one
 * of the shirt variants. Returns array of (childRecordId, date)
 * pairs sorted newest first.
 */
async function fetchShirtDonationsForEmail(
  email: string
): Promise<Array<{ childRecordId: string; date: string }>> {
  const safe = email.replace(/"/g, '\\"').toLowerCase();
  // Shirt purchases come through with Donation Source = "Shirt Order"
  // (one-time) or "Shirt + Monthly" (the shirt + sponsorship combo).
  const formula = `AND(
    LOWER({Donor Email at Donation})="${safe}",
    OR({Donation Source}="Shirt Order", {Donation Source}="Shirt + Monthly")
  )`.replace(/\s+/g, ' ');
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    DONATIONS_TABLE
  )}?filterByFormula=${encodeURIComponent(formula)}` +
    `&sort%5B0%5D%5Bfield%5D=Donation%20Date&sort%5B0%5D%5Bdirection%5D=desc` +
    `&pageSize=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = await res.json();
  const out: Array<{ childRecordId: string; date: string }> = [];
  for (const rec of (data.records || []) as Array<{
    id: string;
    fields: { Child?: string[]; 'Donation Date'?: string };
  }>) {
    const linked = rec.fields.Child || [];
    const date = rec.fields['Donation Date'] || '';
    for (const childRecordId of linked) {
      out.push({ childRecordId, date });
    }
  }
  return out;
}

/** Look up a batch of Children records and return display info. */
async function fetchChildrenBatch(
  ids: string[]
): Promise<Map<string, MyShirtKid>> {
  const map = new Map<string, MyShirtKid>();
  if (ids.length === 0) return map;
  // Chunk to keep the formula under Airtable's ~16k char limit.
  const chunkSize = 40;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const formula = `OR(${chunk.map(id => `RECORD_ID()="${id}"`).join(',')})`;
    const params = new URLSearchParams();
    params.set('filterByFormula', formula);
    params.set('pageSize', '100');
    params.append('fields[]', 'ChildID');
    params.append('fields[]', 'FirstName');
    params.append('fields[]', 'DisplayName');
    params.append('fields[]', 'ShirtNumber');
    params.append('fields[]', 'ProfilePhoto');
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      cache: 'no-store',
    });
    if (!res.ok) continue;
    const data = await res.json();
    for (const rec of (data.records || []) as Array<{
      id: string;
      fields: {
        ChildID?: string;
        FirstName?: string;
        DisplayName?: string;
        ShirtNumber?: number;
        ProfilePhoto?: Array<{ url: string; thumbnails?: { large?: { url: string } } }>;
      };
    }>) {
      const photoArr = rec.fields.ProfilePhoto || [];
      map.set(rec.id, {
        recordId: rec.id,
        childId: rec.fields.ChildID || '',
        firstName: rec.fields.FirstName || rec.fields.DisplayName || 'Kid',
        displayName: rec.fields.DisplayName || rec.fields.FirstName || 'Kid',
        shirtNumber:
          typeof rec.fields.ShirtNumber === 'number' ? rec.fields.ShirtNumber : 0,
        photoUrl:
          photoArr[0]?.thumbnails?.large?.url || photoArr[0]?.url || null,
        lastDonationAt: null,
      });
    }
  }
  return map;
}

export async function GET() {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
    return NextResponse.json({ kids: [], identifiedAs: null });
  }

  // 1. Identify the visitor — sponsor session takes precedence,
  // buyer session is the fallback.
  let email = await getSponsorEmailFromSession();
  let identifiedAs: 'sponsor' | 'buyer' | null = email ? 'sponsor' : null;
  if (!email) {
    email = await getBuyerEmailFromSession();
    identifiedAs = email ? 'buyer' : null;
  }
  if (!email) {
    return NextResponse.json({ kids: [], identifiedAs: null });
  }

  // 2. Pull all shirt-source donations for this email.
  const donations = await fetchShirtDonationsForEmail(email);
  if (donations.length === 0) {
    return NextResponse.json({ kids: [], identifiedAs });
  }

  // 3. Hydrate the linked kids.
  const uniqueChildIds = Array.from(new Set(donations.map(d => d.childRecordId)));
  const childMap = await fetchChildrenBatch(uniqueChildIds);

  // 4. Attach each kid's most recent donation date for sorting,
  // dedup by shirtNumber (in case the same kid is linked through
  // multiple donations).
  const byShirt = new Map<number, MyShirtKid>();
  for (const d of donations) {
    const kid = childMap.get(d.childRecordId);
    if (!kid || !kid.shirtNumber) continue;
    const existing = byShirt.get(kid.shirtNumber);
    if (existing) {
      if (!existing.lastDonationAt || d.date > existing.lastDonationAt) {
        existing.lastDonationAt = d.date;
      }
    } else {
      byShirt.set(kid.shirtNumber, { ...kid, lastDonationAt: d.date || null });
    }
  }

  const kids = Array.from(byShirt.values()).sort((a, b) => {
    const ad = a.lastDonationAt || '';
    const bd = b.lastDonationAt || '';
    if (bd !== ad) return bd.localeCompare(ad);
    return a.shirtNumber - b.shirtNumber;
  });

  return NextResponse.json({ kids, identifiedAs, email });
}
