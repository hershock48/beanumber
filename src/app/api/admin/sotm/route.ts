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
import { children, sotmHistory } from '@/lib/db/schema';
import { eq, isNotNull, sql as drizzleSql } from 'drizzle-orm';
import {
  sendPush,
  resolveKidRecipientMobileUserIds,
} from '@/lib/push/send';
import { gradeLabelForSponsor } from '@/lib/grades';

// Both the writer (this) and the /me milestone reader must anchor to
// the same calendar. The ceremony is a Uganda event — Africa/Kampala
// is the source of truth for "what month is Simon designating." UTC
// on Vercel would flip several hours before Kampala midnight and
// cause the writer and reader to disagree at month rollover.
function currentMonthLabel(): string {
  const d = new Date();
  const month = d.toLocaleString('en-US', {
    month: 'long',
    timeZone: 'Africa/Kampala',
  });
  const year = d.toLocaleString('en-US', {
    year: 'numeric',
    timeZone: 'Africa/Kampala',
  });
  return `${month} ${year}`;
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
      // Clear ALL three SOTM fields, not just the month + reason.
      // Leaving studentOfMonth = true here creates orphaned rows:
      // no month text but a lingering boolean, which then rendered
      // ghost SOTM badges on kid pages (compounded by the kid-page
      // mapping bug fixed at the same time as this).
      await db
        .update(children)
        .set({
          studentOfMonth: false,
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

    // Also record the award in the sotm_history archive. This is the
    // durable record — the children row only carries CURRENT SOTM
    // state, so once next month's winner is picked the previous
    // month's award vanishes from the kid row. History persists.
    //
    // Idempotent on (grade_code, month) via the unique index; if this
    // is a re-approval of the same grade+month (e.g., Kevin corrected
    // the reason), the new reason lands in the same slot rather than
    // creating a duplicate row.
    // Skip history write for 'unknown' grade — a kid without a
    // canonical grade code shouldn't pollute the archive with an
    // empty grade_code (which would collide with every other unknown-
    // grade winner in the same month via the unique index). The
    // children-row update still lands so the badge appears; the
    // archive row gets written on a later re-approval AFTER Simon
    // sets the kid's grade in the roster editor.
    if (reasonToPublish && targetGradeKey !== 'unknown') {
      try {
        await db
          .insert(sotmHistory)
          .values({
            childId: target.id,
            gradeCode: targetGradeKey,
            month,
            reason: reasonToPublish,
          })
          .onConflictDoUpdate({
            target: [sotmHistory.gradeCode, sotmHistory.month],
            set: {
              childId: target.id,
              reason: reasonToPublish,
              awardedAt: drizzleSql`now()`,
            },
          });
      } catch (histErr) {
        // History write is best-effort; the children row is the
        // primary. Log and continue — Kevin sees the approval land
        // even if the archive burped.
        console.warn(
          '[SOTM] history write failed (non-fatal):',
          histErr instanceof Error ? histErr.message : String(histErr)
        );
      }
    } else if (reasonToPublish && targetGradeKey === 'unknown') {
      console.warn(
        `[SOTM] approve without grade — history skipped for kid ${target.id} ("${target.firstName ?? ''}"). Set the kid's grade in the roster editor to enable archival.`
      );
    }

    // Push to every sponsor + holder of the kid. Best-effort — a push
    // failure must not block the approval response.
    try {
      const recipientUserIds = await resolveKidRecipientMobileUserIds(
        target.id,
        target.childId ?? null
      );
      if (recipientUserIds.length > 0) {
        const gradeLabel =
          targetGradeKey !== 'unknown'
            ? gradeLabelForSponsor(targetGradeKey as GradeCode)
            : 'Primary';
        await sendPush({
          kind: 'kidSotm',
          kidId: target.id,
          recipientUserIds,
          gradeLabel,
          monthLabel: month,
        });
      }
    } catch (err) {
      console.warn(
        '[SOTM] push send failed (non-fatal):',
        err instanceof Error ? err.message : String(err)
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
