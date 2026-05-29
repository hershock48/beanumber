/**
 * POST /api/admin/roster/depart
 *   Body: { shirtNumber: number, action: 'request' | 'approve' | 'reject' | 'restore', note?: string }
 *
 * Two-step departure workflow (same pattern as delete + SOTM):
 *
 *   - request (anyone, typically Simon): Stamps DepartureRequestedAt
 *     = now and saves Simon's note. Kevin sees a banner on the
 *     editor + small badge on the roster card.
 *   - approve (admin only): Promotes the request — DepartedAt = now,
 *     DepartureNote = supplied note (Kevin's polished version) or
 *     falls back to the requested note. Clears the request fields.
 *   - reject (admin only): Wipes DepartureRequestedAt + note. Kid
 *     stays active.
 *   - restore (admin only): Undoes a previously approved departure.
 *     Clears DepartedAt + DepartureNote. The kid is active again.
 *
 * Unlike delete, this never removes the Airtable row — it's
 * reversible. Sponsorships and shirt assignments stay linked; the
 * record stays queryable. The public profile reframes when
 * DepartedAt is set.
 *
 * Auth: cookie or X-Admin-Token. Role-aware via getAdminRole.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

const F = {
  departedAt: 'fldyPllTKOrSRFfvG',
  departureNote: 'flda1f6iP31kgsJAR',
  departureRequestedAt: 'fldjzepJdOAK3tw2f',
  departureRequestedNote: 'fldMVUY1dV7gh5wVy',
};

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

interface ChildFields {
  DisplayName?: string;
  FirstName?: string;
  DepartedAt?: string;
  DepartureNote?: string;
  DepartureRequestedAt?: string;
  DepartureRequestedNote?: string;
}

async function findKid(shirtNumber: number) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    CHILDREN_TABLE
  )}?filterByFormula=${encodeURIComponent(`{ShirtNumber}=${shirtNumber}`)}&maxRecords=1`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.records?.[0] as { id: string; fields: ChildFields }) || null;
}

async function patchKid(recordId: string, fields: Record<string, unknown>): Promise<Response> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    CHILDREN_TABLE
  )}/${recordId}`;
  return fetch(url, {
    method: 'PATCH',
    headers: atHeaders(),
    body: JSON.stringify({ fields }),
  });
}

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { shirtNumber?: number; action?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { shirtNumber, action } = body;
  const note = typeof body.note === 'string' ? body.note.trim() : '';

  if (typeof shirtNumber !== 'number' || !Number.isInteger(shirtNumber) || shirtNumber < 1) {
    return NextResponse.json(
      { error: 'shirtNumber must be a positive integer' },
      { status: 400 }
    );
  }
  if (!action || !['request', 'approve', 'reject', 'restore'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be request, approve, reject, or restore' },
      { status: 400 }
    );
  }

  const role = (await getAdminRole()) || 'admin';
  if (['approve', 'reject', 'restore'].includes(action) && role !== 'admin') {
    return NextResponse.json(
      { error: 'Only Kevin can approve, reject, or restore a departure' },
      { status: 403 }
    );
  }

  const kid = await findKid(shirtNumber);
  if (!kid) {
    return NextResponse.json(
      { error: `No kid found for shirt #${shirtNumber}` },
      { status: 404 }
    );
  }
  const fields = kid.fields;
  const displayName =
    fields.DisplayName || fields.FirstName || `Kid #${shirtNumber}`;

  try {
    if (action === 'request') {
      if (fields.DepartedAt) {
        return NextResponse.json(
          { error: `${displayName} is already marked departed.` },
          { status: 409 }
        );
      }
      const res = await patchKid(kid.id, {
        [F.departureRequestedAt]: new Date().toISOString(),
        [F.departureRequestedNote]: note || null,
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Request failed: ${res.status} ${await res.text()}` },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, action, name: displayName });
    }

    if (action === 'reject') {
      const res = await patchKid(kid.id, {
        [F.departureRequestedAt]: null,
        [F.departureRequestedNote]: null,
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Reject failed: ${res.status} ${await res.text()}` },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, action, name: displayName });
    }

    if (action === 'restore') {
      const res = await patchKid(kid.id, {
        [F.departedAt]: null,
        [F.departureNote]: null,
        [F.departureRequestedAt]: null,
        [F.departureRequestedNote]: null,
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Restore failed: ${res.status} ${await res.text()}` },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, action, name: displayName });
    }

    // approve — promote the request into the official fields.
    const noteToPublish =
      note || fields.DepartureRequestedNote || '';
    const res = await patchKid(kid.id, {
      [F.departedAt]: new Date().toISOString(),
      [F.departureNote]: noteToPublish || null,
      [F.departureRequestedAt]: null,
      [F.departureRequestedNote]: null,
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Approve failed: ${res.status} ${await res.text()}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, action, name: displayName });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
