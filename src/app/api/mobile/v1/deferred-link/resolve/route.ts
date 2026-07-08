/**
 * POST /api/mobile/v1/deferred-link/resolve
 *
 * The mobile app's first-open hook calls this once, right after
 * launch. We compute the same (IP + UA) fingerprint the web page
 * used at /stamp time and look for a live, unclaimed row in
 * pending_deferred_links. If we find one, we mark it consumed and
 * return the target path — the app then router.pushes it and the
 * reveal moment kicks in.
 *
 * Auth: intentionally none. The device that scanned the QR before
 * install has no BAN account. The fingerprint is the identity here.
 * Because rows are single-use + 10-minute expiring, the abuse
 * surface is bounded (someone with the same NAT-egress IP and a
 * similar UA who happens to open the app in that 10-minute window
 * could claim someone else's link, but they'd land on a
 * hold-to-meet screen for a shirt they don't own — nothing damaging
 * happens).
 *
 * Response:
 *   { ok: true, targetPath: "/meet/48" }        — match found + consumed
 *   { ok: true, targetPath: null }              — no match; app opens home
 *
 * Never 500s on lookup failure — logs and returns null. First-open
 * paths should degrade gracefully.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { pendingDeferredLinks } from '@/lib/db/schema';
import { fingerprintFromRequest } from '@/lib/deferred-link';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  const fingerprint = fingerprintFromRequest(req);
  const now = new Date();

  try {
    // Grab the most recent live match. If two rows exist for the
    // same fingerprint (rare — user scanned two shirts in 10min),
    // the newer one wins. Older rows will expire silently.
    const rows = await db
      .select()
      .from(pendingDeferredLinks)
      .where(
        and(
          eq(pendingDeferredLinks.fingerprint, fingerprint),
          isNull(pendingDeferredLinks.consumedAt),
          gt(pendingDeferredLinks.expiresAt, now)
        )
      )
      .orderBy(desc(pendingDeferredLinks.createdAt))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ ok: true, targetPath: null });
    }

    // Claim it — set consumed_at so a second /resolve from the
    // same device (retry, background/foreground cycle) doesn't
    // re-consume. The UPDATE is guarded by consumed_at IS NULL so
    // two racing requests only produce one winner.
    const updated = await db
      .update(pendingDeferredLinks)
      .set({ consumedAt: now })
      .where(
        and(
          eq(pendingDeferredLinks.id, row.id),
          isNull(pendingDeferredLinks.consumedAt)
        )
      )
      .returning({ id: pendingDeferredLinks.id });

    if (updated.length === 0) {
      // Another request beat us to it. Behave as if we found nothing —
      // the app will show its normal home screen and the other
      // request already handled the link.
      return NextResponse.json({ ok: true, targetPath: null });
    }

    return NextResponse.json({
      ok: true,
      targetPath: row.targetPath,
      shirtNumber: row.shirtNumber ?? null,
      source: row.source ?? null,
    });
  } catch (err) {
    console.warn(
      '[deferred-link/resolve] lookup failed:',
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json({ ok: true, targetPath: null });
  }
}
