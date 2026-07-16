/**
 * POST /api/mobile/v1/claim
 *
 * Body: { shirtNumber: number }
 *
 * The in-app claim — the mobile twin of the web claim path inside
 * /api/sponsor/recover/send-link, minus the email round-trip (the
 * viewer is already authenticated by their bearer token, so there's
 * no inbox to prove). Same per-number machinery, same order of
 * operations:
 *
 *   1. Resolve the number (canonical row ≤53, Batches cycle math 54+).
 *   2. Already yours? (claimed_shirt_number or child-identity match
 *      on ANY of the viewer's emails) → idempotent success.
 *   3. Taken by someone else? → 409 { code: 'number_claimed' }.
 *   4. Childless checkout row on one of the viewer's emails? → BIND
 *      it (keeps status, monthly amount, Stripe sub on one row).
 *   5. Otherwise → create a fresh Holder row.
 *
 * The claim is written under the viewer's LINKED purchase email when
 * one exists (that's where their money data lives; web sign-in with
 * that email then sees the same claim), falling back to the provider
 * email. childRevealedAt is stamped — an in-app claim always follows
 * the Hold-to-Meet reveal.
 *
 * NEVER called automatically. The reveal screen offers an explicit
 * "Keep #N" CTA — auto-claiming on page view would let any shared
 * /meet/[N] link steal a number from the person holding the shirt.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { requireMobileAuth } from '@/lib/auth';
import { getViewerEmails } from '@/lib/mobile-viewer';
import { resolveShirtNumberForClaim } from '@/lib/claim-resolve';
import {
  findChildlessSponsorshipForEmail,
  findSponsorshipForEmailAndChild,
  findSponsorshipForEmailAndClaimedNumber,
  isNumberClaimedOutsideEmails,
} from '@/lib/db/queries';
import {
  bindSponsorshipToChild,
  createSponsorship,
} from '@/lib/db/mutations';
import { generateUniqueSponsorCode } from '@/lib/sponsor-codes';

export const dynamic = 'force-dynamic';

const schema = z.object({
  shirtNumber: z.number().int().positive(),
});

export interface MobileClaimResponse {
  ok: true;
  /** 'monthly' when the bound row carries an active $25/mo; 'holder'
   *  otherwise. Mirrors the kid endpoint's roleForKid values. */
  role: 'monthly' | 'holder';
  alreadyYours: boolean;
  shirtNumber: number;
  kidFirstName: string;
}

export async function POST(request: NextRequest) {
  const path = '/api/mobile/v1/claim';
  logger.apiRequest('POST', path);

  let viewer: { userId: string; email: string };
  try {
    viewer = await requireMobileAuth(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 401 });
  }

  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { shirtNumber } = parsed.data;

    // 1. Resolve.
    const identity = await resolveShirtNumberForClaim(shirtNumber);
    if (!identity) {
      return NextResponse.json(
        { error: `#${shirtNumber} doesn't resolve to a kid.` },
        { status: 404 }
      );
    }
    if (identity.reservedForAuction) {
      return NextResponse.json(
        { error: `#${shirtNumber} is reserved.` },
        { status: 409 }
      );
    }
    const childContext = {
      id: identity.childUuid ?? '',
      childId: identity.childIdLegacy,
    };
    const emails = await getViewerEmails(viewer);

    // 2. Idempotent fast path — already theirs under any email.
    for (const email of emails) {
      const existing =
        (await findSponsorshipForEmailAndClaimedNumber(email, shirtNumber)) ??
        (await findSponsorshipForEmailAndChild(email, childContext));
      if (existing) {
        const amount = Number(existing.monthlyAmount ?? 0);
        const role: 'monthly' | 'holder' =
          existing.status === 'Active' && amount > 0 ? 'monthly' : 'holder';
        logger.apiResponse('POST', path, 200);
        const body: MobileClaimResponse = {
          ok: true,
          role,
          alreadyYours: true,
          shirtNumber,
          kidFirstName: identity.firstName,
        };
        return NextResponse.json(body);
      }
    }

    // 3. Taken by someone outside the viewer's email set?
    const takenByOther = await isNumberClaimedOutsideEmails(
      shirtNumber,
      identity.childUuid ? null : identity.childIdLegacy,
      emails
    );
    if (takenByOther) {
      console.log(
        `[MobileClaim] #${shirtNumber} already claimed elsewhere; blocked ` +
          `attempt by mobile user ${viewer.userId} (${emails.join(', ')}).`
      );
      return NextResponse.json(
        { code: 'number_claimed' },
        { status: 409 }
      );
    }

    // The email the claim is written under: linked purchase email
    // first (getViewerEmails orders it first) — that's the email the
    // rest of their data lives on and the one web sign-in will use.
    const claimEmail = emails[0];

    // 4. BIND PATH — a childless checkout row (cart+monthly / Shirt +
    // Stay) on any of the viewer's emails becomes THIS kid's row.
    for (const email of emails) {
      try {
        const childless = await findChildlessSponsorshipForEmail(email);
        if (!childless) continue;
        const bound = await bindSponsorshipToChild({
          sponsorshipId: childless.id,
          childId: identity.childUuid,
          childIdLegacy: identity.childIdLegacy,
          childDisplayName: identity.displayName,
          claimedShirtNumber: shirtNumber,
          actorType: 'sponsor',
        });
        const amount = Number(bound.monthlyAmount ?? 0);
        const role: 'monthly' | 'holder' =
          bound.status === 'Active' && amount > 0 ? 'monthly' : 'holder';
        console.log(
          `[MobileClaim] Bound childless ${bound.status} sponsorship ` +
            `${bound.sponsorCode} to #${shirtNumber} for ${email} ` +
            `(mobile user ${viewer.userId}).`
        );
        logger.apiResponse('POST', path, 200);
        const body: MobileClaimResponse = {
          ok: true,
          role,
          alreadyYours: false,
          shirtNumber,
          kidFirstName: identity.firstName,
        };
        return NextResponse.json(body);
      } catch (err) {
        // Bind failed (row raced away, concurrent claim, DB error).
        // Fall through to the Holder-create path — a duplicate row is
        // recoverable by hand; a user with no way in is not.
        console.error(
          `[MobileClaim] Childless-bind failed for ${email} on #${shirtNumber}, continuing:`,
          err
        );
      }
    }

    // 5. CREATE PATH — fresh Holder row. childRevealedAt stamped now:
    // an in-app claim is always post-reveal (the CTA lives on the
    // landed reveal screen).
    const created = await createSponsorship({
      sponsorCode: await generateUniqueSponsorCode(),
      sponsorEmail: claimEmail,
      childId: identity.childUuid,
      childIdLegacy: identity.childIdLegacy,
      childDisplayName: identity.displayName,
      monthlyAmount: 0,
      status: 'Holder',
      sponsorshipStartDate: new Date().toISOString().slice(0, 10),
      childRevealedAt: new Date(),
      claimedShirtNumber: shirtNumber,
    });
    console.log(
      `[MobileClaim] Created Holder ${created.sponsorCode} on #${shirtNumber} ` +
        `for ${claimEmail} (mobile user ${viewer.userId}).`
    );

    logger.apiResponse('POST', path, 200);
    const body: MobileClaimResponse = {
      ok: true,
      role: 'holder',
      alreadyYours: false,
      shirtNumber,
      kidFirstName: identity.firstName,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[MobileClaim] error:', err);
    return NextResponse.json(
      { error: 'Claim failed — try again in a moment.' },
      { status: 500 }
    );
  }
}
