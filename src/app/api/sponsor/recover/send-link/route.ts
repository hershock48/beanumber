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
 *      If the email already has a CHILDLESS sponsorship (created at
 *      checkout by the cart+monthly / Shirt + Stay flows with the
 *      child link deliberately blank), the claim BINDS that row to
 *      this kid instead of creating a duplicate Holder — the buyer's
 *      status, monthly amount, and Stripe sub stay on one row.
 *
 *      If someone else has already claimed this number, the response
 *      carries `code: 'number_claimed'` so the UI can say so instead
 *      of promising an email that will never arrive. The claim
 *      attempt is logged for admin review.
 *
 *      SECOND-CLAIM GUARD (2026-10-28). If this email ALREADY holds a
 *      different number and has no fulfillment whose order_number is
 *      the typed number, nothing is minted. Instead the email gets a
 *      confirmation: a sign-in button for the number they hold, and
 *      a signed "yes, claim #N too" button that lands on
 *      /api/sponsor/recover/confirm-claim and mints the Holder row
 *      only then. Why: on 2026-09-23 a sponsor holding #230 typed a
 *      number by mistake and the site minted a second Holder row on
 *      #260 for her email with no purchase behind it. That row sent
 *      email-only sign-in to the wrong kid and would have blocked the
 *      real holder of #260. Gift shirts, a spouse's email, found
 *      shirts, and pre-cutover buyers hold nothing yet, so the guard
 *      never fires for them; a second shirt with a stamped
 *      fulfillment goes straight through; a second shirt without one
 *      costs one tap from the inbox. Decision logic lives in
 *      src/lib/claim-guard.ts, the write in src/lib/claim-number.ts.
 *
 * Privacy: the endpoint returns `{ success: true }` for every branch
 * that involves an EMAIL lookup (sign-in, claim, no-account), so it
 * can't be used as an email-enumeration oracle. The one deliberate
 * exception is `number_claimed` above — it reveals only that a shirt
 * number is taken (something the person holding the shirt can already
 * infer) and leaks no email, name, or account detail.
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
import { getEmailConfig } from '@/lib/env';
import { makeClaimConfirmToken, makeRecoveryToken } from '@/lib/recovery-tokens';
import {
  findSponsorshipForEmailAndChild,
  findSponsorshipForEmailAndClaimedNumber,
  getMostRecentSponsorshipForEmail,
  getPurchasesForEmail,
  getViewerSponsorships,
  isNumberClaimedByOtherEmail,
} from '@/lib/db/queries';
import { resolveShirtNumberForClaim } from '@/lib/claim-resolve';
import { materializeHolderSponsorshipsForBuyer } from '@/lib/db/mutations';
import { decideSecondClaim } from '@/lib/claim-guard';
import { bindOrCreateHolderClaim } from '@/lib/claim-number';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

const schema = z.object({
  email: z.string().email(),
  // shirtNumber is OPTIONAL. If supplied, we sign in / claim for that
  // specific number. If not, we look up the email's most recent active
  // Sponsorship and send the magic link for that one — making sign-in
  // frictionless for returning sponsors who don't have their shirt
  // number handy on a new device.
  shirtNumber: z.number().int().positive().optional(),
  // 'sponsor' when the visitor pressed the $25/mo button on a kid
  // page while anonymous. Carried onto the callback URL (as a plain
  // query param — it's routing sugar, not an entitlement; the
  // checkout API still enforces its own session gate) so the click
  // lands them back on the kid page with checkout auto-starting
  // instead of signed in and hunting for the button they already
  // pressed. Main conversion funnel (Kevin, 2026-08-02).
  intent: z.enum(['sponsor']).optional(),
});

