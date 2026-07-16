/**
 * Sponsor "claim your match" endpoint.
 *
 * Under the May 2026 stockpile model, Shirt + Stay buyers activate a
 * monthly Stripe subscription at checkout but their Sponsorship record
 * isn't created — we can't link them to a specific child until they
 * physically receive their shirt, read the number off the back, and
 * visit /[number] on the site.
 *
 * That visit IS the match event. When the buyer lands on /[number] with
 * their ban_buyer_session cookie still set, the page surfaces a "claim
 * this child as your match" card. Tapping it POSTs here. We verify the
 * cookie identifies a real Shirt + Stay subscription with no Sponsorship
 * yet, then create the Sponsorship + issue a sponsor code + drop the
 * sponsor_session cookie so the page reloads in authenticated mode.
 *
 * Auth model: the ban_buyer_session cookie (Stripe Checkout Session ID
 * starting with `cs_`) is the bearer credential. We then look up that
 * Donation in Postgres and verify it's the right shape — anyone forging
 * the cookie would still need a real Donation matching the right
 * pattern, which they cannot manufacture.
 *
 * Idempotency: if a Sponsorship already exists for this subscription
 * (because the user tapped twice, or because Kevin already created one
 * by hand) we return 200 with the existing sponsor code instead of
 * creating a duplicate. Falls back to email+child if the subscription
 * lookup misses.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { SESSION, SPONSORSHIP_STATUS, AUTH_STATUS } from '@/lib/constants';
import { sendSponsorWelcomeEmail } from '@/lib/email';
import {
  findSponsorshipForEmailAndChild,
  findSponsorshipForEmailAndClaimedNumber,
  getDonationWithDonorByCheckoutSessionId,
  getSponsorshipByStripeSubscriptionId,
} from '@/lib/db/queries';
import { resolveShirtNumberForClaim } from '@/lib/claim-resolve';
import { createSponsorship, linkDonationToChild } from '@/lib/db/mutations';
import { generateUniqueSponsorCode } from '@/lib/sponsor-codes';
import { db } from '@/lib/db/client';
import { sponsorships } from '@/lib/db/schema';

const requestSchema = z.object({
  shirtNumber: z.number().int().positive(),
});

/** Compute integer years between an ISO date string and today. */
function yearsSince(isoDate: string | Date): number {
  const birth = new Date(isoDate);
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    years -= 1;
  }
  return Math.max(0, years);
}

/**
 * Find the Stripe subscription ID for this Shirt + Stay donation. The
 * Donation record doesn't store the subscription ID directly, so we
 * retrieve the Checkout Session from Stripe (it carries `subscription`
 * when mode=subscription).
 */
async function resolveSubscriptionId(
  checkoutSessionId: string
): Promise<string | null> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.warn('[ClaimMatch] STRIPE_SECRET_KEY missing — skipping subscription lookup');
    return null;
  }
  try {
    const StripeModule = (await import('stripe')).default;
    const stripe = new StripeModule(secretKey, { apiVersion: '2025-12-15.clover' });
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    if (typeof session.subscription === 'string') return session.subscription;
    if (session.subscription && typeof session.subscription === 'object') {
      return (session.subscription as { id?: string }).id || null;
    }
    return null;
  } catch (err) {
    console.warn('[ClaimMatch] Stripe session retrieve failed:', err);
    return null;
  }
}

/**
 * Drop the sponsor_session cookie so the next /[number] render sees the
 * viewer as the verified sponsor. Same shape as /api/sponsor/verify so
 * the existing portal auth path continues to recognize it.
 */
async function setSponsorSessionCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  email: string,
  sponsorCode: string
) {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION.MAX_AGE_DAYS);
  const value = JSON.stringify({
    email,
    sponsorCode,
    expires: expires.toISOString(),
  });
  cookieStore.set(SESSION.COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    expires,
    path: '/',
  });
}

