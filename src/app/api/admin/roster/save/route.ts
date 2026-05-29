/**
 * Admin · Roster save — write structured kid fields back to Airtable.
 *
 * POST /api/admin/roster/save
 * Body: {
 *   shirtNumber: number,
 *   fields: {
 *     nameMeaning: string,
 *     familyContext: string,
 *     loves: string,
 *     childQuote: string,
 *     notes: string,
 *   }
 * }
 *
 * Looks up the Child record by shirt number, PATCHes the five
 * structured fields. Auth via cookie or X-Admin-Token header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

// Airtable field IDs for the Children table — using IDs keeps writes
// stable if the field name changes in the UI.
const F = {
  shirtNumber: 'fldFLnW4dMCjyKFkO',
  nameMeaning: 'flddhwxv3FT9DJqaF',
  familyContext: 'fldmN80uNieMZx64U',
  loves: 'fldwBn2AyXKt4vgi5',
  childQuote: 'flds9uA6MCoEbc2dJ',
  notes: 'fldbQuWFgNXnlZIVX',
  intakeFromCampus: 'fldZ3A6XK1yVUzhLJ',
  lastEditedBySimon: 'fldHeGgc5op4WpqAq',
};

function atHeaders() {
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
    fields?: {
      nameMeaning?: string;
      familyContext?: string;
      loves?: string;
      childQuote?: string;
      notes?: string;
      intakeFromCampus?: string;
    };
    // Internal flag: when an admin (Kevin) clicks "Mark as reviewed"
    // in the editor banner, the client sends clearSimonFlag=true and
    // we wipe LastEditedBySimon back to null even though no other
    // fields necessarily changed.
    clearSimonFlag?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const shirtNumber = body.shirtNumber;
  const fields = body.fields || {};
  if (typeof shirtNumber !== 'number' || !Number.isInteger(shirtNumber)) {
    return NextResponse.json({ error: 'shirtNumber must be a positive integer' }, { status: 400 });
  }

  try {
    // Look up the record by shirt number.
    const lookupUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}?filterByFormula=${encodeURIComponent(`{ShirtNumber}=${shirtNumber}`)}&maxRecords=1`;
    const lookupRes = await fetch(lookupUrl, {
      headers: atHeaders(),
      cache: 'no-store',
    });
    if (!lookupRes.ok) {
      const text = await lookupRes.text();
      return NextResponse.json(
        { error: `Airtable lookup failed: ${lookupRes.status} ${text}` },
        { status: 502 }
      );
    }
    const lookupData = await lookupRes.json();
    const record = lookupData.records?.[0];
    if (!record) {
      return NextResponse.json(
        { error: `No child record found for shirt #${shirtNumber}` },
        { status: 404 }
      );
    }

    // Build the patch — only include fields that were sent.
    const patchFields: Record<string, string | null> = {};
    if (typeof fields.nameMeaning === 'string') patchFields[F.nameMeaning] = fields.nameMeaning;
    if (typeof fields.familyContext === 'string') patchFields[F.familyContext] = fields.familyContext;
    if (typeof fields.loves === 'string') patchFields[F.loves] = fields.loves;
    if (typeof fields.childQuote === 'string') patchFields[F.childQuote] = fields.childQuote;
    if (typeof fields.notes === 'string') patchFields[F.notes] = fields.notes;
    if (typeof fields.intakeFromCampus === 'string') patchFields[F.intakeFromCampus] = fields.intakeFromCampus;

    // Simon-edit flag bookkeeping:
    //   - Simon saving anything → stamp LastEditedBySimon = now.
    //   - Kevin saving with clearSimonFlag → wipe LastEditedBySimon.
    //   - Kevin saving without that flag → leave LastEditedBySimon alone.
    const role = await getAdminRole();
    if (role === 'simon' && Object.keys(patchFields).length > 0) {
      patchFields[F.lastEditedBySimon] = new Date().toISOString();
    } else if (role === 'admin' && body.clearSimonFlag) {
      patchFields[F.lastEditedBySimon] = null;
    }

    if (Object.keys(patchFields).length === 0) {
      return NextResponse.json({ ok: true, updated: 0, note: 'No fields to update' });
    }

    const patchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}/${record.id}`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: atHeaders(),
      body: JSON.stringify({ fields: patchFields }),
    });
    if (!patchRes.ok) {
      const text = await patchRes.text();
      return NextResponse.json(
        { error: `Airtable patch failed: ${patchRes.status} ${text}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, recordId: record.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
