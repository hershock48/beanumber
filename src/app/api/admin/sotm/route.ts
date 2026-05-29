/**
 * Admin · Student of the Month — nominate / approve / clear.
 *
 * POST /api/admin/sotm
 *   Body: { action: 'nominate' | 'approve' | 'clear', shirtNumber?: number }
 *
 *   - nominate (Simon or Kevin):
 *       Sets the picked kid's PendingSOTMMonth to the current month
 *       label ("May 2026"). Clears any other kid's pending pick so
 *       only one nomination is live at a time. Doesn't touch the
 *       published StudentOfMonth field — Kevin still needs to
 *       approve.
 *
 *   - approve (Kevin only):
 *       Promotes the picked kid's pending pick to the published
 *       StudentOfMonth field, clearing pending. Also clears any
 *       other kid's StudentOfMonth so there's a single published
 *       winner per month. Simon's clients can call this if they want
 *       to override their own pick (treated same as nominate).
 *
 *   - clear (Kevin only):
 *       Clears both the published award and the pending pick for
 *       the specified kid. Used by the "remove award" link.
 *
 * Auth: cookie or X-Admin-Token; getAdminRole determines what
 * actions are allowed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

const F = {
  shirtNumber: 'fldFLnW4dMCjyKFkO',
  studentOfMonth: 'fldQrcXzw32aOZWZ3',
  pendingSOTMMonth: 'fld1RuoP2O5xD1vkl',
};

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

function currentMonthLabel(): string {
  const d = new Date();
  return `${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
}

/** Find one Child record by shirt number. */
async function findChildByShirtNumber(n: number): Promise<{ id: string } | null> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    CHILDREN_TABLE
  )}?filterByFormula=${encodeURIComponent(`{ShirtNumber}=${n}`)}&maxRecords=1`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.[0] ? { id: data.records[0].id } : null;
}

/** Find every Child record where the given fieldName is non-empty. */
async function findKidsWithField(fieldName: string): Promise<Array<{ id: string }>> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    CHILDREN_TABLE
  )}?filterByFormula=${encodeURIComponent(`{${fieldName}} != ""`)}&pageSize=100`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records || []).map((r: { id: string }) => ({ id: r.id }));
}

/** Batch-patch a set of records to clear a specific field. Airtable
 *  accepts up to 10 records per PATCH so we chunk if needed. */
async function clearFieldOnRecords(records: Array<{ id: string }>, fieldId: string): Promise<void> {
  if (records.length === 0) return;
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CHILDREN_TABLE)}`;
    await fetch(url, {
      method: 'PATCH',
      headers: atHeaders(),
      body: JSON.stringify({
        records: batch.map(r => ({
          id: r.id,
          fields: { [fieldId]: null },
        })),
      }),
    });
  }
}

/** Patch a single record with a set of field updates. */
async function patchOne(recordId: string, fields: Record<string, unknown>): Promise<Response> {
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

  let body: { action?: string; shirtNumber?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action;
  const shirtNumber = body.shirtNumber;
  const role = (await getAdminRole()) || 'admin';
  const month = currentMonthLabel();

  if (!action || !['nominate', 'approve', 'clear'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be nominate, approve, or clear' },
      { status: 400 }
    );
  }
  if (action !== 'clear' && (typeof shirtNumber !== 'number' || shirtNumber < 1)) {
    return NextResponse.json(
      { error: 'shirtNumber is required for nominate and approve' },
      { status: 400 }
    );
  }
  if ((action === 'approve' || action === 'clear') && role !== 'admin') {
    return NextResponse.json(
      { error: 'Only Kevin can approve or clear an award' },
      { status: 403 }
    );
  }

  try {
    if (action === 'clear') {
      // Clear both fields on every record that has either set.
      const withPublished = await findKidsWithField('StudentOfMonth');
      const withPending = await findKidsWithField('PendingSOTMMonth');
      await clearFieldOnRecords(withPublished, F.studentOfMonth);
      await clearFieldOnRecords(withPending, F.pendingSOTMMonth);
      return NextResponse.json({ ok: true, cleared: true });
    }

    const target = await findChildByShirtNumber(shirtNumber as number);
    if (!target) {
      return NextResponse.json(
        { error: `No child found for shirt #${shirtNumber}` },
        { status: 404 }
      );
    }

    if (action === 'nominate') {
      // Clear everyone else's pending pick so only one is live.
      const allPending = await findKidsWithField('PendingSOTMMonth');
      const others = allPending.filter(r => r.id !== target.id);
      await clearFieldOnRecords(others, F.pendingSOTMMonth);
      // Stamp the target.
      const res = await patchOne(target.id, { [F.pendingSOTMMonth]: month });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Nominate failed: ${res.status} ${await res.text()}` },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, action, shirtNumber, month });
    }

    // approve — published award goes to the target, pending clears
    // across the board, and any other kid's published award (likely
    // last month's winner) also clears so there's only one current
    // SOTM live.
    const allPublished = await findKidsWithField('StudentOfMonth');
    const otherPublished = allPublished.filter(r => r.id !== target.id);
    await clearFieldOnRecords(otherPublished, F.studentOfMonth);
    const allPending = await findKidsWithField('PendingSOTMMonth');
    await clearFieldOnRecords(allPending, F.pendingSOTMMonth);
    const res = await patchOne(target.id, {
      [F.studentOfMonth]: month,
      [F.pendingSOTMMonth]: null,
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Approve failed: ${res.status} ${await res.text()}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, action, shirtNumber, month });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