// In-memory throttle: one link per (lowercased email) per 20 seconds.
// Scoped per lambda instance, which is imperfect on Vercel but good
// enough for the actual threat (a user hammering the resend button
// while their inbox catches up). A determined attacker could still
// spread requests across instances, but the endpoint returns the same
// {success:true} response either way and the throttle is UX polish,
// not security. Move to Redis when we can justify the dependency.
const RESEND_WINDOW_MS = 20 * 1000;
const recentSends = new Map<string, number>();
/**
 * Peek-only throttle check. Deliberately does NOT record a send —
 * that's markSend()'s job, called only on branches that actually
 * dispatch an email. The old combined check-and-record meant a
 * request that sent NOTHING (number claimed by someone else, no
 * matching sponsorship, validation dead ends) still armed the
 * 20-second window, so a user who mistyped their shirt number and
 * corrected it seconds later got a silent no-op and a "check your
 * email" for an email that was never going to come.
 */
function isThrottled(emailLower: string): boolean {
  const last = recentSends.get(emailLower);
  return Boolean(last && Date.now() - last < RESEND_WINDOW_MS);
}
function markSend(emailLower: string): void {
  const now = Date.now();
  // Reap old entries opportunistically so the Map doesn't grow forever.
  if (recentSends.size > 500) {
    for (const [k, ts] of recentSends) {
      if (now - ts > RESEND_WINDOW_MS) recentSends.delete(k);
    }
  }
  recentSends.set(emailLower, now);
}

/**
 * The second-claim confirmation email. Two buttons: sign in to the
 * number this email already holds (the typo case, one tap to the
 * right place), or confirm that the typed number is a second shirt
 * (signed claim token; the row is minted only when it is tapped).
 * Nothing is written before the tap. Returns after the send; a send
 * failure is logged with the same ATTENTION tag as the other paths.
 */
