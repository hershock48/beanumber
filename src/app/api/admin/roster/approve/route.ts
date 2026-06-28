/**
 * Admin · Approve pending edits — promote Simon's pendingDraft text
 * fields to the live public columns, OR dismiss them.
 *
 * POST /api/admin/roster/approve
 * Body: {
 *   shirtNumber: number,
 *   action: 'approveAll' | { field: string, decision: 'accept' | 'dismiss' }
 * }
 *
 * approveAll — copies every pending field to its public column, then
 *              clears pendingDraft, pendingFields, lastEditedBySimon.
 * accept     — copies just that field to public, removes its key
 *              from pendingDraft + pendingFields. If pendingFields
 *              empties, clears lastEditedBySimon too.
 * dismiss    — removes the named field from pendingDraft + pendingFields
 *              without touching public.
 *
 * Admin only. Simon hitting this should bounce — only Kevin
 * approves his own pending writes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';
import { parsePendingDraft, type PendingDraft } from '@/lib/admin/pending-draft';
import { db } from '@/lib/db/client';
import { children } from '@/lib/db/schema';
import { audit } from '@/lib/db/mutations';
import { eq } from 'drizzle-orm';

const GATED_KEY_TO_COLUMN: Record<keyof PendingDraft, string> = {
  nameMeaning: 'nameMeaning',
  familyContext: 'familyContext',
  loves: 'loves',
  childQuote: 'childQuote',
  notes: 'notes',
  homeVillage: 'homeVillage',
  teacherName: 'teacherName',
  teacherQuote: 'teacherQuote',
  profilePhotoUrl: 'profilePhotoUrl',
};
const KEY_TO_PENDING_OPTION: Record<keyof PendingDraft, string> = {
  nameMeaning: 'NameMeaning',
  familyContext: 'FamilyContext',
  loves: 'Loves',
  childQuote: 'ChildQuote',
  notes: 'Notes',
  homeVillage: 'HomeVillage',
  teacherName: 'TeacherName',
  teacherQuote: 'TeacherQuote',
  profilePhotoUrl: 'ProfilePhoto',
};

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = await getAdminRole();
  if (role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden: only admin can approve pending edits' },
      { status: 403 }
    );
  }

  let body: {
    shirtNumber?: number;
    action?:
      | 'approveAll'
      | { field?: string; decision?: 'accept' | 'dismiss' };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const shirtNumber = body.shirtNumber;
  if (typeof shirtNumber !== 'number' || !Number.isInteger(shirtNumber)) {
    return NextResponse.json(
      { error: 'shirtNumber must be an integer' },
      { status: 400 }
    );
  }

  try {
    const kid = (
      await db
        .select()
        .from(children)
        .where(eq(children.shirtNumber, shirtNumber))
        .limit(1)
    )[0];
    if (!kid) {
      return NextResponse.json(
        { error: `No child for shirt #${shirtNumber}` },
        { status: 404 }
      );
    }

    const draft: PendingDraft = parsePendingDraft(
      typeof kid.pendingDraft === 'string'
        ? kid.pendingDraft
        : kid.pendingDraft
          ? JSON.stringify(kid.pendingDraft)
          : ''
    );
    const currentPending = ((kid.pendingFields as string[] | null) || []).filter(
      Boolean
    );
    const nextPending = new Set(currentPending);
    const patch: Record<string, unknown> = {};

    if (body.action === 'approveAll') {
      let promoted = 0;
      for (const key of Object.keys(GATED_KEY_TO_COLUMN) as Array<keyof PendingDraft>) {
        const value = (draft as Record<string, string>)[key];
        if (typeof value === 'string') {
          patch[GATED_KEY_TO_COLUMN[key]] = value;
          promoted++;
        }
        nextPending.delete(KEY_TO_PENDING_OPTION[key]);
      }
      patch.pendingDraft = null;
      patch.pendingFields = [];
      patch.lastEditedBySimon = null;
      if (promoted === 0 && currentPending.length === 0) {
        return NextResponse.json({ ok: true, note: 'Nothing pending' });
      }
    } else if (
      typeof body.action === 'object' &&
      body.action &&
      typeof body.action.field === 'string'
    ) {
      const { field, decision } = body.action;
      const fieldKey = field as keyof PendingDraft;
      if (!GATED_KEY_TO_COLUMN[fieldKey]) {
        return NextResponse.json(
          { error: `Unknown field: ${field}` },
          { status: 400 }
        );
      }
      if (decision !== 'accept' && decision !== 'dismiss') {
        return NextResponse.json(
          { error: `decision must be 'accept' or 'dismiss'` },
          { status: 400 }
        );
      }
      const draftValue = (draft as Record<string, string>)[fieldKey];
      if (decision === 'accept' && typeof draftValue === 'string') {
        patch[GATED_KEY_TO_COLUMN[fieldKey]] = draftValue;
      }
      delete (draft as Record<string, unknown>)[fieldKey];
      nextPending.delete(KEY_TO_PENDING_OPTION[fieldKey]);

      patch.pendingDraft = Object.keys(draft).length > 0 ? draft : null;
      patch.pendingFields = Array.from(nextPending);
      if (nextPending.size === 0) {
        patch.lastEditedBySimon = null;
      }
    } else {
      return NextResponse.json(
        { error: 'action must be "approveAll" or { field, decision }' },
        { status: 400 }
      );
    }

    patch.updatedAt = new Date();
    await db.update(children).set(patch).where(eq(children.id, kid.id));

    await audit({
      table: 'children',
      recordId: kid.id,
      action: 'UPDATE',
      actorType: 'admin',
      actorId: role || 'admin',
      before: kid as unknown as Record<string, unknown>,
      after: { ...(kid as unknown as Record<string, unknown>), ...patch },
    });

    return NextResponse.json({ ok: true, recordId: kid.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
