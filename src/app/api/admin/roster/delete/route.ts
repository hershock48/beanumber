/**
 * POST /api/admin/roster/delete
 *   Body: { shirtNumber: number, action: 'request' | 'delete' | 'reject' }
 *
 * Two-step delete workflow:
 *   - action='request' (anyone): Marks DeletionRequestedAt = now on
 *     the kid's record. Kevin sees this as a red banner on the
 *     editor and a trash badge on the roster grid. Simon uses this
 *     when he wants to clean up a test entry.
 *   - action='delete' (admin only): Hard-deletes the Airtable
 *     record. Used when Kevin approves a Simon request, OR when
 *     Kevin removes a kid directly.
 *   - action='reject' (admin only): Clears DeletionRequestedAt
 *     without deleting — Kevin rejects Simon's request.
 *
 * Safety checks (fire on every 'delete' regardless of who requested):
 *   - Refuse if Airtable shows a shirt was already assigned/shipped.
 *   - Refuse if ShirtBuyerEmail is set.
 *   - Refuse if any non-trivial Sponsorship row links to this kid.
 *
 * Errors:
 *   401 unauthorized
 *   400 bad request
 *   403 Simon tried to delete or reject directly
 *   409 safety check blocked the delete
 *   404 kid not found
 *   502 Airtable failed
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const SPONSORSHIPS_TABLE =
  process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';

const F_DELETION_REQUESTED_AT = 'fldV97l354M63GCDN';

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

interface ChildFields {
  ShirtNumber?: number;
  DisplayName?: string;
  FirstName?: string;
  ShirtAssignedAt?: string;
  ShirtBuyerEmail?: string;
  DeletionRequestedAt?: string;
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

async function safetyCheck(recordId: string, displayName: string, fields: ChildFields):
  Promise<{ ok: true } | { ok: false; reason: string }>
{
  if (fields.ShirtAssignedAt) {
    return {
      ok: false,
      reason: `${displayName} has a shirt assigned already (someone bought their number). Clear ShirtAssignedAt in Airtable first if you really want to delete.`,
    };
  }
  if (fields.ShirtBuyerEmail) {
    return {
      ok: false,
      reason: `${displayName} has a shirt buyer email on file. Clear ShirtBuyerEmail in Airtable first if you really want to delete.`,
    };
  }
  // Linked sponsorships
  const formula = `FIND("${recordId}", ARRAYJOIN({Children}))>0`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    SPONSORSHIPS_TABLE
  )}?filterByFormula=${encodeURIComponent(formula)}&pageSize=10&fields%5B%5D=Status`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (res.ok) {
    const data = await res.json();
    const liveStatuses = ['Active', 'Awaiting Sponsor', 'Pending Review', 'Published'];
    const live = (data.records || []).filter((r: { fields?: { Status?: { name?: string } | string } }) => {
      const status =
        typeof r.fields?.Status === 'string' ? r.fields.Status : r.fields?.Status?.name;
      return status && liveStatuses.includes(status);
    });
    if (live.length > 0) {
      return {
        ok: false,
        reason: `${displayName} is linked to ${live.length} sponsorship${
          live.length === 1 ? '' : 's'
        }. Cancel ${live.length === 1 ? 'it' : 'them'} in Airtable before deleting.`,
      };
    }
  }
  return { ok: true };
}

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { shirtNumber?: number; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const shirtNumber = body.shirtNumber;
  const action = body.action;
  if (typeof shirtNumber !== 'number' || !Number.isInteger(shirtNumber) || shirtNumber < 1) {
    return NextResponse.json(
      { error: 'shirtNumber must be a positive integer' },
      { status: 400 }
    );
  }
  if (!action || !['request', 'delete', 'reject'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be request, delete, or reject' },
      { status: 400 }
    );
  }

  const role = (await getAdminRole()) || 'admin';
  if ((action === 'delete' || action === 'reject') && role !== 'admin') {
    return NextResponse.json(
      { error: 'Only Kevin can approve or reject a deletion' },
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

  // ─── REQUEST ────────────────────────────────────────────────────
  if (action === 'request') {
    if (fields.DeletionRequestedAt) {
      return NextResponse.json({ ok: true, alreadyRequested: true });
    }
    // Run the same safety checks before we even let the request
    // sit on Kevin's queue — no point queuing a deletion that can't
    // happen.
    const safe = await safetyCheck(kid.id, displayName, fields);
    if (!safe.ok) {
      return NextResponse.json({ error: safe.reason }, { status: 409 });
    }
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}/${kid.id}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: atHeaders(),
      body: JSON.stringify({
        fields: { [F_DELETION_REQUESTED_AT]: new Date().toISOString() },
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Request failed: ${res.status} ${await res.text()}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, action: 'request', name: displayName });
  }

  // ─── REJECT ─────────────────────────────────────────────────────
  if (action === 'reject') {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}/${kid.id}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: atHeaders(),
      body: JSON.stringify({ fields: { [F_DELETION_REQUESTED_AT]: null } }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Reject failed: ${res.status} ${await res.text()}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, action: 'reject', name: displayName });
  }

  // ─── DELETE (admin only — already guarded above) ────────────────
  const safe = await safetyCheck(kid.id, displayName, fields);
  if (!safe.ok) {
    return NextResponse.json({ error: safe.reason }, { status: 409 });
  }
  const deleteUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    CHILDREN_TABLE
  )}/${kid.id}`;
  const deleteRes = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: atHeaders(),
  });
  if (!deleteRes.ok) {
    return NextResponse.json(
      { error: `Delete failed: ${deleteRes.status} ${await deleteRes.text()}` },
      { status: 502 }
    );
  }
  return NextResponse.json({
    ok: true,
    action: 'delete',
    name: displayName,
    shirtNumber,
  });
}