async function sendSecondClaimConfirmEmail(args: {
  email: string;
  typedNumber: number;
  heldNumbers: number[];
}): Promise<void> {
  const { email, typedNumber, heldNumbers } = args;
  const emailLower = email.toLowerCase();

  // Sign-in target: the same row email-only sign-in would pick, so
  // the two paths agree on where "your number" lands.
  const held = await getMostRecentSponsorshipForEmail(email);
  if (!held?.sponsorCode) {
    // heldNumbers was non-empty, so a row exists; this only happens
    // if the two queries disagree. Log and bail rather than send a
    // sign-in button that bounces.
    console.error(
      `[Recovery] ATTENTION second-claim guard: no sign-in row for ${email} although it holds #${heldNumbers.join(', #')}.`
    );
    return;
  }
  const heldNumber =
    typeof held.shirtNumber === 'number' && held.shirtNumber > 0
      ? held.shirtNumber
      : heldNumbers[0];

  let signInUrl: string;
  let confirmUrl: string;
  try {
    const signInToken = makeRecoveryToken(held.sponsorCode, heldNumber);
    const confirmToken = makeClaimConfirmToken(email, typedNumber);
    signInUrl = `${SITE_URL}/api/sponsor/recover/callback?t=${encodeURIComponent(signInToken)}`;
    confirmUrl = `${SITE_URL}/api/sponsor/recover/confirm-claim?t=${encodeURIComponent(confirmToken)}`;
  } catch (err) {
    console.error(
      `[Recovery] ATTENTION second-claim token gen FAILED for ${email} #${typedNumber}:`,
      err
    );
    return;
  }

  const heldLabel =
    heldNumbers.length > 1
      ? `#${heldNumbers.slice(0, -1).join(', #')} and #${heldNumbers[heldNumbers.length - 1]}`
      : `#${heldNumber}`;
  const heldKid = held.firstName ? ` (${held.firstName}&rsquo;s number)` : '';
  const signInLabel = `Sign in to #${heldNumber}`;
  const fromEmail = getEmailConfig().fromEmail;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
        <p style="margin-top: 0;">Hey there,</p>
        <p>You asked to claim #${typedNumber}, but this email already holds ${heldLabel}${heldKid}. Most of the time that means a mistyped number, so we held off on claiming #${typedNumber}.</p>
        <p>If you were signing in, tap this and you&rsquo;ll land on your page.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${signInUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase;">
            ${signInLabel}
          </a>
        </p>
        <p>If #${typedNumber} is on a second shirt, tap this instead and it becomes yours too.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${confirmUrl}" style="display: inline-block; background: #ffffff; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 13px 31px; font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase; border: 1px solid #0d0d0d;">
            Yes, claim #${typedNumber}
          </a>
        </p>
        <p style="color: #888; font-size: 13px;">
          Both links are good for 24 hours. If you didn&rsquo;t request this, ignore it and nothing changes.
        </p>
        <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 24px 0;">
        <p style="font-size: 12px; color: #999; line-height: 1.5;">
          Be A Number, International<br>
          <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a>
        </p>
      </body>
    </html>
  `;
  console.log(
    `[Recovery] second-claim confirm send: to=${email} typed=#${typedNumber} held=#${heldNumber} from=${fromEmail}`
  );
  markSend(emailLower);
  const result = await sendEmail({
    to: { email, name: '' },
    from: { email: fromEmail, name: 'Be A Number' },
    subject: `Before we claim #${typedNumber}`,
    html,
  });
  if (!result.success) {
    console.error(
      `[Recovery] ATTENTION second-claim confirm send FAILED for ${email} #${typedNumber}: ${result.error}`
    );
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
    // Trim + lowercase-normalize before anything else. Mobile
    // autofill and copy-paste routinely append trailing whitespace,
    // and zod's .email() accepts it silently. Every DB lookup below
    // compares against lower(sponsor_email), so untrimmed input
    // would silently miss a real sponsorship. Same for the send:
    // an email with a trailing space is a different SMTP address.
    const email = parsed.data.email.trim();
    const shirtNumber = parsed.data.shirtNumber;
    // Appended to callback URLs below; '' when absent so template
    // strings stay clean.
    const intentSuffix =
      parsed.data.intent === 'sponsor' ? '&intent=sponsor' : '';
    console.log(
      `[Recovery] request: email=<${email}> shirtNumber=${shirtNumber ?? 'none'}`
    );

    // Throttle before any DB work. Silent success on throttle so the
    // client-side UX still shows "check your email" — the previous
    // send should be arriving. Client also has a cooldown timer on
    // the resend button; this is belt-and-suspenders.
    if (isThrottled(email.toLowerCase())) {
      console.log(`[Recovery] Throttled resend for ${email}`);
      return NextResponse.json(responseShape);
    }

    // EMAIL-ONLY SIGN-IN: no shirt number supplied. Look up the
    // email's most recent active Sponsorship and mint a link for it.
    // This is the returning-sponsor-on-a-new-device path — they don't
    // need to remember which number is theirs.
    if (!shirtNumber) {
      let found = await getMostRecentSponsorshipForEmail(email);
      // SELF-HEAL for pre-cutover buyers (Randi James et al.): if
      // the email has no sponsorship but DOES have a fulfillment row
      // in Postgres, the buyer got orphaned by the Airtable → Postgres
      // webhook cutover and never got a sponsorship written. Create a
      // Holder row on the fly (linked to the kid whose shirt they got
      // if the order_number is set; childless placeholder otherwise)
      // and retry. Subsequent sign-ins hit the fast path directly.
      if (!found) {
        try {
          const materialized = await materializeHolderSponsorshipsForBuyer(email);
          if (materialized.created.length > 0) {
            console.log(
              `[Recovery] Self-healed ${materialized.created.length} orphaned Holder row(s) for ${email}:`,
              materialized.created.map(c => c.sponsorCode).join(', ')
            );
            found = await getMostRecentSponsorshipForEmail(email);
          }
        } catch (err) {
          console.error(
            `[Recovery] Self-heal materialization failed for ${email}:`,
            err
          );
        }
      }
      if (!found) {
        // No existing sponsorship AND no fulfillment we could
        // materialize from. Return privacy success so we don't leak
        // whether an email is in the system.
        console.log(
          `[Recovery] No sponsorship or fulfillment for ${email} (email-only); nothing to send.`
        );
        return NextResponse.json(responseShape);
      }
      // We have a valid sponsor — build the link directly. Skip the
      // child-lookup + create-Holder paths below since we already have
      // sponsorCode + shirtNumber (which may be null for a childless
      // holder; makeRecoveryToken normalizes null → 0 sentinel and
      // the callback lands them on /me).
      let token: string;
      try {
        token = makeRecoveryToken(found.sponsorCode, found.shirtNumber);
      } catch (err) {
        // makeRecoveryToken throws when CRON_SECRET is missing. If that
        // env var ever drops out of Vercel, every sign-in silently
        // fails. ATTENTION-tag so it&rsquo;s greppable alongside the
        // send-failure logs below.
        console.error(
          `[Recovery] ATTENTION email-only token gen FAILED for ${email}:`,
          err
        );
        return NextResponse.json(responseShape);
      }
      try {
        // token is now guaranteed set above; keeping try/catch below
        // for the send + HTML build.
        const callbackUrl = `${SITE_URL}/api/sponsor/recover/callback?t=${encodeURIComponent(token)}${intentSuffix}`;
        // Use the same FROM address the working transactional emails
        // (shirt-order confirmations, sponsor welcome, etc.) use. The
        // previous hardcoded fallback of 'Kevin@beanumber.org' meant
        // that if Kevin's Gmail Workspace didn't have that exact
        // capitalization / Send-As identity configured, the Gmail API
        // would accept the send but the recipient&rsquo;s inbox would
        // silently drop it as unauthenticated. Diagnosed 2026-07-16
        // after Ashley + Randi reported never receiving links while
        // the same account was successfully sending Thank You emails
        // to the same recipients hours apart.
        //
        // getEmailConfig().fromEmail IS that working chain
        // (GMAIL_FROM_EMAIL || SENDGRID_FROM_EMAIL || 'info@beanumber.org').
        // Reading it from one place instead of re-deriving the env
        // chain here means this endpoint can never drift from the
        // paths that are known to deliver.
        const fromEmail = getEmailConfig().fromEmail;
        console.log(
          `[Recovery] email-only send: to=${email} from=${fromEmail}`
        );
        // Body copy varies slightly by whether we can name the kid.
        // Childless holders (no shirt reconciled yet) land on /me,
        // so the message can't promise "you'll land on {Kid}'s page."
        const hasNumber =
          typeof found.shirtNumber === 'number' && found.shirtNumber > 0;
        const hasKid = hasNumber && found.firstName;
        // Nav link is 'My Campus' — was renamed from 'Your kids' on
        // 2026-07-06. Stale copy referring to 'Your kids' in the nav
        // meant users clicked the email, landed on the site, then
        // couldn't find the surface the email pointed them at.
        //
        // Three states, not two: a cycle-number holder (#54+) has a
        // real number but no children row to name the kid from —
        // they get the your-kid phrasing, NOT the shirt-is-being-
        // prepared copy (their shirt arrived; that's how they
        // claimed).
        const bodyLine = hasKid
          ? `Tap the button below to sign in. You&rsquo;ll land on ${found.firstName}&rsquo;s page. From there, the &ldquo;My Campus&rdquo; link in the nav has every kid you sponsor or hold.`
          : hasNumber
          ? `Tap the button below to sign in. You&rsquo;ll land on your kid&rsquo;s page &mdash; #${found.shirtNumber} is yours. From there, the &ldquo;My Campus&rdquo; link in the nav has every kid you sponsor or hold.`
          : `Tap the button below to sign in. Your shirt is being prepared &mdash; once your Number is stamped and shipped, the kid it belongs to will show up on your My Campus page.`;
        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
              <p style="margin-top: 0;">Hey there,</p>
              <p>${bodyLine}</p>
              <p style="text-align: center; margin: 28px 0;">
                <a href="${callbackUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase;">
                  Sign in
                </a>
              </p>
              <p style="color: #888; font-size: 13px;">
                This device will remember you &mdash; no need to use
                this link again unless you change devices or clear
                cookies. Link is good for 24 hours.
              </p>
              <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 24px 0;">
              <p style="font-size: 12px; color: #999; line-height: 1.5;">
                Be A Number, International<br>
                <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a>
              </p>
            </body>
          </html>
        `;
        markSend(email.toLowerCase());
        const sendResult = await sendEmail({
          to: { email, name: '' },
          from: { email: fromEmail, name: 'Be A Number' },
          subject: `Your sign-in link`,
          html,
        });
        // sendEmailViaGmail returns { success:false, error } instead
        // of throwing when the API rejects — Gmail refresh-token expiry
        // (invalid_grant) is the classic silent-failure mode here.
        // Historically the endpoint awaited this call without inspecting
        // the return value, so a dead OAuth token meant zero users got
        // magic links while the endpoint kept responding {success:true}.
        // Log loudly so it shows up in Vercel logs, and prefix with a
        // greppable ATTENTION tag so the failure isn&rsquo;t buried in
        // routine chatter.
        if (!sendResult.success) {
          console.error(
            `[Recovery] ATTENTION email-only send FAILED for ${email}: ${sendResult.error}`
          );
        }
      } catch (err) {
        console.error(
          `[Recovery] ATTENTION email-only path threw for ${email}:`,
          err
        );
      }
      return NextResponse.json(responseShape);
    }

    // 1. Resolve the NUMBER to a claim identity. Canonical numbers
    // (≤53) resolve to their real children row; cycle numbers (54+)
    // resolve through the same Batches math the kid page uses, with
    // a synthetic per-number legacy id and NO row UUID. This used to
    // be a bare getChildByShirtNumber() call, which meant every
    // number past the canonical roster silently no-op'd — Postgres
    // has no rows for them.
    const identity = await resolveShirtNumberForClaim(shirtNumber);
    if (!identity) {
      console.log(`[Recovery] No kid resolves for #${shirtNumber}; nothing to send.`);
      return NextResponse.json(responseShape);
    }
    if (identity.reservedForAuction) {
      console.log(`[Recovery] #${shirtNumber} is reserved; nothing to send.`);
      return NextResponse.json(responseShape);
    }
    const { firstName } = identity;
    const childContext = {
      id: identity.childUuid ?? '',
      childId: identity.childIdLegacy,
    };

    // 2. SIGN-IN PATH: do they already own this number? Check the
    // per-number column first (authoritative), then the child-
    // identity match (covers rows claimed before the 0017 backfill
    // and the canonical-number rows whose identity IS the kid).
    const existing =
      (await findSponsorshipForEmailAndClaimedNumber(email, shirtNumber)) ??
      (await findSponsorshipForEmailAndChild(email, childContext));
    let sponsorCode = existing?.sponsorCode ?? null;
    let isFreshClaim = false;

    // 3. FIRST-TIME CLAIM PATH: no existing row for this email + kid.
    //    Order matters here:
    //      3a. Blocked — someone ELSE already claimed this number.
    //      3b. Guard: this email already holds a DIFFERENT number
    //          and nothing ties the typed one to a purchase; send a
    //          confirmation email, mint nothing.
    //      3c. Write: bind a childless checkout row to the kid, or
    //          mint a Holder row (src/lib/claim-number.ts).
    if (!sponsorCode) {
      // Per-NUMBER claim check (migration 0017). The old per-kid
      // check fired on legitimate claims whenever the kid had
      // co-sponsors — multiple sponsors per kid is the model working
      // as designed; only the NUMBER is exclusive. The synthetic
      // legacy id is passed for cycle numbers only (see the query's
      // doc comment for why canonical numbers must not match on it).
      const alreadyTaken = await isNumberClaimedByOtherEmail(
        shirtNumber,
        identity.childUuid ? null : identity.childIdLegacy,
        email
      );
      if (alreadyTaken) {
        // 3a. Deliberately NOT the silent privacy response. A shirt
        // number is printed on a physical object — the person typing
        // it is holding the shirt, and "check your email" followed by
        // an email that never comes was our single worst dead end
        // (typo'd purchase email, spouse's email, gift shirts). The
        // enumeration surface this opens is "is number N claimed,"
        // which the claimer can already infer, and it leaks no email
        // or name. Logged for admin review either way.
        console.log(
          `[Recovery] #${shirtNumber} is already claimed by someone else; ` +
            `blocked claim attempt by ${email} (surfaced to user).`
        );
        return NextResponse.json({ success: true, code: 'number_claimed' });
      }

      // 3b. SECOND-CLAIM GUARD. Does this email already hold a
      // different number? heldNumbers is claimed_shirt_number only:
      // co-sponsor rows added via /meet carry NULL there, and holding
      // a relationship is not holding a number. The purchase trail is
      // fulfillments.order_number under this email; NULL rows are
      // unreconciled shirts and prove nothing about which number.
      const [viewerRows, purchases] = await Promise.all([
        getViewerSponsorships(email),
        getPurchasesForEmail(email),
      ]);
      const heldNumbers = viewerRows
        .map(r => r.claimedShirtNumber)
        .filter((n): n is number => typeof n === 'number' && n > 0);
      const decision = decideSecondClaim({
        typedNumber: shirtNumber,
        heldNumbers,
        fulfillmentNumbers: purchases.map(p => p.orderNumber),
        confirmed: false,
      });
      if (decision.outcome === 'confirm') {
        // Logged with the ATTENTION tag so Kevin can grep Vercel logs
        // for every held-off claim and see whether it was a typo or a
        // real second shirt (the confirm-claim route logs the tap).
        console.warn(
          `[Recovery] ATTENTION second-claim guard: ${email} typed #${shirtNumber} ` +
            `but already holds #${heldNumbers.join(', #')} and has no fulfillment ` +
            `with order_number=${shirtNumber}; sent confirm email, minted nothing.`
        );
        await sendSecondClaimConfirmEmail({
          email,
          typedNumber: shirtNumber,
          heldNumbers,
        });
        return NextResponse.json(responseShape);
      }
      if (decision.reason === 'purchase_trail') {
        console.log(
          `[Recovery] second-claim guard passed on purchase trail: ${email} holds #${heldNumbers.join(', #')}, fulfillment order_number=${shirtNumber} found.`
        );
      }

      // 3c. WRITE. Bind a childless checkout row or mint a Holder.
      try {
        const written = await bindOrCreateHolderClaim(email, identity);
        sponsorCode = written.sponsorCode;
        isFreshClaim = true;
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
    }

    // 4. Build + send the magic-link email.
    let token: string;
    try {
      token = makeRecoveryToken(sponsorCode, shirtNumber);
    } catch (err) {
      // Missing CRON_SECRET or other signing failure. ATTENTION-tag
      // so Vercel logs surface it alongside the send-failure logs.
      console.error(
        `[Recovery] ATTENTION claim-path token gen FAILED for ${email} #${shirtNumber}:`,
        err
      );
      return NextResponse.json(responseShape);
    }
    const callbackUrl = `${SITE_URL}/api/sponsor/recover/callback?t=${encodeURIComponent(token)}${intentSuffix}`;

    // Same FROM alignment as the email-only branch above — one source
    // of truth via getEmailConfig(), matching the transactional paths
    // that are known to deliver.
    const fromEmail = getEmailConfig().fromEmail;
    console.log(
      `[Recovery] claim-path send: to=${email} #${shirtNumber} from=${fromEmail}`
    );
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
          this device will remember you.</p>`
      : `<p>Tap the button below to sign in and open
          ${firstName}&rsquo;s page on
          <a href="https://www.beanumber.org" style="color: #D4A843; font-weight: bold;">beanumber.org</a>.
          This device will remember you &mdash; you won&rsquo;t need
          the link again unless you change devices or clear your
          cookies.</p>`;

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
            This link is good for 24 hours. If you didn&rsquo;t request it, you can ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 24px 0;">
          <p style="font-size: 12px; color: #999; line-height: 1.5;">
            Be A Number, International<br>
            <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a>
          </p>
        </body>
      </html>
    `;

    markSend(email.toLowerCase());
    const result = await sendEmail({
      to: { email, name: '' },
      from: { email: fromEmail, name: 'Be A Number' },
      subject,
      html,
    });
    // Same greppable ATTENTION tag as the email-only branch above so
    // Kevin can filter Vercel logs on one string to catch every
    // silent-failure send.
    if (!result.success) {
      console.error(
        `[Recovery] ATTENTION claim-path send FAILED for ${email} on #${shirtNumber}: ${result.error}`
      );
    }

    return NextResponse.json(responseShape);
  } catch (err: any) {
    console.error('[Recovery] send-link error:', err);
    return NextResponse.json(responseShape);
  }
}
