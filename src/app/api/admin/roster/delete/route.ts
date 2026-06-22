/**
 * POST /api/admin/roster/delete
 *   Body: { shirtNumber: number, action: 'request' | 'delete' | 'reject' }
 *
 * Two-step delete workflow:
 *   - request (anyone): stamps deletionRequestedAt = now. Kevin sees
 *     a banner on the editor + trash badge on the grid. Simon uses
 *     this to clean up test entries.
 *   - delete (admin only): hard-delete the children row.
 *   - reject (admin only): clear deletionRequestedAt without deleting.
 *
 * Safety checks (fire on every 'delete' regardless of who requested):
 *   - Refuse if a shirt was already assigned/shipped.
 *   - Refuse if shirtBuyerEmail is set.
 *   - Refuse if any non-trivial Sponsorship row links to this kid.
 *
 * Errors:
 *   401 unauthorized
 *   400 bad request
 *   403 Simon tried to delete or reject
 *   409 safety check blocked the delete
 *   404 kid not found
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';
import { db } from '@/lib/db/client';
import { children, sponsorships } from '@/lib/db/schema';
import { and, eq, inArray, or } from 'drizzle-orm';

async function findKid(shirtNumber: number) {
  const rows = await db
    .select()
    .from(children)
    .where(eq(children.shirtNumber, shirtNumber))
    .limit(1);
  return rows[0] || null;
}

async function safetyCheck(
  kid: Awaited<ReturnType<typeof findKid>>
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!kid) return { ok: false, reason: 'Kid not found' };
  const displayName = kid.displayName || kid.firstName || `Kid #${kid.shirtNumber}`;
  if (kid.shirtAssignedAt) {
    return {
      ok: false,
      reason: `${displayName} has a shirt assigned already (someone bought their number). Clear shirtAssignedAt first if you really want to delete.`,
    };
  }
  if (kid.shirtBuyerEmail) {
    return {
      ok: false,
      reason: `${displayName} has a shirt buyer email on file. Clear shirtBuyerEmail first if you really want to delete.`,
    };
  }
  const live = await db
    .select({ id: sponsorships.id })
    .from(sponsorships)
    .where(
      and(
        or(eq(sponsorships.childId, kid.id), eq(sponsorships.childIdLegacy, kid.childId)),
        inArray(sponsorships.status, [
          'Active',
          'Holder',
          'Awaiting Sponsor',
          'Pending Review',
          'Published',
        ])
      )
    )
    .limit(10);
  if (live.length > 0) {
    return {
      ok: false,
      reason: `${displayName} is linked to ${live.length} sponsorship${
        live.length === 1 ? '' : 's'
      }. Cancel ${live.length === 1 ? 'it' : 'them'} before deleting.`,
    };
  }
  return { ok: true };
}

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { shirtNumber?: number; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const shirtNumber = body.shirtNumber;
  const action = body.action;
  if (typeof shirtNumber !== 'number' || !Number.isInteger(shirtNumber) || shirtNumber < 1) {
    return NextResponse.json(
      { error: 'shirtNumber must be a positive integer' },
      { status: 400 }
    );
  }
  if (!action || !['request', 'delete', 'reject'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be request, delete, or reject' },
      { status: 400 }
    );
  }

  const role = (await getAdminRole()) || 'admin';
  if ((action === 'delete' || action === 'reject') && role !== 'admin') {
    return NextResponse.json(
      { error: 'Only Kevin can approve or reject a deletion' },
      { status: 403 }
    );
  }

  const kid = await findKid(shirtNumber);
  if (!kid) {
    return NextResponse.json(
      { error: `No kid found for shirt #${shirtNumber}` },
      { status: 404 }
    );
  }
  const displayName = kid.displayName || kid.firstName || `Kid #${shirtNumber}`;

  try {
    // ─── REQUEST ────────────────────────────────────────────────
    if (action === 'request') {
      if (kid.deletionRequestedAt) {
        return NextResponse.json({ ok: true, alreadyRequested: true });
      }
      const safe = await safetyCheck(kid);
      if (!safe.ok) {
        return NextResponse.json({ error: safe.reason }, { status: 409 });
      }
      await db
        .update(children)
        .set({ deletionRequestedAt: new Date(), updatedAt: new Date() })
        .where(eq(children.id, kid.id));
      return NextResponse.json({ ok: true, action: 'request', name: displayName });
    }

    // ─── REJECT ─────────────────────────────────────────────────
    if (action === 'reject') {
      await db
        .update(children)
        .set({ deletionRequestedAt: null, updatedAt: new Date() })
        .where(eq(children.id, kid.id));
      return NextResponse.json({ ok: true, action: 'reject', name: displayName });
    }

    // ─── DELETE (admin only) ────────────────────────────────────
    const safe = await safetyCheck(kid);
    if (!safe.ok) {
      return NextResponse.json({ error: safe.reason }, { status: 409 });
    }
    await db.delete(children).where(eq(children.id, kid.id));
    return NextResponse.json({
      ok: true,
      action: 'delete',
      name: displayName,
      shirtNumber,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
