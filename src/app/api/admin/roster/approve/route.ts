/**
 * Admin · Approve pending edits — promote Simon&rsquo;s PendingDraft text
 * fields to the live public fields, OR dismiss them without writing.
 *
 * POST /api/admin/roster/approve
 * Body: {
 *   shirtNumber: number,
 *   action: 'approveAll' | { field: string, decision: 'accept' | 'dismiss' }
 * }
 *
 * approveAll  — copies every pending field from PendingDraft to its
 *               public field, then clears PendingDraft, PendingFields,
 *               and LastEditedBySimon.
 * accept      — copies just the named field to public, removes that
 *               key from PendingDraft + PendingFields. If PendingFields
 *               empties, clears LastEditedBySimon too.
 * dismiss     — removes the named field from PendingDraft +
 *               PendingFields without touching public. Same
 *               LastEditedBySimon cleanup if pending empties.
 *
 * Admin role required. Simon hitting this should bounce — only Kevin
 * approves his own pending writes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

const F = {
  nameMeaning: 'flddhwxv3FT9DJqaF',
  familyContext: 'fldmN80uNieMZx64U',
  loves: 'fldwBn2AyXKt4vgi5',
  childQuote: 'flds9uA6MCoEbc2dJ',
  notes: 'fldbQuWFgNXnlZIVX',
  lastEditedBySimon: 'fldHeGgc5op4WpqAq',
  pendingFields: 'fldHnJHD0jv2lPgyU',
};

const PENDING_DRAFT_FIELD = 'PendingDraft';

const KEY_TO_FIELD_ID: Record<string, string> = {
  nameMeaning: F.nameMeaning,
  familyContext: F.familyContext,
  loves: F.loves,
  childQuote: F.childQuote,
  notes: F.notes,
};

const KEY_TO_PENDING_OPTION: Record<string, string> = {
  nameMeaning: 'NameMeaning',
  familyContext: 'FamilyContext',
  loves: 'Loves',
  childQuote: 'ChildQuote',
  notes: 'Notes',
};

interface PendingDraft {
  nameMeaning?: string;
  familyContext?: string;
  loves?: string;
  childQuote?: string;
  notes?: string;
}

function parsePendingDraft(raw: unknown): PendingDraft {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as PendingDraft;
  } catch {}
  return {};
}

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Approval is admin-only. Simon shouldn't be able to self-approve
  // his own drafts.
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
    const lookupUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}?filterByFormula=${encodeURIComponent(`{ShirtNumber}=${shirtNumber}`)}&maxRecords=1`;
    const lookupRes = await fetch(lookupUrl, {
      headers: atHeaders(),
      cache: 'no-store',
    });
    if (!lookupRes.ok) {
      return NextResponse.json(
        { error: `Airtable lookup failed: ${lookupRes.status}` },
        { status: 502 }
      );
    }
    const lookupData = await lookupRes.json();
    const record = lookupData.records?.[0];
    if (!record) {
      return NextResponse.json(
        { error: `No child for shirt #${shirtNumber}` },
        { status: 404 }
      );
    }

    const existingFields = (record.fields || {}) as Record<string, unknown>;
    const draft = parsePendingDraft(existingFields[PENDING_DRAFT_FIELD]);
    const currentPending = Array.isArray(existingFields.PendingFields)
      ? (existingFields.PendingFields as Array<string | { name?: string }>)
          .map(v => (typeof v === 'string' ? v : v?.name || ''))
          .filter(Boolean)
      : [];
    const nextPending = new Set(currentPending);

    const patchFields: Record<string, unknown> = {};

    if (body.action === 'approveAll') {
      // Promote every draft entry to its public field.
      let promoted = 0;
      for (const [key, fieldId] of Object.entries(KEY_TO_FIELD_ID)) {
        const draftValue = (draft as Record<string, string>)[key];
        if (typeof draftValue === 'string') {
          patchFields[fieldId] = draftValue;
          promoted++;
        }
        const option = KEY_TO_PENDING_OPTION[key];
        if (option) nextPending.delete(option);
      }
      patchFields[PENDING_DRAFT_FIELD] = null;
      patchFields[F.pendingFields] = [];
      patchFields[F.lastEditedBySimon] = null;
      if (promoted === 0 && currentPending.length === 0) {
        return NextResponse.json({ ok: true, note: 'Nothing pending' });
      }
    } else if (
      typeof body.action === 'object' &&
      body.action &&
      typeof body.action.field === 'string'
    ) {
      const { field, decision } = body.action;
      if (!KEY_TO_FIELD_ID[field]) {
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
      const draftValue = (draft as Record<string, string>)[field];
      if (decision === 'accept' && typeof draftValue === 'string') {
        patchFields[KEY_TO_FIELD_ID[field]] = draftValue;
      }
      // Strip this field from the draft + pending tracking either way.
      delete (draft as Record<string, unknown>)[field];
      const option = KEY_TO_PENDING_OPTION[field];
      if (option) nextPending.delete(option);

      const hasAnyDraft = Object.keys(draft).length > 0;
      patchFields[PENDING_DRAFT_FIELD] = hasAnyDraft
        ? JSON.stringify(draft)
        : null;
      patchFields[F.pendingFields] = Array.from(nextPending);
      if (nextPending.size === 0) {
        patchFields[F.lastEditedBySimon] = null;
      }
    } else {
      return NextResponse.json(
        { error: 'action must be "approveAll" or { field, decision }' },
        { status: 400 }
      );
    }

    const patchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}/${record.id}`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: atHeaders(),
      body: JSON.stringify({ fields: patchFields, typecast: true }),
    });
    if (!patchRes.ok) {
      const text = await patchRes.text();
      return NextResponse.json(
        { error: `Airtable patch failed: ${patchRes.status} ${text}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, recordId: record.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
