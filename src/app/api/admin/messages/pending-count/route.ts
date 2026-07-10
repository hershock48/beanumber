/**
 * GET /api/admin/messages/pending-count
 *
 * Lightweight count endpoint used by AdminShell's client-side
 * pending-notes indicator (red dot on the "Sponsor notes" nav tab).
 * Called on mount + on window focus, so it needs to be cheap.
 *
 * Returns the total across pending + translated statuses for the
 * outbound direction only — the two admin-actionable states. Kid
 * replies are always 'delivered' at write time and don't count as
 * "waiting on admin action."
 *
 * Auth: admin cookie required. Anyone else gets 401 (not 200 with
 * zero) so we never surface counts to an unauthenticated caller.
 *
 * Response
 *   200 { count: number }
 *   401 { error: 'Unauthorized' }
 */

import { NextResponse } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { kidMessages } from '@/lib/db/schema';
import { getAdminRole } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const role = await getAdminRole();
  if (!role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(kidMessages)
      .where(
        and(
          eq(kidMessages.direction, 'sponsor_to_kid'),
          // awaiting_kevin (2026-07-10 approval layer) needs to
          // light the nav red dot too — the whole point of the
          // approval step is that Kevin looks at it. Without this,
          // Kevin has no cue that a note is waiting for him.
          inArray(kidMessages.status, [
            'awaiting_kevin',
            'pending',
            'translated',
          ])
        )
      );
    return NextResponse.json({ count: rows[0]?.n ?? 0 });
  } catch (err) {
    // Fail closed with count=0 rather than 500 — the nav indicator is
    // a decoration, not a critical surface. A DB blip shouldn't make
    // the whole admin shell error.
    console.warn(
      '[messages/pending-count] query failed:',
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json({ count: 0 });
  }
}
