/**
 * POST /api/mobile/v1/deferred-link/stamp
 *
 * Called by the web page's mobile smart-open banner (on /children/[N]
 * and /meet/*) when the user taps "Install the app to meet [Kid]."
 * We stamp a row into pending_deferred_links keyed to the requesting
 * device's (IP + UA) fingerprint, then the client redirects the
 * browser to the App Store. When the app opens for the first time,
 * it hits /resolve with the same fingerprint and gets the target
 * path back.
 *
 * This endpoint is intentionally unauthenticated — the caller is a
 * mobile browser that has no BAN account yet. The only protection
 * against abuse is:
 *   - Rows expire in 10 minutes.
 *   - Rows are single-use.
 *   - The target path is normalized to a safe app path (must start
 *     with a leading slash, no protocol, no host, no ..).
 *   - Cursory rate limit at the edge would be a follow-up if we see
 *     abuse; not implementing here.
 *
 * Body: { targetPath: string, shirtNumber?: number, source?: string }
 * Response: { ok: true } — always 200 on success; failures are
 *   logged server-side but returned as 200 too, so the client can
 *   proceed to the App Store even if we couldn't stamp (we prefer a
 *   worse-case "manual number entry after install" over a dead
 *   install path).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { pendingDeferredLinks } from '@/lib/db/schema';
import {
  fingerprintFromRequest,
  tenMinutesFromNow,
} from '@/lib/deferred-link';

export const dynamic = 'force-dynamic';

const Body = z.object({
  // Must start with a leading slash and match one of the app's known
  // route prefixes. Anything else is rejected. Prevents "open the
  // app on javascript:alert(1)" nonsense.
  targetPath: z
    .string()
    .min(2)
    .max(200)
    .regex(/^\/(meet|children|newsletter|campus|me)(\/[\w-]+)*\/?$/),
  shirtNumber: z.number().int().positive().max(1000).optional(),
  source: z.string().max(32).optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  let payload: z.infer<typeof Body>;
  try {
    const raw = await req.json();
    payload = Body.parse(raw);
  } catch {
    // Log-and-succeed. See the docstring for reasoning.
    console.warn('[deferred-link/stamp] invalid body');
    return NextResponse.json({ ok: true });
  }

  const fingerprint = fingerprintFromRequest(req);
  const expiresAt = tenMinutesFromNow();

  try {
    await db.insert(pendingDeferredLinks).values({
      fingerprint,
      targetPath: payload.targetPath,
      shirtNumber: payload.shirtNumber ?? null,
      source: payload.source ?? null,
      expiresAt,
    });
  } catch (err) {
    // Log and 200. A failed stamp shouldn't block the App Store
    // redirect — the user can still install and type the number.
    console.warn(
      '[deferred-link/stamp] insert failed:',
      err instanceof Error ? err.message : String(err)
    );
  }

  return NextResponse.json({ ok: true });
}
