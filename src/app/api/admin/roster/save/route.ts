/**
 * Admin · Roster save — write structured kid fields back to Airtable.
 *
 * POST /api/admin/roster/save
 * Body: {
 *   shirtNumber: number,
 *   fields: {
 *     nameMeaning: string,
 *     familyContext: string,
 *     loves: string,
 *     childQuote: string,
 *     notes: string,
 *   }
 * }
 *
 * Looks up the Child record by shirt number, PATCHes the five
 * structured fields. Auth via cookie or X-Admin-Token header.
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

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

// Airtable field IDs for the Children table — using IDs keeps writes
// stable if the field name changes in the UI.
const F = {
  shirtNumber: 'fldFLnW4dMCjyKFkO',
  nameMeaning: 'flddhwxv3FT9DJqaF',
  familyContext: 'fldmN80uNieMZx64U',
  loves: 'fldwBn2AyXKt4vgi5',
  childQuote: 'flds9uA6MCoEbc2dJ',
  notes: 'fldbQuWFgNXnlZIVX',
  intakeFromCampus: 'fldZ3A6XK1yVUzhLJ',
  lastEditedBySimon: 'fldHeGgc5op4WpqAq',
  pendingFields: 'fldHnJHD0jv2lPgyU',
  studentOfMonth: 'fldQrcXzw32aOZWZ3',
};

/** Field name (not ID) for the PendingDraft text field on the
 *  Children table. Stores Simon's pending structured-field edits as
 *  JSON — the gating store that holds his changes out of the public
 *  fields until Kevin approves. Used as a name rather than an ID so
 *  this code keeps working before Kevin has had a chance to add the
 *  field in Airtable; once added, no code change needed.
 *
 *  Parser and constants live in @/lib/admin/pending-draft so the save
 *  endpoint, approve endpoint, and queries all share one definition.
 */
