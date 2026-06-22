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
 * Creates a new Children record. Shirt number is auto-assigned: max
 * existing + 1. Status defaults to "Active". ChildID is "HSP/BAN-NNN"
 * matching the assigned shirt number.
 *
 * Returns shirtNumber so the caller can redirect to the editor.
 *
 * Auth: cookie or X-Admin-Token. Both Kevin and Simon can use this.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { children } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

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
    // Single-query max(shirt_number) — cheap on Postgres with the
    // children_shirt_number_idx index.
    const maxRow = await db
      .select({ max: sql<number | null>`max(${children.shirtNumber})` })
      .from(children);
    const shirtNumber = Number(maxRow[0]?.max ?? 0) + 1;
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
