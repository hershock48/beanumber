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
 *
 * Data layer: reads/writes go through src/lib/db/{queries,mutations}.ts
 * (Postgres via Drizzle). Airtable is no longer involved here — the
 * Stripe webhook still dual-writes, but this surface is Postgres-only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/email';
import { makeRecoveryToken } from '@/lib/recovery-tokens';
import {
  findSponsorshipForEmailAndChild,
  getChildByShirtNumber,
  getMostRecentSponsorshipForEmail,
  isChildClaimedByOtherEmail,
} from '@/lib/db/queries';
import { createSponsorship } from '@/lib/db/mutations';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

const schema = z.object({
  email: z.string().email(),
  // shirtNumber is OPTIONAL. If supplied, we sign in / claim for that
  // specific number. If not, we look up the email's most recent active
  // Sponsorship and send the magic link for that one — making sign-in
  // frictionless for returning sponsors who don't have their shirt
  // number handy on a new device.
  shirtNumber: z.number().int().positive().optional(),
});

// Generate a unique sponsor code (e.g. BAN-2026-427). Same shape used
// by the webhook + admin sync paths.
function generateSponsorCode(): string {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 900) + 100;
  return `BAN-${year}-${randomNum}`;
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
    const shirtNumber = parsed.data.shirtNumber;

    // EMAIL-ONLY SIGN-IN: no shirt number supplied. Look up the
    // email's most recent active Sponsorship and mint a link for it.
    // This is the returning-sponsor-on-a-new-device path — they don't
    // need to remember which number is theirs.
    if (!shirtNumber) {
      const found = await getMostRecentSponsorshipForEmail(email);
      if (!found) {
        // No existing sponsorship found, and we have no shirt number
        // to claim with. Return privacy success.
        console.log(
          `[Recovery] No existing sponsorship for ${email} (email-only); nothing to send.`
        );
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
    const child = await getChildByShirtNumber(shirtNumber);
    if (!child) {
      console.log(`[Recovery] No child for #${shirtNumber}; nothing to send.`);
      return NextResponse.json(responseShape);
    }
    const displayName =
      child.displayName ||
      `${child.firstName || 'Child'} ${child.lastInitial || ''}`.trim();
    const firstName = child.firstName || displayName.split(' ')[0] || 'them';
    const childContext = { id: child.id, childId: child.childId };

    // 2. SIGN-IN PATH: do they already own this number?
    const existing = await findSponsorshipForEmailAndChild(email, childContext);
    let sponsorCode = existing?.sponsorCode ?? null;
    let isFreshClaim = false;

    // 3. FIRST-TIME CLAIM PATH: no existing row. Make sure nobody else
    //    has claimed this number first, then create a Holder row.
    if (!sponsorCode) {
      const alreadyTaken = await isChildClaimedByOtherEmail(childContext, email);
      if (alreadyTaken) {
        console.log(
          `[Recovery] #${shirtNumber} is already claimed by someone else; ` +
            `silent block on claim attempt by ${email}.`
        );
        return NextResponse.json(responseShape);
      }
      try {
        const created = await createSponsorship({
          sponsorCode: generateSponsorCode(),
          sponsorEmail: email,
          childId: child.id,
          childIdLegacy: child.childId,
          childDisplayName: displayName,
          monthlyAmount: 0,
          status: 'Holder',
          sponsorshipStartDate: new Date().toISOString().slice(0, 10),
        });
        sponsorCode = created.sponsorCode;
        // The legacy Airtable Holder row set AuthStatus=Active so the
        // deprecated email+code verify path still recognized it. The
        // createSponsorship helper doesn&rsquo;t take authStatus directly;
        // patch it in a follow-up. Non-fatal on failure &mdash; the magic-
        // link sign-in path doesn&rsquo;t check authStatus.
        try {
          const { db } = await import('@/lib/db/client');
          const { sponsorships } = await import('@/lib/db/schema');
          const { eq } = await import('drizzle-orm');
          await db
            .update(sponsorships)
            .set({ authStatus: 'Active', updatedAt: new Date() })
            .where(eq(sponsorships.id, created.id));
        } catch (patchErr) {
          console.warn(
            '[Recovery] Holder authStatus patch failed (non-fatal):',
            patchErr
          );
        }
        console.log(
          '[Recovery] Created Holder sponsorship:',
          sponsorCode,
          'for',
          email
        );
      } catch (err) {
        // Holder creation failed (DB error, FK violation, etc.). Log
        // and return privacy success so the user sees the expected
        // "check your email" path; the failure surfaces in Vercel
        // logs for Kevin to act on.
        console.error(
          `[Recovery] Could not create Holder row for ${email} on #${shirtNumber}:`,
          err
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
