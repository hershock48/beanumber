/**
 * Reassign a departed kid's slot to a new kid.
 *
 * GET /api/admin/roster/reassign?shirtNumber=N
 *   Returns context for the reassign UI:
 *     - the kid currently at that shirt #
 *     - the sponsorships linked to that kid (UUID + legacy ChildID)
 *     - replacement candidates, same grade preferred
 *
 * POST /api/admin/roster/reassign
 *   Body: {
 *     fromShirtNumber: number,
 *     toReplacementRecordId: string  // uuid of the new kid
 *   }
 *
 *   Atomic-ish transfer:
 *     1. Departed kid: shirt_number → archived_shirt_number, clear shirt_number.
 *     2. Replacement: archive their old shirt_number (if any), take departing's number.
 *     3. For each Active/Holder/Awaiting Sponsorship linked to departing:
 *          - Append departing's ChildID to previousChildIds (CSV)
 *          - Swap childId / childIdLegacy to the replacement
 *          - Set lastReassignedAt = now
 *          - Clear childRevealedAt so the reveal fires next visit
 *
 *   Admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';
import { normalizeGrade } from '@/lib/admin/grade';
import { db } from '@/lib/db/client';
import { children, sponsorships } from '@/lib/db/schema';
import { audit } from '@/lib/db/mutations';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';

async function findKidByShirtNumber(n: number) {
  const rows = await db
    .select()
    .from(children)
    .where(eq(children.shirtNumber, n))
    .limit(1);
  return rows[0] || null;
}

async function getKidByRecordId(id: string) {
  const rows = await db.select().from(children).where(eq(children.id, id)).limit(1);
  return rows[0] || null;
}

async function findSponsorshipsForKid(
  childRecordId: string,
  childIdLegacy: string | null
) {
  // Dual-key kid match — UUID FK OR legacy ChildID — so transition-state
  // rows that carry only the legacy id still get reassigned.
  return db
    .select()
    .from(sponsorships)
    .where(
      and(
        or(
          eq(sponsorships.childId, childRecordId),
          childIdLegacy ? eq(sponsorships.childIdLegacy, childIdLegacy) : eq(sponsorships.childIdLegacy, '__NEVER__')
        ),
        inArray(sponsorships.status, ['Active', 'Holder', 'Awaiting Sponsor'])
      )
    );
}

async function listEligibleReplacements(departed: { id: string; gradeClass: string | null }) {
  // All kids except the departed one, with a shirt number and not
  // departed.
  const rows = await db
    .select()
    .from(children)
    .where(and(isNull(children.departedAt)));
  const targetGradeKey = normalizeGrade(departed.gradeClass).key;
  return rows
    .filter(r => r.id !== departed.id)
    .filter(r => typeof r.shirtNumber === 'number' && (r.shirtNumber ?? 0) >= 1)
    .map(r => {
      const gradeKey = normalizeGrade(r.gradeClass).key;
      return {
        recordId: r.id,
        shirtNumber: r.shirtNumber!,
        displayName:
          r.displayName || r.firstName || `Kid #${r.shirtNumber}`,
        photoUrl: r.profilePhotoUrl || null,
        gradeClass: r.gradeClass || '',
        gradeKey,
        sameGrade: gradeKey === targetGradeKey,
      };
    })
    .sort((a, b) => {
      if (a.sameGrade !== b.sameGrade) return a.sameGrade ? -1 : 1;
      return a.shirtNumber - b.shirtNumber;
    });
}

// ─── GET ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = (await getAdminRole()) || 'admin';
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const url = new URL(request.url);
  const shirtNumberStr = url.searchParams.get('shirtNumber');
  const shirtNumber = shirtNumberStr ? Number(shirtNumberStr) : NaN;
  if (!Number.isInteger(shirtNumber) || shirtNumber < 1) {
    return NextResponse.json(
      { error: 'shirtNumber query param required' },
      { status: 400 }
    );
  }

  const kid = await findKidByShirtNumber(shirtNumber);
  if (!kid) {
    return NextResponse.json(
      { error: `No kid found at shirt #${shirtNumber}` },
      { status: 404 }
    );
  }

  const sponsorshipsForKid = await findSponsorshipsForKid(kid.id, kid.childId);
  const replacements = await listEligibleReplacements(kid);

  return NextResponse.json({
    ok: true,
    kid: {
      recordId: kid.id,
      shirtNumber: kid.shirtNumber,
      displayName:
        kid.displayName || kid.firstName || `Kid #${shirtNumber}`,
      gradeClass: kid.gradeClass || '',
      gradeKey: normalizeGrade(kid.gradeClass).key,
      gradeLabel: normalizeGrade(kid.gradeClass).label,
      departedAt: kid.departedAt ? new Date(kid.departedAt).toISOString() : null,
    },
    sponsorships: sponsorshipsForKid.map(s => ({
      recordId: s.id,
      sponsorName: s.sponsorName || '(unnamed sponsor)',
      sponsorEmail: s.sponsorEmail || '',
      status: s.status || '',
    })),
    replacements,
  });
}

// ─── POST ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = (await getAdminRole()) || 'admin';
  if (role !== 'admin') {
    return NextResponse.json(
      { error: 'Admin only — only Kevin can reassign a sponsorship slot.' },
      { status: 403 }
    );
  }

  let body: { fromShirtNumber?: number; toReplacementRecordId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const fromShirtNumber = body.fromShirtNumber;
  const toReplacementRecordId = body.toReplacementRecordId;
  if (
    typeof fromShirtNumber !== 'number' ||
    !Number.isInteger(fromShirtNumber) ||
    fromShirtNumber < 1
  ) {
    return NextResponse.json(
      { error: 'fromShirtNumber must be a positive integer' },
      { status: 400 }
    );
  }
  if (!toReplacementRecordId) {
    return NextResponse.json(
      { error: 'toReplacementRecordId required' },
      { status: 400 }
    );
  }

  const departing = await findKidByShirtNumber(fromShirtNumber);
  if (!departing) {
    return NextResponse.json(
      { error: `No kid at shirt #${fromShirtNumber}` },
      { status: 404 }
    );
  }
  const replacement = await getKidByRecordId(toReplacementRecordId);
  if (!replacement) {
    return NextResponse.json(
      { error: 'Replacement kid not found' },
      { status: 404 }
    );
  }
  if (replacement.id === departing.id) {
    return NextResponse.json(
      { error: 'Cannot reassign a kid to themselves' },
      { status: 400 }
    );
  }
  if (replacement.departedAt) {
    return NextResponse.json(
      { error: 'Replacement kid is marked departed — pick a different one' },
      { status: 400 }
    );
  }

  const departingChildIdLegacy = departing.childId;
  const sponsorshipsForKid = await findSponsorshipsForKid(
    departing.id,
    departingChildIdLegacy
  );

  try {
    // Step 1: shirt-number transfer.
    // Replacement first — they take departing's number; their old
    // number lands in archive.
    const replacementOldShirt = replacement.shirtNumber;
    await db
      .update(children)
      .set({
        shirtNumber: fromShirtNumber,
        archivedShirtNumber:
          typeof replacementOldShirt === 'number'
            ? replacementOldShirt
            : replacement.archivedShirtNumber,
        updatedAt: new Date(),
      })
      .where(eq(children.id, replacement.id));

    // Departing — archive its (now-stolen) number, clear the live one.
    await db
      .update(children)
      .set({
        archivedShirtNumber: fromShirtNumber,
        shirtNumber: null,
        updatedAt: new Date(),
      })
      .where(eq(children.id, departing.id));

    // Audit both children rows so the reassignment shows up cleanly
    // in the change log. Reassignment is the highest-stakes roster op
    // (it rewires the sponsor→kid relationship), so the audit trail is
    // worth two rows.
    await audit({
      table: 'children', recordId: replacement.id, action: 'UPDATE',
      actorType: 'admin', actorId: role,
      before: replacement as unknown as Record<string, unknown>,
      after: { ...(replacement as unknown as Record<string, unknown>), shirtNumber: fromShirtNumber, archivedShirtNumber: typeof replacementOldShirt === 'number' ? replacementOldShirt : replacement.archivedShirtNumber },
    });
    await audit({
      table: 'children', recordId: departing.id, action: 'UPDATE',
      actorType: 'admin', actorId: role,
      before: departing as unknown as Record<string, unknown>,
      after: { ...(departing as unknown as Record<string, unknown>), shirtNumber: null, archivedShirtNumber: fromShirtNumber },
    });

    // Step 2: rewrite each sponsorship.
    const now = new Date();
    for (const s of sponsorshipsForKid) {
      const existingHistory = s.previousChildIds || '';
      const updatedHistory = departingChildIdLegacy
        ? existingHistory
          ? `${existingHistory}\n${departingChildIdLegacy}`
          : departingChildIdLegacy
        : existingHistory;

      await db
        .update(sponsorships)
        .set({
          childId: replacement.id,
          childIdLegacy: replacement.childId,
          previousChildIds: updatedHistory,
          lastReassignedAt: now,
          childRevealedAt: null,
          updatedAt: now,
        })
        .where(eq(sponsorships.id, s.id));
    }

    return NextResponse.json({
      ok: true,
      transferredSponsorships: sponsorshipsForKid.length,
      newShirtNumberForReplacement: fromShirtNumber,
      replacementName:
        replacement.displayName || replacement.firstName || 'kid',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
