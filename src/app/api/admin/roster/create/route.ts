/**
 * Admin · Roster — add a new kid record.
 *
 * POST /api/admin/roster/create
 * Body: {
 *   firstName: string,
 *   displayName?: string,       // defaults to firstName
 *   intakeFromCampus?: string,  // optional raw notes from Simon
 * }
 *
 * Creates a new Children record with the minimum fields needed.
 * Shirt number is auto-assigned: max(existing ShirtNumber) + 1.
 * Status defaults to "Active". ChildID is generated as
 * "HSP/BAN-NNN" matching the assigned shirt number.
 *
 * Returns the new shirtNumber so the caller can redirect to the
 * editor.
 *
 * Auth: admin session cookie or X-Admin-Token header. Both Kevin
 * and Simon can hit this — Simon will use it via the roster's
 * "+ Add new kid" button to seed a record when a new child enrolls
 * at the campus.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

function airtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Walks the Children table (paginated) to find the max ShirtNumber.
 * ~165 rows total means ≤2 page requests.
 */
async function findNextShirtNumber(): Promise<number> {
  let offset: string | undefined;
  let max = 0;
  do {
    const url = new URL(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CHILDREN_TABLE)}`
    );
    url.searchParams.set('pageSize', '100');
    url.searchParams.append('fields[]', 'ShirtNumber');
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: airtableHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Roster scan failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    for (const r of data.records || []) {
      const n = Number(r.fields?.ShirtNumber);
      if (Number.isFinite(n) && n > max) max = n;
    }
    offset = data.offset;
  } while (offset);
  return max + 1;
}

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    firstName?: string;
    displayName?: string;
    intakeFromCampus?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const firstName = (body.firstName || '').trim();
  const displayName = (body.displayName || firstName).trim();
  const intakeFromCampus = (body.intakeFromCampus || '').trim();

  if (!firstName) {
    return NextResponse.json({ error: 'firstName is required' }, { status: 400 });
  }

  try {
    const shirtNumber = await findNextShirtNumber();
    const childId = `HSP/BAN-${String(shirtNumber).padStart(3, '0')}`;

    const fields: Record<string, unknown> = {
      ChildID: childId,
      ShirtNumber: shirtNumber,
      FirstName: firstName,
      DisplayName: displayName || firstName,
      Status: 'Active',
    };
    if (intakeFromCampus) {
      fields.IntakeFromCampus = intakeFromCampus;
    }

    const createUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}`;
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({
        fields,
        typecast: true,
      }),
    });
    if (!createRes.ok) {
      const t = await createRes.text();
      return NextResponse.json(
        { error: `Airtable create failed: ${createRes.status} ${t}` },
        { status: 502 }
      );
    }
    const created = await createRes.json();
    return NextResponse.json({
      ok: true,
      recordId: created.id,
      shirtNumber,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