export async function POST(request: NextRequest) {
  try {
    // 1. Validate body
    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          detail: parsed.error.issues.map(i => i.message).join('; '),
        },
        { status: 400 }
      );
    }
    const { shirtNumber } = parsed.data;

    // 2. Read the buyer-session cookie. This is the only credential —
    // the Stripe Checkout Session ID acts as a bearer token because
    // forging it would require a real matching Donation.
    const cookieStore = await cookies();
    const buyerSessionCookie = cookieStore.get('ban_buyer_session');
    if (!buyerSessionCookie || !buyerSessionCookie.value.startsWith('cs_')) {
      return NextResponse.json(
        { error: 'No buyer session found. Visit your shirt confirmation link first.' },
        { status: 401 }
      );
    }
    const sessionId = buyerSessionCookie.value.trim();

    // 3. Resolve the NUMBER to a claim identity — canonical numbers
    // map to their real children row; cycle numbers (54+) resolve via
    // the Batches math with a synthetic per-number legacy id and no
    // row UUID. Same resolver as the send-link claim path; the old
    // direct row lookup here 404'd every cycle number.
    const identity = await resolveShirtNumberForClaim(shirtNumber);
    if (!identity) {
      return NextResponse.json({ error: 'Child not found for that number.' }, { status: 404 });
    }
    if (identity.reservedForAuction) {
      return NextResponse.json(
        { error: 'That number is reserved and cannot be claimed.' },
        { status: 409 }
      );
    }
    const child = identity.canonicalRow;
    const childRecordId = identity.childUuid;
    const childLegacyId = identity.childIdLegacy;
    const childDisplayName = identity.displayName;
    const childLocation = child.schoolLocation;
    // childAge on the sponsorship snapshot must be an actual age (or
    // empty). The old fallback wrote raw grade codes (LK / UK / P1–P5)
    // into a field the kid page renders as "Age {value}" — producing
    // 'Age P3' etc. Grade context belongs to gradeCode / gradeLabelForSponsor,
    // not ChildAge. If DOB is missing, leave age empty; the kid page has
    // its own fallbacks for grade rendering.
    const childAge = child.dateOfBirth
      ? String(yearsSince(child.dateOfBirth))
      : '';

    // 4. Look up the Donation by Stripe Checkout Session ID, hydrated
    // with donor email + name so we can build the Sponsorship.
    const donation = await getDonationWithDonorByCheckoutSessionId(sessionId);
    if (!donation) {
      return NextResponse.json(
        { error: 'No matching purchase found for this session.' },
        { status: 401 }
      );
    }

    // 5. Verify this is a Shirt + Stay donation. We deliberately only
    // auto-bind for that flow — shirt-only buyers see a separate sponsor
    // CTA on /[number] that goes through the standard checkout (and
    // creates the Sponsorship cleanly with its own paid flow).
    const donationSource = donation.donationSource ?? '';
    const isRecurring = Boolean(donation.recurringDonation);
    if (donationSource !== 'Shirt + Monthly' || !isRecurring) {
      return NextResponse.json(
        {
          error:
            'This claim path is only for Shirt + Stay buyers. If you want to sponsor this child, use the regular sponsor button on the page.',
        },
        { status: 400 }
      );
    }

    // 6. Resolve the buyer email + name. Donor row is the canonical
    // source; the snapshot fields on Donations are a fallback for the
    // rare case the FK is missing.
    const sponsorEmail =
      (donation.donorEmail as string | null) ||
      (donation.donorEmailAtDonation as string | null) ||
      '';
    const sponsorName = (donation.donorName as string | null) || '';
    const monthlyAmount = Number(donation.donationAmount) || 25;

    if (!sponsorEmail) {
      return NextResponse.json({ error: 'Buyer email missing.' }, { status: 500 });
    }

    // 7. Look up the Stripe subscription this Donation belongs to. We
    // use that subscription ID as the idempotency key when creating the
    // Sponsorship — one subscription, one Sponsorship.
    const subscriptionId = await resolveSubscriptionId(sessionId);
    if (!subscriptionId) {
      console.warn('[ClaimMatch] Could not resolve subscription ID for session', sessionId);
      // Continue without — the Sponsorship will still be created, just
      // without StripeSubscriptionID. Kevin can fix it manually if it
      // matters.
    }

    // 8. Idempotency: existing Sponsorship for this subscription?
    if (subscriptionId) {
      const existing = await getSponsorshipByStripeSubscriptionId(subscriptionId);
      if (existing) {
        await setSponsorSessionCookie(cookieStore, sponsorEmail, existing.sponsorCode);
        return NextResponse.json({
          success: true,
          alreadyClaimed: true,
          sponsorCode: existing.sponsorCode,
        });
      }
    }

    // 8b. Defense-in-depth idempotency: even without a subscription ID,
    // if this buyer already owns this NUMBER (or has a row on this
    // claim identity), return it instead of creating a duplicate.
    {
      const existing =
        (await findSponsorshipForEmailAndClaimedNumber(
          sponsorEmail,
          shirtNumber
        )) ??
        (await findSponsorshipForEmailAndChild(sponsorEmail, {
          id: childRecordId ?? '',
          childId: childLegacyId,
        }));
      if (existing) {
        await setSponsorSessionCookie(cookieStore, sponsorEmail, existing.sponsorCode);
        return NextResponse.json({
          success: true,
          alreadyClaimed: true,
          sponsorCode: existing.sponsorCode,
        });
      }
    }

    // 9. Create the Sponsorship record. ChildRevealedAt set to now —
    // the buyer is literally meeting their child right now, no reason
    // to lockbox them.
    const sponsorCode = await generateUniqueSponsorCode();
    const today = new Date().toISOString().split('T')[0];

    // Status semantics: monthlyOptIn ⇒ Active (paying), else Holder.
    // For this endpoint (Shirt + Monthly path) the buyer is always on
    // a subscription so Active is correct, but mirror the rule in code
    // for clarity and to honor the contract in this refactor.
    const statusForRow =
      monthlyAmount > 0 ? SPONSORSHIP_STATUS.ACTIVE : 'Holder';

    let created;
    try {
      created = await createSponsorship({
        sponsorCode,
        sponsorEmail,
        sponsorName: sponsorName || null,
        childId: childRecordId,
        childIdLegacy: childLegacyId,
        childDisplayName,
        monthlyAmount,
        status: statusForRow as 'Active' | 'Holder',
        stripeSubscriptionId: subscriptionId ?? null,
        sponsorshipStartDate: today,
        childRevealedAt: new Date(),
        visibleToSponsor: true,
        claimedShirtNumber: shirtNumber,
      });
    } catch (err) {
      console.error('[ClaimMatch] Sponsorship create failed:', err);
      return NextResponse.json({ error: 'Could not create sponsorship.' }, { status: 500 });
    }

    // Patch in AuthStatus + denormalized child snapshot fields. The
    // createSponsorship signature deliberately doesn&rsquo;t accept these
    // (they&rsquo;re only set in this surface), so we patch via a small
    // follow-up update. AuthStatus=Active is what the verify endpoint
    // checks &mdash; without it, sign-in-by-code would reject these rows.
    try {
      await db
        .update(sponsorships)
        .set({
          authStatus: AUTH_STATUS.ACTIVE,
          childAge: childAge ?? null,
          childLocation: childLocation ?? null,
          updatedAt: new Date(),
        })
        .where(eq(sponsorships.id, created.id));
    } catch (err) {
      console.warn('[ClaimMatch] AuthStatus/denorm patch failed (non-fatal):', err);
    }

    console.log(
      '[ClaimMatch] Created sponsorship:',
      created.id,
      sponsorCode,
      'for',
      sponsorEmail
    );

    // 10. Best-effort: backfill the Donation→Child link so reporting
    // sees the connection. Non-fatal. Cycle numbers have no children
    // row to link (childRecordId null) — linkDonationToChild no-ops
    // on a falsy id.
    await linkDonationToChild(donation.donationId, childRecordId ?? '');

    // 11. Send the no-code welcome email. This is the first email a
    // Shirt + Stay buyer gets that names their child, since the shirt
    // purchase email is deliberately generic. Best-effort — never
    // block the claim on email.
    try {
      await sendSponsorWelcomeEmail(
        sponsorEmail,
        sponsorName,
        childDisplayName,
        sponsorCode,
        shirtNumber
      );
    } catch (err) {
      console.warn('[ClaimMatch] Welcome email failed (non-fatal):', err);
    }

    // 12. Set sponsor_session cookie so the page reload renders the
    // authenticated view.
    await setSponsorSessionCookie(cookieStore, sponsorEmail, sponsorCode);

    return NextResponse.json({
      success: true,
      sponsorCode,
      sponsorshipRecordId: created.id,
    });
  } catch (err: any) {
    console.error('[ClaimMatch] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to claim match.' },
      { status: 500 }
    );
  }
}
