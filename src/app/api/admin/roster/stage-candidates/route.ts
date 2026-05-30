/**
 * POST /api/admin/roster/stage-candidates
 *   Body: { fromShirtNumber: number, candidateRecordIds?: string[] }
 *
 * Stages 3 replacement candidates onto every active sponsorship
 * tied to the kid at fromShirtNumber. Next time each sponsor visits
 * /[their #], they see the chooser instead of the regular profile.
 *
 * If candidateRecordIds isn't supplied, the system picks 3 kids
 * randomly from the same grade (active, not departed, not the
 * departing kid themselves). If the grade has fewer than 3 eligible
 * kids, picks from any grade. Order on disk is the order shown to
 * the sponsor.
 *
 * Admin only.
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

const F_SPONSORSHIPS = {
  pendingCandidateChildIDs: 'fldWZHlDz3fmu8YxS',
  pendingChoiceAt: 'fldg09iRhIkpOshTc',
};

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

interface ChildFields {
  ShirtNumber?: number;
  GradeClass?: string;
  DepartedAt?: string;
}

interface ChildRecord {
  id: string;
  fields: ChildFields;
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

async function listEligibleKids(
  excludeId: string
): Promise<ChildRecord[]> {
  const out: ChildRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    params.append('fields[]', 'ShirtNumber');
    params.append('fields[]', 'GradeClass');
    params.append('fields[]', 'DepartedAt');
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
  return out.filter(r => {
    const f = r.fields;
    if (r.id === excludeId) return false;
    if (typeof f.ShirtNumber !== 'number' || f.ShirtNumber < 1) return false;
    if (f.DepartedAt) return false;
    return true;
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function findSponsorshipsForKid(
  childRecordId: string
): Promise<Array<{ id: string }>> {
  const formula = `AND(
    FIND("${childRecordId}", ARRAYJOIN({Children}))>0,
    OR({Status}="Active", {Status}="Awaiting Sponsor")
  )`.replace(/\s+/g, ' ');
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    SPONSORSHIPS_TABLE
  )}?filterByFormula=${encodeURIComponent(formula)}&pageSize=100`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records || []).map((r: { id: string }) => ({ id: r.id }));
}

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = (await getAdminRole()) || 'admin';
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body: {
    fromShirtNumber?: number;
    candidateRecordIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const fromShirtNumber = body.fromShirtNumber;
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

  const departing = await findKidByShirtNumber(fromShirtNumber);
  if (!departing) {
    return NextResponse.json(
      { error: `No kid at shirt #${fromShirtNumber}` },
      { status: 404 }
    );
  }

  let candidates: string[];
  if (Array.isArray(body.candidateRecordIds) && body.candidateRecordIds.length > 0) {
    candidates = body.candidateRecordIds.filter(
      id => typeof id === 'string' && id.startsWith('rec')
    );
  } else {
    // Auto-pick 3 from same grade. If fewer than 3, pad from any grade.
    const allEligible = await listEligibleKids(departing.id);
    const targetGradeKey = normalizeGrade(departing.fields.GradeClass).key;
    const sameGrade = shuffle(
      allEligible.filter(
        r => normalizeGrade(r.fields.GradeClass).key === targetGradeKey
      )
    );
    const others = shuffle(
      allEligible.filter(
        r => normalizeGrade(r.fields.GradeClass).key !== targetGradeKey
      )
    );
    candidates = [...sameGrade, ...others].slice(0, 3).map(r => r.id);
  }

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: 'No eligible candidates on the roster.' },
      { status: 409 }
    );
  }

  const sponsorships = await findSponsorshipsForKid(departing.id);
  if (sponsorships.length === 0) {
    return NextResponse.json({
      ok: true,
      staged: 0,
      candidates,
      note: 'No active sponsorships on this kid — nothing to stage.',
    });
  }

  const candidateBlob = candidates.join('\n');
  const stagedAt = new Date().toISOString();
  for (const s of sponsorships) {
    await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        SPONSORSHIPS_TABLE
      )}/${s.id}`,
      {
        method: 'PATCH',
        headers: atHeaders(),
        body: JSON.stringify({
          fields: {
            [F_SPONSORSHIPS.pendingCandidateChildIDs]: candidateBlob,
            [F_SPONSORSHIPS.pendingChoiceAt]: stagedAt,
          },
        }),
      }
    );
  }

  return NextResponse.json({
    ok: true,
    staged: sponsorships.length,
    candidates,
  });
}
