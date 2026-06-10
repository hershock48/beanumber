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
 * Donation in Airtable and verify it's the right shape — anyone forging
 * the cookie would still need a real Donation matching the right
 * pattern, which they cannot manufacture.
 *
 * Idempotency: if a Sponsorship already exists for this subscription
 * (because the user tapped twice, or because Kevin already created one
 * by hand) we return 200 with the existing sponsor code instead of
 * creating a duplicate.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION, SPONSORSHIP_STATUS, AUTH_STATUS } from '@/lib/constants';
import { sendSponsorWelcomeEmail } from '@/lib/email';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const DONATIONS_TABLE = process.env.AIRTABLE_DONATIONS_TABLE || 'Donations';
const SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';

const requestSchema = z.object({
  shirtNumber: z.number().int().positive(),
});

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function atFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...atHeaders(), ...(init?.headers || {}) },
      cache: 'no-store',
    });
    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data, text };
  } catch (err) {
    console.error('[ClaimMatch] Airtable fetch error:', err);
    return { ok: false, status: 0, data: null, text: String(err) };
  }
}

/**
 * Generate a sponsor code in the BAN-YYYY-NNN format. Uses the same
 * pattern as the webhook's generator. Collision-resistant enough for
 * BAN's volume; a future migration could swap in a counter-backed
 * generator if collisions ever happen in practice.
 */
function generateSponsorCode(): string {
  const year = new Date().getFullYear();
  const num = Math.floor(Math.random() * 900) + 100; // 100-999
  return `BAN-${year}-${num}`;
}

