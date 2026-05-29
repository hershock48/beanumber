/**
 * Admin · Donor — save notes.
 *
 * POST /api/admin/donor/<id>/notes
 *   Body: { notes: string }
 *
 * Overwrites the Notes field on the Donors record. Used by the
 * notes textarea on the donor profile page.
 *
 * Auth: cookie or X-Admin-Token (admin role only — Simon doesn't see
 * donor profiles).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';

const F_NOTES = 'fld4PKLgX3El7h6rv';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id || !id.startsWith('rec')) {
    return NextResponse.json({ error: 'Invalid donor id' }, { status: 400 });
  }

  let body: { notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const notes = typeof body.notes === 'string' ? body.notes : '';

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    DONORS_TABLE
  )}/${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: { [F_NOTES]: notes } }),
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Airtable patch failed: ${res.status} ${await res.text()}` },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