const PENDING_DRAFT_FIELD = 'PendingDraft';

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
    };
    // Internal flag: when an admin (Kevin) clicks "Mark as reviewed"
    // in the editor banner, the client sends clearSimonFlag=true and
    // we wipe LastEditedBySimon back to null even though no other
    // fields necessarily changed.
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
    // Look up the record by shirt number.
    const lookupUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}?filterByFormula=${encodeURIComponent(`{ShirtNumber}=${shirtNumber}`)}&maxRecords=1`;
    const lookupRes = await fetch(lookupUrl, {
      headers: atHeaders(),
      cache: 'no-store',
    });
    if (!lookupRes.ok) {
      const text = await lookupRes.text();
      return NextResponse.json(
        { error: `Airtable lookup failed: ${lookupRes.status} ${text}` },
        { status: 502 }
      );
    }
    const lookupData = await lookupRes.json();
    const record = lookupData.records?.[0];
    if (!record) {
      return NextResponse.json(
        { error: `No child record found for shirt #${shirtNumber}` },
        { status: 404 }
      );
    }

    // Compare incoming values against the existing record so we know
    // which fields actually changed (used for per-field pending
    // tracking below).
    const existingFields = (record.fields || {}) as Record<string, unknown>;
    const changedKeys: string[] = [];
    const fieldKeyToAirtable: Record<string, string> = {
      nameMeaning: F.nameMeaning,
      familyContext: F.familyContext,
      loves: F.loves,
      childQuote: F.childQuote,
      notes: F.notes,
      intakeFromCampus: F.intakeFromCampus,
      studentOfMonth: F.studentOfMonth,
    };

    // Build the patch — only include fields that were sent AND differ
    // from the current value. (Same value = no-op write.)
    const patchFields: Record<string, unknown> = {};
    for (const [key, fieldId] of Object.entries(fieldKeyToAirtable)) {
      const incoming = (fields as Record<string, unknown>)[key];
      if (typeof incoming !== 'string') continue;
      const current = (existingFields[
        // map field ID back to airtable cell name — Airtable returns
        // fields keyed by name, so we look up by name not id here
        ({
          nameMeaning: 'NameMeaning',
          familyContext: 'FamilyContext',
          loves: 'Loves',
          childQuote: 'ChildQuote',
          notes: 'Notes',
          intakeFromCampus: 'IntakeFromCampus',
          studentOfMonth: 'StudentOfMonth',
        } as Record<string, string>)[key]
      ] as string) || '';
      if (incoming === current) continue;
      patchFields[fieldId] = incoming;
      changedKeys.push(key);
    }

    // Pending-field bookkeeping:
    //   - Simon saves a structured field → add its option to PendingFields.
    //   - Kevin saves a field that's currently pending → remove its option.
    //   - Kevin sends clearSimonFlag → wipe PendingFields entirely.
    //   - LastEditedBySimon tracks the most recent Simon save (and clears
    //     when Kevin reviews).
    const role = await getAdminRole();
    const currentPending = Array.isArray(existingFields.PendingFields)
      ? (existingFields.PendingFields as Array<string | { name?: string }>).map(
          v => (typeof v === 'string' ? v : v?.name || '')
        ).filter(Boolean)
      : [];
    let nextPending = new Set(currentPending);

    if (role === 'simon') {
      // Simon's structured-field edits go into PendingDraft JSON
      // rather than the public fields, so they stay invisible to
      // sponsors until Kevin approves via /admin/review or the
      // editor. Per Kevin: "Simon's updates shouldn't go live
      // before I approve them." intakeFromCampus and studentOfMonth
      // remain direct-write — the first is already non-public by
      // design, the second has its own pending pattern via
      // PendingSOTMMonth.
      const currentDraft = parsePendingDraft(existingFields[PENDING_DRAFT_FIELD]);
      const nextDraft: PendingDraft = { ...currentDraft };
      let draftChanged = false;

      for (const key of changedKeys) {
        if (!GATED_FIELDS.has(key as keyof PendingDraft)) continue;
        const fieldId = fieldKeyToAirtable[key];
        const value = patchFields[fieldId];
        // Pull this field out of the public-field patch — Simon's
        // value is NOT going live in this write.
        delete patchFields[fieldId];
        if (typeof value === 'string') {
          (nextDraft as Record<string, string>)[key] = value;
          draftChanged = true;
        }
        const option = FIELD_TO_PENDING_OPTION[key as keyof PendingDraft];
        if (option) nextPending.add(option);
      }

      if (draftChanged) {
        const hasAnyDraft = Object.keys(nextDraft).length > 0;
        patchFields[PENDING_DRAFT_FIELD] = hasAnyDraft
          ? JSON.stringify(nextDraft)
          : null;
      }
      if (changedKeys.length > 0) {
        patchFields[F.lastEditedBySimon] = new Date().toISOString();
      }
    } else if (role === 'admin') {
      if (body.clearSimonFlag) {
        // Kevin hit "Mark all reviewed" — wipe the pending state
        // entirely. Public fields are NOT touched; any unapproved
        // drafts in PendingDraft get discarded as a side effect.
        nextPending = new Set();
        patchFields[F.lastEditedBySimon] = null;
        if (existingFields[PENDING_DRAFT_FIELD]) {
          patchFields[PENDING_DRAFT_FIELD] = null;
        }
      } else {
        // Kevin edited fields directly. Any field he changes counts
        // as his decision — remove it from PendingFields AND from
        // PendingDraft so we don't keep showing Simon's stale
        // proposal next to Kevin's now-live value.
        const currentDraft = parsePendingDraft(existingFields[PENDING_DRAFT_FIELD]);
        const nextDraft: PendingDraft = { ...currentDraft };
        let draftChanged = false;
        for (const key of changedKeys) {
          const option = FIELD_TO_PENDING_OPTION[key as keyof PendingDraft];
          if (option) nextPending.delete(option);
          if ((nextDraft as Record<string, string>)[key] !== undefined) {
            delete (nextDraft as Record<string, unknown>)[key];
            draftChanged = true;
          }
        }
        if (draftChanged) {
          const hasAnyDraft = Object.keys(nextDraft).length > 0;
          patchFields[PENDING_DRAFT_FIELD] = hasAnyDraft
            ? JSON.stringify(nextDraft)
            : null;
        }
        // If Kevin cleared the last pending field by editing it,
        // the global flag clears too.
        if (nextPending.size === 0) {
          patchFields[F.lastEditedBySimon] = null;
        }
      }
    }

    // Only write PendingFields if the set actually changed.
    const pendingChanged =
      nextPending.size !== currentPending.length ||
      Array.from(nextPending).some(v => !currentPending.includes(v));
    if (pendingChanged) {
      patchFields[F.pendingFields] = Array.from(nextPending);
    }

    if (Object.keys(patchFields).length === 0) {
      return NextResponse.json({ ok: true, updated: 0, note: 'No fields to update' });
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