export async function POST(request: NextRequest) {
  try {
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      console.error('[ClaimMatch] Airtable credentials missing');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    // 1. Validate body
    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', detail: parsed.error.issues.map(i => i.message).join('; ') },
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

    // 3. Look up the Child by shirt number
    const childFormula = encodeURIComponent(`{ShirtNumber}=${shirtNumber}`);
    const childRes = await atFetch<{ records: Array<{ id: string; fields: any }> }>(
      `/${encodeURIComponent(CHILDREN_TABLE)}?filterByFormula=${childFormula}&maxRecords=1`
    );
    if (!childRes.ok || !childRes.data?.records?.length) {
      return NextResponse.json({ error: 'Child not found for that number.' }, { status: 404 });
    }
    const childRecord = childRes.data.records[0];
    const childFields = childRecord.fields;
    if (childFields.ReservedForAuction) {
      return NextResponse.json(
        { error: 'That number is reserved and cannot be claimed.' },
        { status: 409 }
      );
    }
    const childRecordId = childRecord.id;
    const childId = (childFields.ChildID || '') as string;
    const childDisplayName =
      (childFields.DisplayName as string | undefined) ||
      `${childFields.FirstName || 'Child'} ${childFields.LastInitial || ''}`.trim();
    const childPhoto = childFields.ProfilePhoto;
    const childLocation = childFields.SchoolLocation;
    const childAge = childFields.DateOfBirth
      ? String(yearsSince(childFields.DateOfBirth))
      : childFields.GradeClass;

    // 4. Look up the Donation by Stripe Checkout Session ID
    const donationFormula = encodeURIComponent(
      `{Stripe Checkout Session ID} = "${sessionId.replace(/"/g, '\\"')}"`
    );
    const donationRes = await atFetch<{ records: Array<{ id: string; fields: any }> }>(
      `/${encodeURIComponent(DONATIONS_TABLE)}?filterByFormula=${donationFormula}&maxRecords=1`
    );
    if (!donationRes.ok || !donationRes.data?.records?.length) {
      return NextResponse.json(
        { error: 'No matching purchase found for this session.' },
        { status: 401 }
      );
    }
    const donation = donationRes.data.records[0];
    const donationFields = donation.fields;

    // 5. Verify this is a Shirt + Stay donation. We deliberately only
    // auto-bind for that flow — shirt-only buyers see a separate sponsor
    // CTA on /[number] that goes through the standard checkout (and
    // creates the Sponsorship cleanly with its own paid flow).
    const donationSource = (donationFields['Donation Source'] || '') as string;
    const isRecurring = Boolean(donationFields['Recurring Donation']);
    if (donationSource !== 'Shirt + Monthly' || !isRecurring) {
      return NextResponse.json(
        {
          error:
            'This claim path is only for Shirt + Stay buyers. If you want to sponsor this child, use the regular sponsor button on the page.',
        },
        { status: 400 }
      );
    }

    // 6. Resolve the Donor record + email
    const donorLink: string[] = donationFields['Donor'] || [];
    if (!donorLink.length) {
      return NextResponse.json(
        { error: 'Buyer record not found on this donation.' },
        { status: 500 }
      );
    }
    const donorRecordId = donorLink[0];

    const donorRes = await atFetch<{ id: string; fields: any }>(
      `/${encodeURIComponent(DONORS_TABLE)}/${donorRecordId}`
    );
    if (!donorRes.ok || !donorRes.data) {
      return NextResponse.json({ error: 'Donor lookup failed.' }, { status: 500 });
    }
    const donorFields = donorRes.data.fields;
    const sponsorEmail =
      (donorFields['Email Address'] as string | undefined) ||
      (donationFields['Donor Email at Donation'] as string | undefined) ||
      '';
    const sponsorName = (donorFields['Donor Name'] as string | undefined) || '';
    const monthlyAmount = Number(donationFields['Donation Amount']) || 25;

    if (!sponsorEmail) {
      return NextResponse.json({ error: 'Buyer email missing.' }, { status: 500 });
    }

    // 7. Look up the Stripe subscription this Donation belongs to. We
    // use that subscription ID as the idempotency key when creating the
    // Sponsorship — one subscription, one Sponsorship.
    //
    // The Donation record doesn't carry a Subscription ID field directly
    // (the schema explicitly forbids it — see airtable_schema.md trap
    // §2), so we resolve via Stripe instead. The Donation does carry the
    // Customer ID and Session ID, both of which Stripe can use to find
    // the subscription.
    const stripeCustomerId = (donationFields['Stripe Customer ID'] as string | undefined) || '';
    const subscriptionId = await resolveSubscriptionId(sessionId, stripeCustomerId);
    if (!subscriptionId) {
      console.warn('[ClaimMatch] Could not resolve subscription ID for session', sessionId);
      // Continue without — the Sponsorship will still be created, just
      // without StripeSubscriptionID. Kevin can fix it manually if it
      // matters.
    }

    // 8. Idempotency: existing Sponsorship for this subscription?
    if (subscriptionId) {
      const dupeFormula = encodeURIComponent(
        `{StripeSubscriptionID} = "${subscriptionId.replace(/"/g, '\\"')}"`
      );
      const dupeRes = await atFetch<{ records: Array<{ id: string; fields: any }> }>(
        `/${encodeURIComponent(SPONSORSHIPS_TABLE)}?filterByFormula=${dupeFormula}&maxRecords=1`
      );
      if (dupeRes.ok && dupeRes.data?.records?.length) {
        const existing = dupeRes.data.records[0];
        const existingCode = (existing.fields?.SponsorCode as string | undefined) || '';
        await setSponsorSessionCookie(cookieStore, sponsorEmail, existingCode);
        return NextResponse.json({
          success: true,
          alreadyClaimed: true,
          sponsorCode: existingCode,
        });
      }
    }

    // 9. Create the Sponsorship record. ChildRevealedAt set to now —
    // the buyer is literally meeting their child right now, no reason
    // to lockbox them.
    const sponsorCode = generateSponsorCode();
    const today = new Date().toISOString().split('T')[0];
    const sponsorshipFields: Record<string, unknown> = {
      SponsorCode: sponsorCode,
      SponsorEmail: sponsorEmail,
      ChildID: childId,
      ChildDisplayName: childDisplayName,
      AuthStatus: AUTH_STATUS.ACTIVE,
      Status: SPONSORSHIP_STATUS.ACTIVE,
      VisibleToSponsor: true,
      SponsorshipStartDate: today,
      Children: [childRecordId],
      Donor: [donorRecordId],
      MonthlyAmount: monthlyAmount,
      ChildRevealedAt: new Date().toISOString(),
    };
    if (sponsorName) sponsorshipFields.SponsorName = sponsorName;
    if (childAge) sponsorshipFields.ChildAge = childAge;
    if (childLocation) sponsorshipFields.ChildLocation = childLocation;
    if (childPhoto?.length) sponsorshipFields.ChildPhoto = childPhoto;
    if (subscriptionId) sponsorshipFields.StripeSubscriptionID = subscriptionId;

    const createRes = await atFetch<{ id: string; fields: any }>(
      `/${encodeURIComponent(SPONSORSHIPS_TABLE)}`,
      {
        method: 'POST',
        body: JSON.stringify({ fields: sponsorshipFields }),
      }
    );
    if (!createRes.ok || !createRes.data) {
      console.error('[ClaimMatch] Sponsorship create failed:', createRes.status, createRes.text.slice(0, 300));
      return NextResponse.json({ error: 'Could not create sponsorship.' }, { status: 500 });
    }
    console.log('[ClaimMatch] Created sponsorship:', createRes.data.id, sponsorCode, 'for', sponsorEmail);

    // 10. Best-effort: backfill the Donation.Child link so reporting
    // sees the connection. Non-fatal.
    try {
      await atFetch(`/${encodeURIComponent(DONATIONS_TABLE)}/${donation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { Child: [childRecordId] } }),
      });
    } catch {
      // Non-fatal
    }

    // 11. Send the no-code welcome email. This is the first email a Shirt +
    // Stay buyer gets that names their child, since the shirt purchase email
    // is deliberately generic. Best-effort — never block the claim on email.
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
      sponsorshipRecordId: createRes.data.id,
    });
  } catch (err: any) {
    console.error('[ClaimMatch] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to claim match.' },
      { status: 500 }
    );
  }
}

/** Compute integer years between an ISO date string and today. */
function yearsSince(isoDate: string): number {
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
  checkoutSessionId: string,
  _stripeCustomerId: string
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
