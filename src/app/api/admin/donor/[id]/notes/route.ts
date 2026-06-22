/**
 * Admin · Donor — save notes.
 *
 * POST /api/admin/donor/<id>/notes
 *   Body: { notes: string }
 *
 * Overwrites the donors.notes column. Used by the notes textarea on
 * the donor profile page.
 *
 * Auth: cookie or X-Admin-Token (admin role only — Simon doesn't see
 * donor profiles).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { donors } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Invalid donor id' }, { status: 400 });
  }

  let body: { notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const notes = typeof body.notes === 'string' ? body.notes : '';

  try {
    const updated = await db
      .update(donors)
      .set({ notes, updatedAt: new Date() })
      .where(eq(donors.id, id))
      .returning({ id: donors.id });
    if (updated.length === 0) {
      return NextResponse.json({ error: 'Donor not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
