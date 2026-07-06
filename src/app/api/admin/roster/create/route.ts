/**
 * Admin · Roster — add a new kid record.
 *
 * POST /api/admin/roster/create
 * Body: {
 *   firstName: string,
 *   displayName?: string,       // defaults to firstName
 *   intakeFromCampus?: string,  // optional raw notes from Simon —
 *                               // stored in children.notes since
 *                               // there's no dedicated intake column
 *                               // in the Postgres schema.
 * }
 *
 * Creates a new Children record. Shirt number is auto-assigned: the
 * lowest empty slot in the canonical roster range (fills gaps first —
 * currently #31, then #47, #52 — then extends upward). Errors with
 * 409 if the range is full. Status defaults to "Active". ChildID is
 * "HSP/BAN-NNN" matching the assigned shirt number.
 *
 * Returns shirtNumber so the caller can redirect to the editor.
 *
 * Auth: cookie or X-Admin-Token. Both Kevin and Simon can use this.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';
import { db } from '@/lib/db/client';
import { children } from '@/lib/db/schema';
import { audit } from '@/lib/db/mutations';
import { CANONICAL_ROSTER_MIN, CANONICAL_ROSTER_MAX } from '@/lib/roster-config';
import { and, gte, lte } from 'drizzle-orm';

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
    // Find the lowest empty shirt number in the canonical roster range.
    // Historically this endpoint used MAX(shirt_number)+1, but the DB
    // has test rows at shirt_number 815-819 which pushed MAX+1 outside
    // the canonical range. That meant new kids created via +Add landed
    // at #820 and were invisible on /admin/roster. Now we always fill
    // the lowest gap first (#31, then #47, then #52 as of July 2026),
    // then extend upward, and error cleanly if the range is full.
    const filledRows = await db
      .select({ n: children.shirtNumber })
      .from(children)
      .where(
        and(
          gte(children.shirtNumber, CANONICAL_ROSTER_MIN),
          lte(children.shirtNumber, CANONICAL_ROSTER_MAX)
        )
      );
    const filled = new Set(filledRows.map(r => r.n));
    let shirtNumber = 0;
    for (let i = CANONICAL_ROSTER_MIN; i <= CANONICAL_ROSTER_MAX; i++) {
      if (!filled.has(i)) {
        shirtNumber = i;
        break;
      }
    }
    if (!shirtNumber) {
      return NextResponse.json(
        {
          error:
            `Roster is full (${CANONICAL_ROSTER_MAX} kids). To add more kids, ` +
            `Kevin needs to widen the canonical roster range in lib/roster-config.ts.`,
        },
        { status: 409 }
      );
    }
    const childId = `HSP/BAN-${String(shirtNumber).padStart(3, '0')}`;

    // intakeFromCampus has no first-class column in the Postgres schema
    // — fold it into `notes` so Simon's words aren't dropped on the
    // floor. Kevin's editor renders notes anyway.
    const inserted = await db
      .insert(children)
      .values({
        childId,
        shirtNumber,
        firstName,
        displayName: displayName || firstName,
        status: 'Active',
        notes: intakeFromCampus || null,
      })
      .returning({ id: children.id });
    const recordId = inserted[0].id;

    const role = await getAdminRole();
    await audit({
      table: 'children',
      recordId,
      action: 'INSERT',
      actorType: 'admin',
      actorId: role || 'admin',
      after: { childId, shirtNumber, firstName, displayName: displayName || firstName, status: 'Active', notes: intakeFromCampus || null },
    });

    return NextResponse.json({
      ok: true,
      recordId,
      shirtNumber,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
