/**
 * POST /api/admin/roster/depart
 *   Body: { shirtNumber: number, action: 'request' | 'approve' | 'reject' | 'restore', note?: string }
 *
 * Two-step departure workflow:
 *   - request (anyone): stamps departureRequestedAt = now, saves note.
 *   - approve (admin): promotes the request → departedAt = now,
 *     departureNote = note (or fallback to requested note). Calls
 *     markChildDeparted from mutations.ts so the shirt number is
 *     archived and the audit log gets a row.
 *   - reject (admin): wipes departureRequestedAt + note.
 *   - restore (admin): undoes an approved departure (departedAt = null,
 *     status flips back to Active).
 *
 * Auth: cookie or X-Admin-Token. Role-aware.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';
import { db } from '@/lib/db/client';
import { children } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { markChildDeparted } from '@/lib/db/mutations';

async function findKid(shirtNumber: number) {
  const rows = await db
    .select()
    .from(children)
    .where(eq(children.shirtNumber, shirtNumber))
    .limit(1);
  return rows[0] || null;
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
  const displayName = kid.displayName || kid.firstName || `Kid #${shirtNumber}`;

  try {
    if (action === 'request') {
      if (kid.departedAt) {
        return NextResponse.json(
          { error: `${displayName} is already marked departed.` },
          { status: 409 }
        );
      }
      await db
        .update(children)
        .set({
          departureRequestedAt: new Date(),
          departureRequestedNote: note || null,
          updatedAt: new Date(),
        })
        .where(eq(children.id, kid.id));
      return NextResponse.json({ ok: true, action, name: displayName });
    }

    if (action === 'reject') {
      await db
        .update(children)
        .set({
          departureRequestedAt: null,
          departureRequestedNote: null,
          updatedAt: new Date(),
        })
        .where(eq(children.id, kid.id));
      return NextResponse.json({ ok: true, action, name: displayName });
    }

    if (action === 'restore') {
      // Bring back the kid: clear departure fields, restore shirt
      // number from archive if available, flip status back to Active.
      await db
        .update(children)
        .set({
          departedAt: null,
          departureNote: null,
          departureRequestedAt: null,
          departureRequestedNote: null,
          status: 'Active',
          shirtNumber: kid.shirtNumber ?? kid.archivedShirtNumber,
          archivedShirtNumber: kid.shirtNumber ? kid.archivedShirtNumber : null,
          updatedAt: new Date(),
        })
        .where(eq(children.id, kid.id));
      return NextResponse.json({ ok: true, action, name: displayName });
    }

    // approve — promote request to official departure via mutations.markChildDeparted.
    // mutations.markChildDeparted archives shirt_number, sets status='Departed',
    // departedAt = now, and writes an audit log row.
    const noteToPublish = note || kid.departureRequestedNote || undefined;
    const updated = await markChildDeparted(kid.id, { note: noteToPublish });
    // Clear the request fields after promotion.
    await db
      .update(children)
      .set({
        departureRequestedAt: null,
        departureRequestedNote: null,
        updatedAt: new Date(),
      })
      .where(eq(children.id, kid.id));
    if (!updated) {
      return NextResponse.json(
        { error: 'Failed to mark kid departed' },
        { status: 500 }
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
