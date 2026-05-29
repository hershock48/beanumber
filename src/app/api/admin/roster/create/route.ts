/**
 * Admin · Roster — add a new kid record.
 *
 * POST /api/admin/roster/create
 * Body: {
 *   shirtNumber: number,        // must be unused (1–999)
 *   firstName: string,
 *   displayName?: string,       // defaults to firstName
 *   intakeFromCampus?: string,  // optional raw notes from Simon
 * }
 *
 * Creates a new Children record with the minimum fields needed.
 * Status defaults to "Active". ChildID is generated as
 * "HSP/BAN-NNN" matching the shirt number.
 *
 * Validates the shirt number isn't already in use to prevent
 * accidental clobber of an existing kid.
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

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    shirtNumber?: number;
    firstName?: string;
    displayName?: string;
    intakeFromCampus?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const shirtNumber = body.shirtNumber;
  const firstName = (body.firstName || '').trim();
  const displayName = (body.displayName || firstName).trim();
  const intakeFromCampus = (body.intakeFromCampus || '').trim();

  if (typeof shirtNumber !== 'number' || !Number.isInteger(shirtNumber) || shirtNumber < 1) {
    return NextResponse.json(
      { error: 'shirtNumber must be a positive integer' },
      { status: 400 }
    );
  }
  if (!firstName) {
    return NextResponse.json({ error: 'firstName is required' }, { status: 400 });
  }

  try {
    // Make sure the shirt number isn't already used by an existing
    // canonical kid. If it is, refuse — caller picks a different one.
    const checkUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}?filterByFormula=${encodeURIComponent(`{ShirtNumber}=${shirtNumber}`)}&maxRecords=1`;
    const checkRes = await fetch(checkUrl, {
      headers: airtableHeaders(),
      cache: 'no-store',
    });
    if (!checkRes.ok) {
      const t = await checkRes.text();
      return NextResponse.json(
        { error: `Shirt-number check failed: ${checkRes.status} ${t}` },
        { status: 502 }
      );
    }
    const checkData = await checkRes.json();
    if (checkData.records?.length > 0) {
      return NextResponse.json(
        {
          error: `Shirt #${shirtNumber} is already in use. Pick a different number.`,
        },
        { status: 409 }
      );
    }

    const childId = `HSP/BAN-${String(shirtNumber).padStart(3, '0')}`;
    const fields: Record<string, unknown> = {
      // Primary field
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
