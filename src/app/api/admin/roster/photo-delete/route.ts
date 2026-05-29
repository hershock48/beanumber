/**
 * POST /api/admin/roster/photo-delete
 *   Body: { shirtNumber: number, attachmentId: string }
 *
 * Removes one attachment from a kid's ProfilePhoto field. Airtable
 * doesn't expose a per-attachment delete endpoint, so we PATCH the
 * field with the surviving subset (everything except the one we're
 * dropping).
 *
 * Auth: cookie or X-Admin-Token. Both Kevin and Simon can delete
 * individual photos (low-risk relative to deleting a whole kid).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

const F_PROFILE_PHOTO = 'fldRejXxPKpuihgPa';

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

  let body: { shirtNumber?: number; attachmentId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const shirtNumber = body.shirtNumber;
  const attachmentId = body.attachmentId;
  if (typeof shirtNumber !== 'number' || !Number.isInteger(shirtNumber)) {
    return NextResponse.json({ error: 'shirtNumber required' }, { status: 400 });
  }
  if (!attachmentId || typeof attachmentId !== 'string') {
    return NextResponse.json({ error: 'attachmentId required' }, { status: 400 });
  }

  try {
    // Look up kid.
    const lookupUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}?filterByFormula=${encodeURIComponent(`{ShirtNumber}=${shirtNumber}`)}&maxRecords=1`;
    const lookupRes = await fetch(lookupUrl, {
      headers: atHeaders(),
      cache: 'no-store',
    });
    if (!lookupRes.ok) {
      return NextResponse.json(
        { error: `Lookup failed: ${lookupRes.status}` },
        { status: 502 }
      );
    }
    const lookupData = await lookupRes.json();
    const record = lookupData.records?.[0];
    if (!record) {
      return NextResponse.json(
        { error: `No kid for shirt #${shirtNumber}` },
        { status: 404 }
      );
    }
    const currentPhotos =
      (record.fields?.ProfilePhoto as Array<{ id: string }>) || [];
    const survivors = currentPhotos.filter(p => p.id !== attachmentId);
    if (survivors.length === currentPhotos.length) {
      return NextResponse.json(
        { error: 'That photo isn\'t on this kid (already deleted?).' },
        { status: 404 }
      );
    }

    // PATCH with the surviving subset. Airtable expects an array of
    // { id } objects for existing attachments to keep.
    const patchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}/${record.id}`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: atHeaders(),
      body: JSON.stringify({
        fields: {
          [F_PROFILE_PHOTO]: survivors.map(s => ({ id: s.id })),
        },
      }),
    });
    if (!patchRes.ok) {
      return NextResponse.json(
        { error: `Delete failed: ${patchRes.status} ${await patchRes.text()}` },
        { status: 502 }
      );
    }
    return NextResponse.json({
      ok: true,
      remaining: survivors.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
