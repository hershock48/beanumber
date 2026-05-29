/**
 * Reassign a departed kid's slot to a new kid.
 *
 * GET /api/admin/roster/reassign?shirtNumber=N
 *   Returns context for the reassign UI:
 *     - the kid currently at that shirt #
 *     - the sponsorships linked to that kid
 *     - replacement candidates (same grade, no active sponsorship,
 *       not departed) ranked youngest-first
 *
 * POST /api/admin/roster/reassign
 *   Body: {
 *     fromShirtNumber: number,        // the departed kid's number
 *     toReplacementRecordId: string,  // the new kid's record ID
 *   }
 *
 *   Atomic-ish transfer:
 *     1. Move departed kid's ShirtNumber → ArchivedShirtNumber, clear ShirtNumber.
 *     2. If replacement had an existing ShirtNumber, move it to their
 *        ArchivedShirtNumber. Set replacement's ShirtNumber = departed's old #.
 *     3. For each active Sponsorship linked to the departed kid:
 *          - Append departed kid's ChildID to PreviousChildIDs
 *          - Swap Children link: departed → replacement
 *          - Set LastReassignedAt = now
 *          - Clear ChildRevealedAt so the reveal overlay fires next visit
 *
 *   Admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';
import { normalizeGrade } from '@/lib/admin/grade';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const SPONSORSHIPS_TABLE =
  process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';

const F_CHILDREN = {
  shirtNumber: 'fldFLnW4dMCjyKFkO',
  archivedShirtNumber: 'fld01whJoezADPNB6',
};
const F_SPONSORSHIPS = {
  children: 'fld5hJJWvO9E2qVFg',
  previousChildIDs: 'fldM0JVmkm6ezr4Vc',
  lastReassignedAt: 'fldAggq3BvZKaIFDi',
  childRevealedAt: 'fldxnWrpn1QMFQUOf',
};

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

interface ChildFields {
  ChildID?: string;
  ShirtNumber?: number;
  DisplayName?: string;
  FirstName?: string;
  GradeClass?: string;
  ProfilePhoto?: Array<{ url: string; thumbnails?: { large?: { url: string } } }>;
  DepartedAt?: string;
}

interface ChildRecord {
  id: string;
  fields: ChildFields;
}

interface SponsorshipFields {
  Status?: { name?: string } | string;
  SponsorEmail?: string;
  SponsorName?: string;
  Children?: string[];
  PreviousChildIDs?: string;
}

interface SponsorshipRecord {
  id: string;
  fields: SponsorshipFields;
}

async function findKidByShirtNumber(n: number): Promise<ChildRecord | null> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    CHILDREN_TABLE
  )}?filterByFormula=${encodeURIComponent(`{ShirtNumber}=${n}`)}&maxRecords=1`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.records?.[0] as ChildRecord) || null;
}

async function getKidByRecordId(id: string): Promise<ChildRecord | null> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    CHILDREN_TABLE
  )}/${id}`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as ChildRecord;
}

async function findSponsorshipsForKid(
  childRecordId: string
): Promise<SponsorshipRecord[]> {
  const formula = `AND(
    FIND("${childRecordId}", ARRAYJOIN({Children}))>0,
    OR({Status}="Active", {Status}="Awaiting Sponsor")
  )`.replace(/\s+/g, ' ');
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    SPONSORSHIPS_TABLE
  )}?filterByFormula=${encodeURIComponent(formula)}&pageSize=50`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records || []) as SponsorshipRecord[];
}

async function fetchActiveSponsorshipChildIds(): Promise<Set<string>> {
  // Returns every Children record ID that has an active or awaiting
  // sponsorship — used to exclude already-sponsored kids from the
  // replacement-candidate list.
  const formula = `OR({Status}="Active", {Status}="Awaiting Sponsor")`;
  const set = new Set<string>();
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    params.set('filterByFormula', formula);
    params.set('pageSize', '100');
    params.append('fields[]', 'Children');
    if (offset) params.set('offset', offset);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      SPONSORSHIPS_TABLE
    )}?${params.toString()}`;
    const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
    if (!res.ok) break;
    const data = await res.json();
    for (const r of data.records || []) {
      const kids = (r.fields?.Children as string[]) || [];
      for (const k of kids) set.add(k);
    }
    offset = data.offset;
  } while (offset);
  return set;
}

async function listEligibleReplacements(
  departedKid: ChildRecord
): Promise<
  Array<{
    recordId: string;
    shirtNumber: number;
    displayName: string;
    photoUrl: string | null;
    gradeClass: string;
    gradeKey: string;
  }>
> {
  const targetGradeKey = normalizeGrade(departedKid.fields.GradeClass).key;
  const sponsored = await fetchActiveSponsorshipChildIds();
  // Pull all active kids.
  const out: ChildRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    if (offset) params.set('offset', offset);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}?${params.toString()}`;
    const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
    if (!res.ok) break;
    const data = await res.json();
    out.push(...((data.records || []) as ChildRecord[]));
    offset = data.offset;
  } while (offset);

  return out
    .filter(r => {
      const f = r.fields;
      // Exclude: the departed kid themselves, kids with no shirt
      // number (incomplete records), departed kids, kids already
      // sponsored, kids in a different grade.
      if (r.id === departedKid.id) return false;
      if (typeof f.ShirtNumber !== 'number' || f.ShirtNumber < 1) return false;
      if (f.DepartedAt) return false;
      if (sponsored.has(r.id)) return false;
      const gradeKey = normalizeGrade(f.GradeClass).key;
      if (gradeKey !== targetGradeKey) return false;
      return true;
    })
    .map(r => {
      const f = r.fields;
      const photoArr = f.ProfilePhoto || [];
      return {
        recordId: r.id,
        shirtNumber: f.ShirtNumber!,
        displayName: f.DisplayName || f.FirstName || `Kid #${f.ShirtNumber}`,
        photoUrl:
          photoArr[0]?.thumbnails?.large?.url || photoArr[0]?.url || null,
        gradeClass: f.GradeClass || '',
        gradeKey: normalizeGrade(f.GradeClass).key,
      };
    })
    .sort((a, b) => a.shirtNumber - b.shirtNumber);
}

// ─── GET — context for the reassign UI ───────────────────────────

export async function GET(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = (await getAdminRole()) || 'admin';
  if (role !== 'admin') {
    return NextResponse.json(
      { error: 'Admin only' },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const shirtNumberStr = url.searchParams.get('shirtNumber');
  const shirtNumber = shirtNumberStr ? Number(shirtNumberStr) : NaN;
  if (!Number.isInteger(shirtNumber) || shirtNumber < 1) {
    return NextResponse.json(
      { error: 'shirtNumber query param required' },
      { status: 400 }
    );
  }

  const kid = await findKidByShirtNumber(shirtNumber);
  if (!kid) {
    return NextResponse.json(
      { error: `No kid found at shirt #${shirtNumber}` },
      { status: 404 }
    );
  }

  const sponsorships = await findSponsorshipsForKid(kid.id);
  const replacements = await listEligibleReplacements(kid);

  return NextResponse.json({
    ok: true,
    kid: {
      recordId: kid.id,
      shirtNumber: kid.fields.ShirtNumber,
      displayName:
        kid.fields.DisplayName ||
        kid.fields.FirstName ||
        `Kid #${shirtNumber}`,
      gradeClass: kid.fields.GradeClass || '',
      gradeKey: normalizeGrade(kid.fields.GradeClass).key,
      gradeLabel: normalizeGrade(kid.fields.GradeClass).label,
      departedAt: kid.fields.DepartedAt || null,
    },
    sponsorships: sponsorships.map(s => ({
      recordId: s.id,
      sponsorName: s.fields.SponsorName || '(unnamed sponsor)',
      sponsorEmail: s.fields.SponsorEmail || '',
      status:
        typeof s.fields.Status === 'string'
          ? s.fields.Status
          : s.fields.Status?.name || '',
    })),
    replacements,
  });
}

// ─── POST — execute the transfer ────────────────────────────────

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = (await getAdminRole()) || 'admin';
  if (role !== 'admin') {
    return NextResponse.json(
      { error: 'Admin only — only Kevin can reassign a sponsorship slot.' },
      { status: 403 }
    );
  }

  let body: {
    fromShirtNumber?: number;
    toReplacementRecordId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const fromShirtNumber = body.fromShirtNumber;
  const toReplacementRecordId = body.toReplacementRecordId;
  if (
    typeof fromShirtNumber !== 'number' ||
    !Number.isInteger(fromShirtNumber) ||
    fromShirtNumber < 1
  ) {
    return NextResponse.json(
      { error: 'fromShirtNumber must be a positive integer' },
      { status: 400 }
    );
  }
  if (!toReplacementRecordId || !toReplacementRecordId.startsWith('rec')) {
    return NextResponse.json(
      { error: 'toReplacementRecordId required' },
      { status: 400 }
    );
  }

  const departing = await findKidByShirtNumber(fromShirtNumber);
  if (!departing) {
    return NextResponse.json(
      { error: `No kid at shirt #${fromShirtNumber}` },
      { status: 404 }
    );
  }
  const replacement = await getKidByRecordId(toReplacementRecordId);
  if (!replacement) {
    return NextResponse.json(
      { error: 'Replacement kid not found' },
      { status: 404 }
    );
  }
  if (replacement.id === departing.id) {
    return NextResponse.json(
      { error: 'Cannot reassign a kid to themselves' },
      { status: 400 }
    );
  }
  if (replacement.fields.DepartedAt) {
    return NextResponse.json(
      { error: 'Replacement kid is marked departed — pick a different one' },
      { status: 400 }
    );
  }

  const departedChildId = departing.fields.ChildID || '';
  const sponsorships = await findSponsorshipsForKid(departing.id);

  try {
    // Step 1: move shirt #s. Replacement's old number (if any) goes
    // into their archive slot; replacement takes departing's number;
    // departing's number lands in their own archive slot.
    const replacementOldShirt = replacement.fields.ShirtNumber;
    // Patch the replacement first — set new ShirtNumber + archive
    // the old one if they had one.
    {
      const fields: Record<string, unknown> = {
        [F_CHILDREN.shirtNumber]: fromShirtNumber,
      };
      if (typeof replacementOldShirt === 'number') {
        fields[F_CHILDREN.archivedShirtNumber] = replacementOldShirt;
      }
      const res = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
          CHILDREN_TABLE
        )}/${replacement.id}`,
        {
          method: 'PATCH',
          headers: atHeaders(),
          body: JSON.stringify({ fields, typecast: true }),
        }
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: `Replacement update failed: ${res.status} ${await res.text()}` },
          { status: 502 }
        );
      }
    }
    // Patch the departing kid — archive their (now-stolen) number
    // and clear it. Two separate PATCHes since Airtable enforces a
    // unique constraint... actually no it doesn't, but doing them
    // in this order avoids any race-condition collision.
    {
      const fields: Record<string, unknown> = {
        [F_CHILDREN.archivedShirtNumber]: fromShirtNumber,
        [F_CHILDREN.shirtNumber]: null,
      };
      const res = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
          CHILDREN_TABLE
        )}/${departing.id}`,
        {
          method: 'PATCH',
          headers: atHeaders(),
          body: JSON.stringify({ fields, typecast: true }),
        }
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: `Departing update failed: ${res.status} ${await res.text()}` },
          { status: 502 }
        );
      }
    }

    // Step 2: update each sponsorship.
    const now = new Date().toISOString();
    for (const s of sponsorships) {
      const existingHistory = (s.fields.PreviousChildIDs as string) || '';
      const updatedHistory = existingHistory
        ? `${existingHistory}\n${departedChildId}`
        : departedChildId;
      const res = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
          SPONSORSHIPS_TABLE
        )}/${s.id}`,
        {
          method: 'PATCH',
          headers: atHeaders(),
          body: JSON.stringify({
            fields: {
              [F_SPONSORSHIPS.children]: [replacement.id],
              [F_SPONSORSHIPS.previousChildIDs]: updatedHistory,
              [F_SPONSORSHIPS.lastReassignedAt]: now,
              [F_SPONSORSHIPS.childRevealedAt]: null,
            },
            typecast: true,
          }),
        }
      );
      if (!res.ok) {
        console.warn(
          `[reassign] sponsorship ${s.id} update failed:`,
          await res.text()
        );
      }
    }

    return NextResponse.json({
      ok: true,
      transferredSponsorships: sponsorships.length,
      newShirtNumberForReplacement: fromShirtNumber,
      replacementName:
        replacement.fields.DisplayName ||
        replacement.fields.FirstName ||
        'kid',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
