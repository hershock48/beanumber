/**
 * Request a sponsor-recovery OR first-time-claim magic link.
 *
 * Two cases handled by one endpoint:
 *
 *   1. SIGN-IN. An existing sponsor (Active or Holder) lands on
 *      /[number] for a kid they already own — but from a new device,
 *      an incognito window, or after clearing their cookies. They
 *      submit their email. If we find a matching Sponsorship for this
 *      child + email, we send them a one-tap recovery link.
 *
 *   2. FIRST-TIME CLAIM. A shirt buyer/wearer with no Sponsorship row
 *      yet visits /[number] and submits their email to claim the
 *      number. If no one else has claimed this number's kid yet
 *      (no existing Sponsorship row linked to this Children record),
 *      we create a NEW row with Status="Holder" tied to their email,
 *      then send them the same one-tap link. From that moment they
 *      own this number — same as if they'd been there from day one.
 *
 *      If someone else has already claimed this number, the response
 *      is identical (privacy + no info leak); the claim attempt is
 *      logged for admin review.
 *
 * Privacy: the endpoint always returns `{ success: true }` regardless
 * of which branch fired (sign-in vs claim vs blocked). That keeps it
 * from being usable as an email-enumeration or claim-status oracle.
 *
 * Rate limiting: not implemented yet. Volume is low enough that any
 * abuse will surface in Vercel logs; add real rate limiting once we
 * see traffic.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/email';
import { makeRecoveryToken } from '@/lib/recovery-tokens';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

const schema = z.object({
  email: z.string().email(),
  // shirtNumber is now OPTIONAL. If supplied, we sign in / claim for
  // that specific number. If not, we look up the email's most recent
  // active Sponsorship and send the magic link for that one — making
  // sign-in frictionless for returning sponsors who don't have their
  // shirt number handy on a new device.
  shirtNumber: z.number().int().positive().optional(),
});

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Generate a unique sponsor code (e.g. BAN-2026-427). Same shape used
// by the webhook + admin sync paths.
function generateSponsorCode(): string {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 900) + 100;
  return `BAN-${year}-${randomNum}`;
}

interface ChildContext {
  recordId: string;
  childId: string;
  displayName: string;
  firstName: string;
}

/**
 * Resolve the Children record for a given shirt number, plus its
 * display fields. Returns null if the number doesn't resolve.
 */
async function lookupChild(shirtNumber: number): Promise<ChildContext | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return null;
  try {
    const childFormula = encodeURIComponent(`{ShirtNumber}=${shirtNumber}`);
    const childRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        CHILDREN_TABLE
      )}?filterByFormula=${childFormula}&maxRecords=1`,
      { headers: atHeaders(), cache: 'no-store' }
    );
    if (!childRes.ok) return null;
    const childData = await childRes.json();
    const child = childData.records?.[0];
    if (!child) return null;
    const displayName: string =
      child.fields?.DisplayName ||
      `${child.fields?.FirstName || 'Child'} ${child.fields?.LastInitial || ''}`.trim();
    const firstName: string = child.fields?.FirstName || displayName.split(' ')[0] || 'them';
    return {
      recordId: child.id as string,
      // ChildID (the human-readable HSP/BAN-NNN identifier) is what
      // the Sponsorships table stores in its ChildID field. We use
      // it for cross-table lookups rather than Airtable record IDs,
      // because ARRAYJOIN({Children}, ",") on a linked field returns
      // the linked record's PRIMARY FIELD values (i.e. ChildIDs),
      // not record IDs — so FIND(recordId, ...) always missed.
      childId: (child.fields?.ChildID as string) || '',
      displayName,
      firstName,
    };
  } catch (err) {
    console.warn('[Recovery] Child lookup failed', err);
    return null;
  }
}

/**
 * Find an existing Sponsorship (Active or Holder) for this email that
 * links to this child. Returns the SponsorCode if matched.
 *
 * Match by Sponsorships.ChildID (a text/lookup field that holds the
 * HSP/BAN-NNN identifier) rather than by the Children linked-record
 * field. ARRAYJOIN on a linked field joins primary field values, not
 * record IDs, so the old `FIND(recordId, ARRAYJOIN({Children}, ","))`
 * pattern always missed — which created a duplicate Holder row on
 * every sign-in, and made /[N] fail to recognize the legitimate
 * sponsor.
 */
async function findExistingSponsorship(
  email: string,
  childId: string
): Promise<string | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return null;
  if (!childId) return null;
  try {
    // Two paths OR'd together so we catch both newly-created Holder
    // rows (which now carry a denormalized ChildID at write time) AND
    // legacy rows where ChildID was left blank. Matching only on the
    // text field would miss the blank-ChildID legacy rows and create
    // duplicate Holders on every sign-in &mdash; exactly the bug Kevin
    // hit after the first cleanup. The FIND-on-link path uses the
    // Children primary field (which IS ChildID), bracketed with
    // commas to prevent prefix collisions.
    const safeEmail = email.toLowerCase().replace(/"/g, '\\"');
    const safeChildId = childId.replace(/"/g, '\\"');
    const formula = encodeURIComponent(
      `AND(LOWER({SponsorEmail})="${safeEmail}", OR({Status}="Active",{Status}="Holder"), OR({ChildID}="${safeChildId}", FIND("," & "${safeChildId}" & ",", "," & ARRAYJOIN({Children}, ",") & ",")))`
    );
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        SPONSORSHIPS_TABLE
      )}?filterByFormula=${formula}&maxRecords=1`,
      { headers: atHeaders(), cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const sponsorship = data.records?.[0];
    if (!sponsorship) return null;
    return (sponsorship.fields?.SponsorCode as string) || null;
  } catch (err) {
    console.warn('[Recovery] Sponsorship lookup failed', err);
    return null;
  }
}

