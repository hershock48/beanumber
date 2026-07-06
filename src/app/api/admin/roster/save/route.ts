/**
 * Admin · Roster save — write structured kid fields.
 *
 * POST /api/admin/roster/save
 * Body: {
 *   shirtNumber: number,
 *   fields: {
 *     nameMeaning?, familyContext?, loves?, childQuote?, notes?,
 *     intakeFromCampus?, studentOfMonth?  // studentOfMonth is a
 *                                          // month-label string here,
 *                                          // stored in studentOfMonthMonth.
 *   },
 *   clearSimonFlag?: boolean  // Kevin's "Mark all reviewed".
 * }
 *
 * Behavior:
 *  - simon edits to the gated fields go into pendingDraft (jsonb),
 *    not the public field. lastEditedBySimon = now, pendingFields
 *    array updated.
 *  - admin edits write straight to the public field AND remove that
 *    key from pendingDraft + pendingFields. clearSimonFlag wipes
 *    pending state entirely.
 *
 * Auth: cookie or X-Admin-Token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';
import {
  parsePendingDraft,
  GATED_FIELDS,
  FIELD_TO_PENDING_OPTION,
  type PendingDraft,
} from '@/lib/admin/pending-draft';
import { db } from '@/lib/db/client';
import { children } from '@/lib/db/schema';
import { audit } from '@/lib/db/mutations';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    shirtNumber?: number;
    fields?: {
      nameMeaning?: string;
      familyContext?: string;
      loves?: string;
      childQuote?: string;
      notes?: string;
      intakeFromCampus?: string;
      studentOfMonth?: string;
      // Canonical grade code (LK, UK, P1–P5) — factual roster data,
      // not subjective. Simon can update directly without pending-
      // review gating.
      gradeClass?: string | null;
    };
    clearSimonFlag?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const shirtNumber = body.shirtNumber;
  const fields = body.fields || {};
  if (typeof shirtNumber !== 'number' || !Number.isInteger(shirtNumber)) {
    return NextResponse.json({ error: 'shirtNumber must be a positive integer' }, { status: 400 });
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
        { error: `No child record found for shirt #${shirtNumber}` },
        { status: 404 }
      );
    }

    // Compute the diff against current values so per-field bookkeeping
    // only fires on actual changes.
    type Key =
      | 'nameMeaning'
      | 'familyContext'
      | 'loves'
      | 'childQuote'
      | 'notes'
      | 'intakeFromCampus'
      | 'studentOfMonth'
      | 'gradeClass';
    const current: Record<Key, string> = {
      nameMeaning: kid.nameMeaning || '',
      familyContext: kid.familyContext || '',
      loves: kid.loves || '',
      childQuote: kid.childQuote || '',
      notes: kid.notes || '',
      intakeFromCampus: kid.intakeFromCampus || '',
      // studentOfMonth comes in as a month-label string and is stored
      // in studentOfMonthMonth in Postgres.
      studentOfMonth: kid.studentOfMonthMonth || '',
      // Grade lives on the public gradeClass column; Simon can update
      // directly, no pending-review gating.
      gradeClass: kid.gradeClass || '',
    };
    const changedKeys: Key[] = [];
    const incoming: Partial<Record<Key, string>> = {};
    for (const k of Object.keys(current) as Key[]) {
      const v = (fields as Record<string, unknown>)[k];
      if (typeof v !== 'string') continue;
      if (v === current[k]) continue;
      incoming[k] = v;
      changedKeys.push(k);
    }

    // Build the patch.
    const patch: Record<string, unknown> = {};
    const role = await getAdminRole();
    let nextPending = new Set<string>((kid.pendingFields as string[] | null) || []);
    let nextDraft: PendingDraft = parsePendingDraft(
      typeof kid.pendingDraft === 'string'
        ? kid.pendingDraft
        : kid.pendingDraft
          ? JSON.stringify(kid.pendingDraft)
          : ''
    );

    if (role === 'simon') {
      // Simon's structured-field edits go into pendingDraft, NOT the
      // public field. intakeFromCampus + studentOfMonth (month label)
      // write directly — the first is already non-public, the second
      // has its own pending pattern via pendingSOTMMonth.
      for (const key of changedKeys) {
        if (GATED_FIELDS.has(key as keyof PendingDraft)) {
          (nextDraft as Record<string, string>)[key] = incoming[key] || '';
          const option = FIELD_TO_PENDING_OPTION[key as keyof PendingDraft];
          if (option) nextPending.add(option);
        } else if (key === 'intakeFromCampus') {
          patch.intakeFromCampus = incoming[key];
        } else if (key === 'studentOfMonth') {
          patch.studentOfMonthMonth = incoming[key] || null;
        } else if (key === 'gradeClass') {
          // Factual roster field; Simon writes directly. Null out
          // when the incoming value is an empty string so the
          // database stores null rather than "".
          patch.gradeClass = incoming[key] || null;
        }
      }
      if (changedKeys.length > 0) {
        patch.lastEditedBySimon = new Date();
      }
      patch.pendingDraft = Object.keys(nextDraft).length > 0 ? nextDraft : null;
    } else if (role === 'admin') {
      if (body.clearSimonFlag) {
        // Kevin hit "Mark all reviewed" — wipe pending state. Public
        // fields are NOT touched.
        nextPending = new Set();
        nextDraft = {};
        patch.pendingDraft = null;
        patch.lastEditedBySimon = null;
      } else {
        for (const key of changedKeys) {
          // Kevin's edits go straight to the public column.
          if (key === 'studentOfMonth') {
            patch.studentOfMonthMonth = incoming[key] || null;
          } else if (key === 'gradeClass') {
            patch.gradeClass = incoming[key] || null;
          } else {
            (patch as Record<string, unknown>)[key] = incoming[key];
          }
          // Clear this key from pending if present.
          const option = FIELD_TO_PENDING_OPTION[key as keyof PendingDraft];
          if (option) nextPending.delete(option);
          if ((nextDraft as Record<string, unknown>)[key] !== undefined) {
            delete (nextDraft as Record<string, unknown>)[key];
          }
        }
        patch.pendingDraft = Object.keys(nextDraft).length > 0 ? nextDraft : null;
        if (nextPending.size === 0) {
          patch.lastEditedBySimon = null;
        }
      }
    }

    // Sync pendingFields if it changed.
    const currentArr = (kid.pendingFields as string[] | null) || [];
    const nextArr = Array.from(nextPending);
    const pendingChanged =
      nextArr.length !== currentArr.length ||
      nextArr.some(v => !currentArr.includes(v));
    if (pendingChanged) {
      patch.pendingFields = nextArr;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true, updated: 0, note: 'No fields to update' });
    }
    patch.updatedAt = new Date();

    await db.update(children).set(patch).where(eq(children.id, kid.id));

    // Audit row so Kevin can spot-check Simon's work. Snapshot diff lets
    // him see exact before→after for every changed field. actorId='simon'
    // | 'admin' distinguishes who did what.
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
