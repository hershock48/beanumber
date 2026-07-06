/**
 * Admin · Student of the Month — nominate / approve / clear.
 *
 * POST /api/admin/sotm
 *   Body: { action: 'nominate' | 'approve' | 'clear', shirtNumber?: number, reason?: string }
 *
 *   - nominate (Simon or Kevin):
 *       Sets the picked kid's pendingSOTMMonth to the current month
 *       label ("May 2026"). Clears any other same-grade kid's pending
 *       pick so only one nomination is live per grade. Doesn't touch
 *       the published studentOfMonthMonth field — Kevin still approves.
 *   - approve (Kevin only):
 *       Promotes the pending pick to studentOfMonthMonth, clearing
 *       same-grade other winners' published award.
 *   - clear (Kevin only):
 *       Clears both published and pending for all kids.
 *
 * Auth: cookie or X-Admin-Token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';
import { isGradeCode, type GradeCode } from '@/lib/grades';

/**
 * Canonical grade key for same-grade collision checks. Kids whose
 * grade_class isn't one of the seven canonical codes (null, or
 * legacy junk that didn't map cleanly) collide only with each
 * other under the 'unknown' bucket — safe default so a mis-tagged
 * kid never accidentally displaces the real SOTM in a real grade.
 */
function gradeBucket(raw: string | null | undefined): GradeCode | 'unknown' {
  return isGradeCode(raw) ? (raw as GradeCode) : 'unknown';
}
import { db } from '@/lib/db/client';
import { children } from '@/lib/db/schema';
import { eq, isNotNull } from 'drizzle-orm';

function currentMonthLabel(): string {
  const d = new Date();
  return `${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
}

async function findChildByShirtNumber(n: number) {
  const rows = await db
    .select()
    .from(children)
    .where(eq(children.shirtNumber, n))
    .limit(1);
  return rows[0] || null;
}

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { action?: string; shirtNumber?: number; reason?: string };
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

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  try {
    if (action === 'clear') {
      // Wipe all four fields on every row that has any of them set.
      // Single statement that nulls every kid is fine — these columns
      // default to null and the dataset is small.
      await db
        .update(children)
        .set({
          studentOfMonthMonth: null,
          studentOfMonthReason: null,
          pendingSOTMMonth: null,
          pendingSOTMReason: null,
          updatedAt: new Date(),
        })
        .where(
          isNotNull(children.studentOfMonthMonth) // any row with at least one set
        );
      // Also clear the pending fields for rows where only pending is set.
      await db
        .update(children)
        .set({
          pendingSOTMMonth: null,
          pendingSOTMReason: null,
          updatedAt: new Date(),
        })
        .where(isNotNull(children.pendingSOTMMonth));
      return NextResponse.json({ ok: true, cleared: true });
    }

    const target = await findChildByShirtNumber(shirtNumber as number);
    if (!target) {
      return NextResponse.json(
        { error: `No child found for shirt #${shirtNumber}` },
        { status: 404 }
      );
    }

    const targetGradeKey = gradeBucket(target.gradeClass);

    if (action === 'nominate') {
      // Clear other same-grade pending picks.
      const allPending = await db
        .select({ id: children.id, gradeClass: children.gradeClass })
        .from(children)
        .where(isNotNull(children.pendingSOTMMonth));
      const otherIds = allPending
        .filter(
          r =>
            r.id !== target.id && gradeBucket(r.gradeClass) === targetGradeKey
        )
        .map(r => r.id);
      for (const id of otherIds) {
        await db
          .update(children)
          .set({
            pendingSOTMMonth: null,
            pendingSOTMReason: null,
            updatedAt: new Date(),
          })
          .where(eq(children.id, id));
      }
      await db
        .update(children)
        .set({
          pendingSOTMMonth: month,
          pendingSOTMReason: reason || null,
          updatedAt: new Date(),
        })
        .where(eq(children.id, target.id));
      return NextResponse.json({ ok: true, action, shirtNumber, month, reason });
    }

    // approve — same-grade winner cleanup.
    const existingPendingReason = target.pendingSOTMReason || '';
    const reasonToPublish = reason || existingPendingReason;

    const allPublished = await db
      .select({ id: children.id, gradeClass: children.gradeClass })
      .from(children)
      .where(isNotNull(children.studentOfMonthMonth));
    const samePublishedOtherIds = allPublished
      .filter(
        r =>
          r.id !== target.id && gradeBucket(r.gradeClass) === targetGradeKey
      )
      .map(r => r.id);
    for (const id of samePublishedOtherIds) {
      await db
        .update(children)
        .set({
          studentOfMonthMonth: null,
          studentOfMonthReason: null,
          updatedAt: new Date(),
        })
        .where(eq(children.id, id));
    }
    // Clear same-grade pending nominations (slot is filled).
    const allPending = await db
      .select({ id: children.id, gradeClass: children.gradeClass })
      .from(children)
      .where(isNotNull(children.pendingSOTMMonth));
    const samePendingIds = allPending
      .filter(r => gradeBucket(r.gradeClass) === targetGradeKey)
      .map(r => r.id);
    for (const id of samePendingIds) {
      await db
        .update(children)
        .set({
          pendingSOTMMonth: null,
          pendingSOTMReason: null,
          updatedAt: new Date(),
        })
        .where(eq(children.id, id));
    }
    await db
      .update(children)
      .set({
        studentOfMonth: true,
        studentOfMonthMonth: month,
        studentOfMonthReason: reasonToPublish || null,
        pendingSOTMMonth: null,
        pendingSOTMReason: null,
        updatedAt: new Date(),
      })
      .where(eq(children.id, target.id));
    return NextResponse.json({ ok: true, action, shirtNumber, month });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