/**
 * Check whether ANY active claim (Active or Holder) already exists on
 * this child from a DIFFERENT email. Used to block fraudulent second-
 * claim attempts on a number that's already been spoken for. Same
 * ChildID-equality fix as findExistingSponsorship.
 */
async function isChildAlreadyClaimedByOther(
  childId: string,
  excludingEmail: string
): Promise<boolean> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return false;
  if (!childId) return false;
  try {
    // Dual-OR for the same reason as findExistingSponsorship: legacy
    // rows might not carry ChildID even though they link the kid via
    // the Children record. Without the FIND fallback we'd let a
    // second person "claim" a number that's already held by someone
    // else, just because the first person's row has blank ChildID.
    const safeExcluding = excludingEmail.toLowerCase().replace(/"/g, '\\"');
    const safeChildId = childId.replace(/"/g, '\\"');
    const formula = encodeURIComponent(
      `AND(LOWER({SponsorEmail})!="${safeExcluding}", OR({Status}="Active",{Status}="Holder"), OR({ChildID}="${safeChildId}", FIND("," & "${safeChildId}" & ",", "," & ARRAYJOIN({Children}, ",") & ",")))`
    );
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        SPONSORSHIPS_TABLE
      )}?filterByFormula=${formula}&maxRecords=1`,
      { headers: atHeaders(), cache: 'no-store' }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return (data.records?.length || 0) > 0;
  } catch (err) {
    console.warn('[Recovery] Other-claim lookup failed', err);
    return false;
  }
}

/**
 * Email-only sign-in fallback. Given a verified email with no shirt
 * number, look up the most recent Active or Holder Sponsorship and
 * return its sponsorCode + the shirt number of its linked child. This
 * is what powers returning sponsors who don't have their number handy
 * on a new device. Returns null if no matching sponsorship.
 */
async function findMostRecentSponsorshipByEmail(email: string): Promise<{
  sponsorCode: string;
  shirtNumber: number;
  firstName: string;
} | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return null;
  const safe = email.toLowerCase().replace(/"/g, '\\"');
  const formula = encodeURIComponent(
    `AND(LOWER({SponsorEmail})="${safe}", OR({Status}="Active",{Status}="Holder"))`
  );
  try {
    // Sort by SponsorshipStartDate descending so the most recently
    // started sponsorship surfaces first. Tied dates: Airtable's
    // record order tiebreaks.
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        SPONSORSHIPS_TABLE
      )}?filterByFormula=${formula}&sort[0][field]=SponsorshipStartDate&sort[0][direction]=desc&maxRecords=10`,
      { headers: atHeaders(), cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const records: Array<{
      id: string;
      fields: {
        SponsorCode?: string;
        Children?: string[];
      };
    }> = data.records || [];
    for (const sp of records) {
      const sponsorCode = sp.fields?.SponsorCode;
      const childRecordId = sp.fields?.Children?.[0];
      if (!sponsorCode || !childRecordId) continue;
      // Resolve the linked Child to its shirt number + first name.
      const childRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
          CHILDREN_TABLE
        )}/${childRecordId}`,
        { headers: atHeaders(), cache: 'no-store' }
      );
      if (!childRes.ok) continue;
      const child = await childRes.json();
      const cf = child.fields || {};
      const shirtNumber = typeof cf.ShirtNumber === 'number' ? cf.ShirtNumber : null;
      if (!shirtNumber) continue;
      const firstName: string =
        cf.FirstName ||
        cf.DisplayName?.split(' ')[0] ||
        'them';
      return { sponsorCode, shirtNumber, firstName };
    }
    return null;
  } catch (err) {
    console.warn('[Recovery] Email-only lookup failed', err);
    return null;
  }
}

/**
 * Create a new Holder Sponsorship row for a first-time claim. Returns
 * the generated SponsorCode, or null if Airtable rejected the write.
 *
 * Status="Holder" must exist as an option on Sponsorships.Status in
 * Airtable. If it doesn't, this returns null and the caller falls back
 * to a privacy success (the user sees "check your email," but no email
 * is sent — Kevin gets a log line to add the option).
 */
async function createHolderSponsorship(
  email: string,
  childRecordId: string,
  childId: string
): Promise<string | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return null;
  const sponsorCode = generateSponsorCode();
  const today = new Date().toISOString().split('T')[0];
  const fields: Record<string, unknown> = {
    SponsorCode: sponsorCode,
    SponsorEmail: email,
    Status: 'Holder',
    AuthStatus: 'Active',
    VisibleToSponsor: true,
    SponsorshipStartDate: today,
    Children: [childRecordId],
    // Denormalize ChildID at write time. Sponsorships.ChildID is a
    // plain text field, NOT a lookup from the Children link. The
    // recovery lookups (findExistingSponsorship,
    // isChildAlreadyClaimedByOther) match by {ChildID}=value, so if
    // we leave this blank here every future sign-in attempt by the
    // same email will create another duplicate Holder row. That's
    // exactly the bug Kevin hit on /1 after the 2df11df cleanup.
    ChildID: childId,
    MonthlyAmount: 0,
  };
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
        SPONSORSHIPS_TABLE
      )}`,
      {
        method: 'POST',
        headers: atHeaders(),
        body: JSON.stringify({ fields }),
      }
    );
    if (!res.ok) {
      const txt = await res.text();
      console.error('[Recovery] Holder create failed:', txt.slice(0, 300));
      return null;
    }
    console.log('[Recovery] Created Holder sponsorship:', sponsorCode, 'for', email);
    return sponsorCode;
  } catch (err) {
    console.error('[Recovery] Holder create exception:', err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  // Always return this same shape, regardless of which path fires.
  // The page UI shows "Check your email" either way. Privacy first.
  const responseShape = { success: true };

  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { email } = parsed.data;
    let shirtNumber = parsed.data.shirtNumber;

    // EMAIL-ONLY SIGN-IN: no shirt number supplied. Look up the
    // email's most recent active Sponsorship and mint a link for it.
    // This is the returning-sponsor-on-a-new-device path — they don't
    // need to remember which number is theirs.
    if (!shirtNumber) {
      const found = await findMostRecentSponsorshipByEmail(email);
      if (!found) {
        // No existing sponsorship found, and we have no shirt number
        // to claim with. Return privacy success.
        console.log(`[Recovery] No existing sponsorship for ${email} (email-only); nothing to send.`);
        return NextResponse.json(responseShape);
      }
      // We have a valid sponsor — build the link directly. Skip the
      // child-lookup + create-Holder paths below since we already have
      // sponsorCode + shirtNumber.
      try {
        const token = makeRecoveryToken(found.sponsorCode, found.shirtNumber);
        const callbackUrl = `${SITE_URL}/api/sponsor/recover/callback?t=${encodeURIComponent(token)}`;
        const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
              <p style="margin-top: 0;">Hey there,</p>
              <p>
                Tap the button below to sign in. You&rsquo;ll land on
                ${found.firstName}&rsquo;s page. From there, the
                &ldquo;Your kids&rdquo; link in the nav has every kid
                you sponsor or hold.
              </p>
              <p style="text-align: center; margin: 28px 0;">
                <a href="${callbackUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase;">
                  Sign in
                </a>
              </p>
              <p style="color: #888; font-size: 13px;">
                This device will remember you for 30 days &mdash; no
                need to use this link again unless you change devices
                or clear cookies. Link expires in 30 minutes.
              </p>
              <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 24px 0;">
              <p style="font-size: 12px; color: #999; line-height: 1.5;">
                Be A Number, International<br>
                <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a>
              </p>
            </body>
          </html>
        `;
        await sendEmail({
          to: { email, name: '' },
          from: { email: fromEmail, name: 'Be A Number' },
          subject: `Your sign-in link`,
          html,
        });
      } catch (err) {
        console.error('[Recovery] Email-only path failed to send', err);
      }
      return NextResponse.json(responseShape);
    }

    // 1. Resolve the kid for this shirt number.
    const child = await lookupChild(shirtNumber);
    if (!child) {
      console.log(`[Recovery] No child for #${shirtNumber}; nothing to send.`);
      return NextResponse.json(responseShape);
    }

    // 2. SIGN-IN PATH: do they already own this number?
    let sponsorCode = await findExistingSponsorship(email, child.childId);
    let isFreshClaim = false;

    // 3. FIRST-TIME CLAIM PATH: no existing row. Make sure nobody else
    //    has claimed this number first, then create a Holder row.
    if (!sponsorCode) {
      const alreadyTaken = await isChildAlreadyClaimedByOther(
        child.childId,
        email
      );
      if (alreadyTaken) {
        console.log(
          `[Recovery] #${shirtNumber} is already claimed by someone else; ` +
            `silent block on claim attempt by ${email}.`
        );
        return NextResponse.json(responseShape);
      }
      sponsorCode = await createHolderSponsorship(
        email,
        child.recordId,
        child.childId
      );
      if (!sponsorCode) {
        // Holder creation failed (likely "Holder" not yet added to
        // Sponsorships.Status singleSelect). Return privacy success and
        // log so Kevin can add it in Airtable.
        console.error(
          `[Recovery] Could not create Holder row for ${email} on #${shirtNumber}. ` +
            `Check that "Holder" is a valid Sponsorships.Status option.`
        );
        return NextResponse.json(responseShape);
      }
      isFreshClaim = true;
    }

    // 4. Build + send the magic-link email.
    let token: string;
    try {
      token = makeRecoveryToken(sponsorCode, shirtNumber);
    } catch (err) {
      console.error('[Recovery] Token generation failed', err);
      return NextResponse.json(responseShape);
    }
    const callbackUrl = `${SITE_URL}/api/sponsor/recover/callback?t=${encodeURIComponent(token)}`;

    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
    const firstName = child.firstName;
    const subject = isFreshClaim
      ? `#${shirtNumber} is yours — open ${firstName}'s page`
      : `Sign in to ${firstName}'s page`;
    const headline = isFreshClaim
      ? `#${shirtNumber} is yours now.`
      : `Hey there,`;
    const body = isFreshClaim
      ? `<p>You just claimed #${shirtNumber} on
          <a href="https://www.beanumber.org" style="color: #D4A843; font-weight: bold;">beanumber.org</a>.
          The kid behind that number is ${firstName}. Tap the button
          below to open their page. You&rsquo;ll be signed in, and
          this device will remember you for 30 days.</p>`
      : `<p>Tap the button below to sign in and open
          ${firstName}&rsquo;s page on
          <a href="https://www.beanumber.org" style="color: #D4A843; font-weight: bold;">beanumber.org</a>.
          This device will remember you for 30 days &mdash; you
          won&rsquo;t need the link again unless you change devices
          or clear your cookies.</p>`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
          <p style="margin-top: 0;">${headline}</p>
          ${body}
          <p style="text-align: center; margin: 28px 0;">
            <a href="${callbackUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase;">
              Open ${firstName}&rsquo;s page
            </a>
          </p>
          <p style="color: #888; font-size: 13px;">
            This link expires in 30 minutes. If you didn&rsquo;t request it, you can ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 24px 0;">
          <p style="font-size: 12px; color: #999; line-height: 1.5;">
            Be A Number, International<br>
            <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a>
          </p>
        </body>
      </html>
    `;

    const result = await sendEmail({
      to: { email, name: '' },
      from: { email: fromEmail, name: 'Be A Number' },
      subject,
      html,
    });
    if (!result.success) {
      console.error('[Recovery] Failed to send link email:', result.error);
    }

    return NextResponse.json(responseShape);
  } catch (err: any) {
    console.error('[Recovery] send-link error:', err);
    return NextResponse.json(responseShape);
  }
}
