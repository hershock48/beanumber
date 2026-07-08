/**
 * POST /api/mobile/v1/account/delete
 *
 * Deletes the mobile account. Apple's account-deletion requirement
 * (App Store Review Guideline 5.1.1(v), effective June 2022) makes
 * this a hard submission blocker for any app that allows account
 * creation — which we do via Sign in with Apple / Google.
 *
 * What this route does:
 *   1. Verifies the caller.
 *   2. Revokes the current bearer token (adds it to
 *      mobile_token_revocations so any parallel session dies).
 *   3. Deletes the mobile_users row. This cascades — see schema:
 *        - push_devices        ON DELETE CASCADE
 *        - push_prompt_history ON DELETE CASCADE
 *        - push_deliveries     ON DELETE CASCADE
 *      so all mobile-account data is removed in one shot.
 *
 * What this route DOES NOT do:
 *   - It does NOT cancel Stripe subscriptions. Sponsorships stay
 *     running on the sponsor's card. This is intentional — deleting
 *     the app account is separate from ending a giving relationship,
 *     and Apple explicitly permits the two to be handled
 *     independently. The mobile client's confirmation copy states
 *     this plainly.
 *   - It does NOT touch the donors, sponsorships, or messages tables.
 *     Sponsorship + note history is BAN's operational record and
 *     stays intact. If the sponsor wants those wiped, they email
 *     kevin@beanumber.org (a person answers) and Kevin runs a manual
 *     purge.
 *
 * Response: { ok: true } on success. 401 if the caller isn't
 * authenticated. 500 if the DB write fails (client should treat as
 * "try again in a minute" — never leave the user believing they're
 * deleted when they aren't).
 */
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { mobileTokenRevocations, mobileUsers } from '@/lib/db/schema';
import { requireMobileAuth } from '@/lib/auth';
import {
  MOBILE_JWT_TTL_SECONDS,
  hashToken,
  verifyMobileToken,
} from '@/lib/mobile-auth';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  let viewer;
  try {
    viewer = await requireMobileAuth(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 401 });
  }

  // Extract the raw bearer to revoke it. requireMobileAuth doesn't
  // return the raw token — pull it from the header directly.
  const header =
    request.headers.get('authorization') ||
    request.headers.get('Authorization');
  const token =
    header && header.toLowerCase().startsWith('bearer ')
      ? header.slice('bearer '.length).trim()
      : null;

  try {
    // 1. Revoke the current token so any concurrent session dies.
    if (token) {
      let expiresAt: Date;
      try {
        const { payload } = verifyMobileToken(token, { allowGrace: true });
        expiresAt = new Date(payload.exp * 1000);
      } catch {
        expiresAt = new Date(Date.now() + MOBILE_JWT_TTL_SECONDS * 1000);
      }
      await db
        .insert(mobileTokenRevocations)
        .values({ tokenHash: hashToken(token), expiresAt })
        .onConflictDoNothing({ target: mobileTokenRevocations.tokenHash });
    }

    // 2. Delete the mobile_users row. Cascades handle the rest of
    //    the mobile-side state.
    const deleted = await db
      .delete(mobileUsers)
      .where(eq(mobileUsers.id, viewer.userId))
      .returning({ id: mobileUsers.id });

    logger.info('[account/delete] mobile account deleted', {
      userId: viewer.userId,
      rowsRemoved: deleted.length,
    });

    return NextResponse.json({ ok: true, deleted: deleted.length > 0 });
  } catch (err) {
    logger.error('[account/delete] failed', {
      userId: viewer.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Delete failed. Try again in a moment.' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
