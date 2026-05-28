/**
 * Drip Nurture Cron Job
 *
 * GET /api/cron/drip
 *
 * Runs daily. Finds Donors with DripNextSend <= today and sends the next
 * email in their assigned pipeline. Currently supports:
 *
 *   - shirt_nurture: 4 follow-up emails (emails 2–5) over ~30 days for
 *     shirt-only buyers, nudging them toward monthly sponsorship.
 *
 * Enrollment happens in the Stripe webhook (shirt-only branch). The webhook
 * sets DripPipeline, DripStage=0, DripNextSend, DripChildName, DripShirtNumber.
 * This cron picks it up from there.
 *
 * When a buyer converts to a monthly sponsor (subscription created), the
 * webhook clears the drip fields so they stop receiving nurture emails.
 *
 * Secured by CRON_SECRET (same as other cron endpoints).
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

// ── Constants ────────────────────────────────────────────────────────────────

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY = process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const DONORS_TABLE = 'tblhuLpJgYLB0pTjx';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

function getHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

const SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';

// ── Sponsor code lookup ─────────────────────────────────────────────────────

async function getSponsorCode(email: string): Promise<string | null> {
  const formula = encodeURIComponent(
    `AND({SponsorEmail}="${email}",{AuthStatus}="Active")`
  );
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SPONSORSHIPS_TABLE}?filterByFormula=${formula}&maxRecords=1&fields%5B%5D=SponsorCode`;

  try {
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    return data.records?.[0]?.fields?.SponsorCode || null;
  } catch {
    return null;
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function validateCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== 'production';

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7) === cronSecret;

  const { searchParams } = new URL(request.url);
  return searchParams.get('secret') === cronSecret;
}

// ── Pipeline configurations ──────────────────────────────────────────────────
//
// shirt_nurture (4 emails, ~34 days):
//   Stage 0 → Day 10: "Did it arrive?" (by now they should have it)
//   Stage 1 → Day 16: "Enter your number"
//   Stage 2 → Day 24: "Here's what happened" + conversion ask
//   Stage 3 → Day 34: "Last one from me" + final nudge
//
// sponsor_onboard (3 emails, ~21 days):
//   Stage 0 → Day 3:  "Here's your portal" — login + meet your child
//   Stage 1 → Day 10: "Your first update is coming" — set expectations
//   Stage 2 → Day 21: "You've been here a month" — celebrate, impact
//
// donor_convert (3 emails, ~25 days):
//   Stage 0 → Day 5:  "Here's what your donation did" — specific impact
//   Stage 1 → Day 14: "Meet the kids" — introduce sponsorship model
//   Stage 2 → Day 25: "Last one from me" — final respectful nudge
//
// shirt_sponsor (4 emails, ~32 days):
//   Stage 0 → Day 10: "Did it arrive?" — arrival check + teases reveal
//   Stage 1 → Day 15: "Meet your child" — reveal + sponsor code + portal
//   Stage 2 → Day 22: "What your first month did" — impact, updates coming
//   Stage 3 → Day 32: "Thank you for staying" — celebrate, tell one friend
//
// monthly_donor (3 emails, ~22 days):
//   Stage 0 → Day 3:  "Thank you for going monthly" — impact, what $X/mo does
//   Stage 1 → Day 12: "Inside the campus" — how it works, meet the kids
//   Stage 2 → Day 22: "Something I want to show you" — gentle intro to sponsorship

type PipelineConfig = { gaps: number[]; maxStages: number };

const PIPELINE_CONFIGS: Record<string, PipelineConfig> = {
  shirt_nurture:    { gaps: [6, 6, 8, 10], maxStages: 4 },
  sponsor_onboard:  { gaps: [3, 7, 11],    maxStages: 3 },
  donor_convert:    { gaps: [5, 9, 11],    maxStages: 3 },
  shirt_sponsor:    { gaps: [3, 5, 7, 10], maxStages: 4 },
  monthly_donor:    { gaps: [3, 9, 10],    maxStages: 3 },
};

type DripDonor = {
  recordId: string;
  email: string;
  firstName: string;
  pipeline: string;
  dripStage: number;
  childName: string;       // may be comma-separated for multi-shirt orders
  shirtNumber: string;     // may be comma-separated for multi-shirt orders
};

// Helpers for multi-shirt handling
function parseShirtNumbers(raw: string): number[] {
  return String(raw).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}
function parseChildNames(raw: string): string[] {
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}
function isMultiShirt(donor: DripDonor): boolean {
  return parseShirtNumbers(donor.shirtNumber).length > 1;
}
function multiChildBlock(numbers: number[], names: string[]): string {
  return numbers.map((n, i) => {
    const name = names[i] || '';
    const url = `${SITE_URL}/children/${n}`;
    return name
      ? `<a href="${url}" style="color: #D4A843; font-weight: bold;">#${n} &rarr; ${name}</a>`
      : `<a href="${url}" style="color: #D4A843; font-weight: bold;">#${n}</a>`;
  }).join('<br>');
}

// ── Email templates ──────────────────────────────────────────────────────────

// Shared email wrapper
function wrapEmail(body: string) {
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
    ${body}
    <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">
    <p style="font-size: 12px; color: #999; line-height: 1.5;">
      Be A Number, International<br>
      <a href="${SITE_URL}" style="color: #D4A843;">beanumber.org</a> &nbsp;&middot;&nbsp;
      <a href="mailto:Kevin@beanumber.org" style="color: #D4A843;">Kevin@beanumber.org</a>
    </p>
  </body>
</html>`;
}

function shirtNurtureEmail(
  stage: number,
  donor: DripDonor
): { subject: string; html: string } | null {
  const { firstName, shirtNumber } = donor;
  // Stockpile model: never name a specific child or quote a specific
  // shirt number in any of these emails. The buyer-to-child match
  // happens when the buyer reads the number off the back of their
  // shirt and visits beanumber.org/[number] — we don't pre-assign at
  // checkout anymore, so we don't write the match as if we know it.
  // `multi` is still useful for grammar ("your shirts" vs "your shirt"),
  // since the buyer literally has more than one physical shirt — but
  // we don't list the numbers.
  const numbers = parseShirtNumbers(shirtNumber);
  const multi = numbers.length > 1;
  const sponsorUrl = `${SITE_URL}/sponsorship`;

  switch (stage) {
    // ── Email 1: Did it arrive? (Day ~10) ───────────────────────────────
    case 0:
      return {
        subject: multi ? "Did your shirts arrive?" : "Did your shirt arrive?",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          ${multi
            ? `<p>You ordered ${numbers.length} shirts, and I wanted to check if they made it. I make each one by hand (screen press, ink, the whole thing), so they were all made specifically for you.</p>
               <p>Each shirt has a different number pressed on the back, and each number belongs to a different child at our campus in Northern Uganda. Flip each shirt over, read the number, and visit <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a> to meet the kid behind it.</p>`
            : `<p>I wanted to check in and see if your shirt made it. I make each one by hand (screen press, ink, the whole thing), so it was made specifically for you.</p>
               <p>When you get it, look at the back. There&rsquo;s a number pressed below the main design, and that number belongs to a real child at our campus in Northern Uganda. Go to <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a>, enter the number from the back of your shirt, and meet them.</p>`
          }
          <p style="text-align: center; margin: 24px 0;">
            <a href="${SITE_URL}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">ENTER YOUR ${multi ? 'NUMBERS' : 'NUMBER'}</a>
          </p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: Nudge to enter number (Day ~16) ─────────────────────────
    case 1:
      return {
        subject: multi
          ? "Have you met your kids yet?"
          : "Have you met your child yet?",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          ${multi
            ? `<p>Each of your ${numbers.length} shirts is connected to a different child at the campus. The number on the back of each shirt is the key — enter it at <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a> and you meet the kid it belongs to.</p>
               <p style="text-align: center; margin: 24px 0;">
                 <a href="${SITE_URL}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">ENTER YOUR NUMBERS</a>
               </p>`
            : `<p>If you&rsquo;ve had a chance to read the number off the back of your shirt, you already know who your shirt is connected to. If not, no rush at all, but when you&rsquo;re ready:</p>
               <p style="text-align: center; margin: 24px 0;">
                 <a href="${SITE_URL}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">ENTER YOUR NUMBER</a>
               </p>`
          }
          <p>Kevin</p>
        `),
      };

    // ── Email 3: How sponsorship works (Day ~22) ─────────────────────────
    case 2:
      return {
        subject: multi
          ? "About the kids behind your shirts"
          : "About the kid behind your shirt",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          ${multi
            ? `<p>Your shirts are connected to ${numbers.length} different children at the campus. Each one has a name, a classroom, and a teacher who knows them by it.</p>`
            : `<p>The number on the back of your shirt is connected to a real kid at our campus in Northern Uganda. They have a name, a classroom, and a teacher who knows them by it.</p>`
          }
          <p>Right now, $25 a month supports school fees, two meals a day, and medical care at the campus. That&rsquo;s what sponsorship supports, and it starts the day you sign up. If you sponsor, you get a direct connection to ${multi ? 'the kid you pick' : 'the kid your shirt&rsquo;s number belongs to'}: letters, photos, report cards, and a place to write to them whenever you want.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">SPONSOR FOR $25/MO</a>
          </p>
          <p>Kevin</p>
        `),
      };

    // ── Email 4: Last email (Day ~30) ────────────────────────────────────
    case 3:
      return {
        subject: "Last email from me about this",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>This is the last email I&rsquo;ll send you about this, and I&rsquo;ll keep it short.</p>
          <p>The shirts are how most people find us, and sponsorship is how we keep the campus running. $25 a month supports school fees, two meals a day, and medical care at the campus, and the sponsor gets letters, photos, and a real relationship with the kid their shirt&rsquo;s number belongs to.</p>
          <p>If you want in, you can <a href="${sponsorUrl}" style="color: #D4A843; font-weight: bold;">start a sponsorship here</a>. And if not, wear that shirt with pride. You can always come back later.</p>
          <p>Kevin</p>
        `),
      };

    default:
      return null;
  }
}

// ── Sponsor onboard emails ──────────────────────────────────────────────────

function sponsorOnboardEmail(
  stage: number,
  donor: DripDonor,
  sponsorCode?: string | null
): { subject: string; html: string } | null {
  const { firstName, childName, shirtNumber } = donor;
  const numbers = parseShirtNumbers(shirtNumber);
  const names = parseChildNames(childName);
  const firstNumber = numbers[0];
  const firstName_ = names[0] || '';
  // Use first child's page for direct links; sponsor_onboard is always single-sponsor
  const childUrl = firstNumber ? `${SITE_URL}/children/${firstNumber}` : SITE_URL;
  const portalUrl = `${SITE_URL}/sponsor/login`;
  // For display, use the parsed first name rather than raw (may be comma-separated)
  const displayChildName = firstName_ || childName;

  switch (stage) {
    // ── Email 1: Portal access (Day ~3) ──────────────────────────────────
    case 0:
      return {
        subject: "Your sponsorship is active",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Your sponsorship is active, and I wanted to make sure you have everything you need to get started.</p>
          ${displayChildName
            ? `<p>Your $25 a month supports school fees, two meals a day, and medical care at the YDO campus where ${displayChildName} goes to school. <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">Here&rsquo;s their page.</a> For a lot of the kids on campus, those meals are the only ones they get all day, so this matters starting right now.</p>`
            : `<p>Your $25 a month supports school fees, two meals a day, and medical care at the YDO campus where your matched child goes to school. For a lot of the kids on campus, those meals are the only ones they get all day, so this matters starting right now.</p>`
          }
          <p>I built a sponsor portal where you can see updates, photos, and letters as they come in from the campus. To log in, you&rsquo;ll need your email and your sponsor code:</p>
          ${sponsorCode
            ? `<div style="background: #FFF8F0; border: 1px solid #e8e0d4; padding: 16px 20px; margin: 16px 0; text-align: center;">
                <p style="color: #999; font-size: 13px; margin: 0 0 4px 0;">Your sponsor code</p>
                <p style="font-size: 22px; color: #0d0d0d; margin: 0; font-weight: bold; letter-spacing: 0.1em; font-family: monospace;">${sponsorCode}</p>
              </div>`
            : `<p style="color: #666; font-size: 14px;">(Your sponsor code was in your confirmation email. If you can&rsquo;t find it, reply to this email and I&rsquo;ll get it to you.)</p>`
          }
          <p style="text-align: center; margin: 24px 0;">
            <a href="${portalUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">LOG IN TO YOUR PORTAL</a>
          </p>
          <p>If you ever want to write to ${displayChildName || 'your child'}, you can do it through the portal or by replying to this email. The YDO team on the ground handles delivery and translation.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: What to expect (Day ~10) ────────────────────────────────
    case 1:
      return {
        subject: "What to expect over the next few weeks",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Just wanted to give you a heads up on what to expect over the next few weeks.</p>
          <p>The YDO team on the ground in Uganda sends regular updates from the campus. ${displayChildName ? `You&rsquo;ll hear about ${displayChildName} specifically` : 'You&rsquo;ll hear about your child specifically'}: what they&rsquo;re studying, how they&rsquo;re doing in class, sometimes a photo or a handwritten letter. Those updates show up in your portal and by email, and the first one usually comes within your first month.</p>
          <p>If you want to write to ${displayChildName || 'your child'} yourself, go for it. You can do it through the portal or reply to any email. The YDO team reads every note, translates when needed, and makes sure it actually gets to them.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: One month (Day ~21) ─────────────────────────────────────
    case 2:
      return {
        subject: "Checking in after your first month",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>You&rsquo;ve been sponsoring for about a month now, so I just wanted to check in and let you know what your $25 supported this month: ${displayChildName ? `${displayChildName} went` : 'your child went'} to school every day, ate breakfast and lunch at the campus every day, and had a nurse available whenever they needed one. Same thing will happen next month because you&rsquo;re still here.</p>
          <p>One thing that really helps us grow: if you know someone who&rsquo;d be into what we do, send them a quick text. It doesn&rsquo;t need to be a whole thing, something like &ldquo;I sponsor a kid in Uganda through this org called Be A Number, you should check it out.&rdquo; That&rsquo;s genuinely how most of our sponsors find us.</p>
          <p>Your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">portal</a> has the latest updates whenever you want to check in.</p>
          <p>Kevin</p>
        `),
      };

    default:
      return null;
  }
}

// ── Donor conversion emails ─────────────────────────────────────────────────

function donorConvertEmail(
  stage: number,
  donor: DripDonor
): { subject: string; html: string } | null {
  const { firstName } = donor;
  const sponsorUrl = `${SITE_URL}/sponsorship`;

  switch (stage) {
    // ── Email 1: Where the donation went (Day ~5) ────────────────────────
    case 0:
      return {
        subject: "Following up on your donation",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I wanted to follow up and let you know where your donation actually went, because I think that matters.</p>
          <p>It went to the YDO campus in Northern Uganda. One campus, one team on the ground. The budget supports school fees, meals, and medical care for the children there &mdash; you can know any of them by name. We&rsquo;re small on purpose, which means I can tell you exactly where your money ends up.</p>
          <p>Thank you for trusting us with it.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: The sponsorship model (Day ~14) ─────────────────────────
    case 1:
      return {
        subject: "A little more about how we work",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I wanted to tell you a little more about how we work, since you already took a chance on us once.</p>
          <p>Every child at our campus has a number, and that number is the bridge to a sponsor. The sponsor pays $25 a month, which supports school, two meals a day, and medical care at the campus. In return, the sponsor gets letters, photos, and report cards from their matched child. The child knows their sponsor&rsquo;s name. It&rsquo;s a real relationship between two real people, and that&rsquo;s kind of the whole point of what we built.</p>
          <p>If you want to see the kids, you can <a href="${sponsorUrl}" style="color: #D4A843; font-weight: bold;">meet them here</a>. Or if you want to grab a shirt and get randomly matched to a child by number, <a href="${SITE_URL}/shirts" style="color: #D4A843; font-weight: bold;">check out the shirts here</a>.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">MEET THE KIDS</a>
          </p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: Last email (Day ~25) ────────────────────────────────────
    case 2:
      return {
        subject: "Last email from me about this",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>This is the last email I&rsquo;ll send you about this.</p>
          <p>What you gave went to real kids. It supported meals and kept them in school. If you ever want to go deeper, whether that&rsquo;s sponsoring a child for $25 a month or picking up a shirt that matches you to one by number, <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">we&rsquo;re always here</a>.</p>
          <p>Thank you again.</p>
          <p>Kevin</p>
        `),
      };

    default:
      return null;
  }
}

// ── Shirt + sponsor combo emails ────────────────────────────────────────────

function shirtSponsorEmail(
  stage: number,
  donor: DripDonor,
  sponsorCode?: string | null
): { subject: string; html: string } | null {
  const { firstName, shirtNumber } = donor;
  // Stockpile model: never name a specific child or quote a specific
  // shirt number. Buyer-to-child match happens when the buyer reads
  // the number off the back of their shirt and visits beanumber.org/
  // [number]. We don't pre-assign at checkout anymore, so we don't
  // write the match as if we know it. `multi` is kept for grammar
  // ("your shirts" vs "your shirt"), since the buyer literally has
  // more than one physical shirt — but we don't list the numbers.
  const numbers = parseShirtNumbers(shirtNumber);
  const multi = numbers.length > 1;
  const portalUrl = `${SITE_URL}/sponsor/login`;

  switch (stage) {
    // ── Email 1: Shirt in transit + sponsorship active, NO reveal (Day ~10)
    case 0:
      return {
        subject: multi ? "Your shirts are being made right now" : "Your shirt is being made right now",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          ${multi
            ? `<p>Your ${numbers.length} shirts are being made right now. I screen-print every one by hand, and yours will ship within the next few days.</p>
               <p>When they arrive, check the back of each one. Every shirt has a different number pressed below the main design, and every number belongs to a different child at our campus in Northern Uganda. You&rsquo;ll come back to the site, enter each number, and meet them.</p>`
            : `<p>Your shirt is being made right now. I screen-print every one by hand, and yours will ship within the next few days.</p>
               <p>When it arrives, check the back of the shirt. There&rsquo;s a number pressed below the main design, and that number belongs to a real child at our campus in Northern Uganda. You&rsquo;ll come back to the site, enter the number, and meet them.</p>`
          }
          <p>You also signed up for monthly sponsorship, which means your $25 a month is already at work. It supports school fees, two meals a day, and medical care at the campus, and that started the day you signed up. You&rsquo;re a sponsor right now, even before the ${multi ? 'shirts arrive' : 'shirt arrives'}.</p>
          <p>Once you&rsquo;ve gotten your ${multi ? 'shirts' : 'shirt'} and entered the number on the site, your sponsor view unlocks right on that page &mdash; updates, photos, the whole thing. I want you to have the ${multi ? 'shirts' : 'shirt'} in hand first.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: Meet the kid + how to get into the sponsor view (Day ~13)
    //
    // No personalization. The buyer's shirt has the number; the site
    // does the reveal. If sponsorCode is set (because they already
    // visited /[number] and the claim-match auto-bound them, or because
    // Kevin issued one manually), we surface it as a portable recovery
    // key — but we still don't name the child or quote their number.
    case 1: {
      const codeBlock = sponsorCode
        ? `<p>Your sponsor view is ready when you are. Use this code if you ever need to log in from another device:</p>
           <div style="background: #FFF8F0; border: 1px solid #e8e0d4; padding: 16px 20px; margin: 16px 0; text-align: center;">
             <p style="color: #999; font-size: 13px; margin: 0 0 4px 0;">Your sponsor code</p>
             <p style="font-size: 22px; color: #0d0d0d; margin: 0; font-weight: bold; letter-spacing: 0.1em; font-family: monospace;">${sponsorCode}</p>
           </div>`
        : `<p>When you flip your shirt over and enter the number on the back at <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a>, your sponsor view unlocks right on that page &mdash; updates, photos, the whole thing &mdash; no separate login to remember.</p>`;

      return {
        subject: multi ? "Have you met your kids yet?" : "Have you met your child yet?",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          ${multi
            ? `<p>Your shirts should be there by now. Each one has a different number pressed on the back, and each number belongs to a different child at the campus. Enter each number at <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a> to meet the kid behind it.</p>
               <p>Your sponsorship is already supporting school fees, meals, and medical care for the children at the campus.</p>`
            : `<p>Your shirt should be there by now, and if it is, you&rsquo;ve seen the number on the back. That number is your kid. Enter it at <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a> to meet them.</p>`
          }
          ${codeBlock}
          <p>Kevin</p>
        `),
      };
    }

    // ── Email 3: Two weeks in (Day ~18) ──────────────────────────────────
    case 2:
      return {
        subject: "Two weeks as a sponsor",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>You&rsquo;ve been sponsoring for about two weeks now, and I wanted to give you a picture of what that looks like on the ground.</p>
          <p>Your $25 this month went toward school fees, breakfast and lunch every day, and a nurse on campus whenever the kids needed one. That&rsquo;s what sponsorship looks like in practice, and it happens every month you&rsquo;re here.</p>
          <p>Your first update from the campus should be coming soon. The YDO team sends photos, report cards, and sometimes handwritten letters from the kids, and they show up in your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">portal</a> and by email.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 4: One month (Day ~25) ─────────────────────────────────────
    case 3:
      return {
        subject: "One month in",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>You bought ${multi ? `${numbers.length} shirts` : 'a shirt'} and signed up to sponsor in the same decision, and that decision has been supporting school fees, meals, and medical care for a full month now.</p>
          <p>If you know someone who&rsquo;d be into what we do, the best thing you can do is send them a text. Doesn&rsquo;t need to be a big deal, something like &ldquo;I sponsor a kid in Uganda through Be A Number, you should check it out.&rdquo; That&rsquo;s how most of our sponsors find us.</p>
          <p>Your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">portal</a> has the latest updates whenever you want to check in.</p>
          <p>Kevin</p>
        `),
      };

    default:
      return null;
  }
}

// ── Monthly donor emails (not a sponsor, gave monthly via donate page) ──────

function monthlyDonorEmail(
  stage: number,
  donor: DripDonor
): { subject: string; html: string } | null {
  const { firstName } = donor;

  switch (stage) {
    // ── Email 1: Where the monthly gift goes (Day ~3) ────────────────────
    case 0:
      return {
        subject: "Where your monthly donation goes",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I wanted to reach out and let you know where your monthly donation goes.</p>
          <p>It goes to the YDO campus in Northern Uganda. One campus, one team on the ground. We built a school for 380 kids, a medical clinic that has treated more than 700 patients, and vocational programs where 60 women are learning trades. Your gift each month supports meals for kids who might not eat otherwise, school fees that keep them in class, and a medical clinic that serves the whole community.</p>
          <p>I&rsquo;ll keep you in the loop on what&rsquo;s happening at the campus.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: How it works (Day ~12) ──────────────────────────────────
    case 1:
      return {
        subject: "How things work at the campus",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I wanted to give you a better picture of how things work on the ground, since your monthly gift is part of what makes it all run.</p>
          <p>Every child at the campus has a number, and that number goes on a shirt. When someone buys that shirt or sponsors that child, they get connected to a real kid by name. The sponsor gets letters, photos, and report cards, and the child knows their sponsor. It&rsquo;s not a big faceless program.</p>
          <p>Your monthly gift is what keeps the whole campus going: the meals, the teachers, the clinic. Without monthly donors, none of the rest of it would work.</p>
          <p>If you want to see the kids your gift is supporting, you can <a href="${SITE_URL}/sponsorship" style="color: #D4A843; font-weight: bold;">meet them here</a>.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: Spread the word (Day ~22) ─────────────────────────────
    case 2:
      return {
        subject: "One thing that would really help",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Your monthly gift keeps the campus running, and I wanted to ask you for one more thing that doesn&rsquo;t cost anything.</p>
          <p>If you know someone who&rsquo;d be into what we do, send them our way. A text, an Instagram share, a conversation over coffee. Most of the people who support us found out because someone they trust told them about it. That&rsquo;s it. No ad campaign, no viral post. One person telling another person about a six-acre campus in Uganda where real things are happening for real kids.</p>
          <p>Here&rsquo;s the link if you want to share it: <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a></p>
          <p>Thank you for being part of this.</p>
          <p>God bless,<br>Kevin</p>
        `),
      };

    default:
      return null;
  }
}

// ── Pipeline router ─────────────────────────────────────────────────────────

function getEmailForPipeline(
  pipeline: string,
  stage: number,
  donor: DripDonor,
  sponsorCode?: string | null
): { subject: string; html: string } | null {
  switch (pipeline) {
    case 'shirt_nurture':    return shirtNurtureEmail(stage, donor);
    case 'sponsor_onboard':  return sponsorOnboardEmail(stage, donor, sponsorCode);
    case 'donor_convert':    return donorConvertEmail(stage, donor);
    case 'shirt_sponsor':    return shirtSponsorEmail(stage, donor, sponsorCode);
    case 'monthly_donor':    return monthlyDonorEmail(stage, donor);
    default:                 return null;
  }
}

// ── Airtable helpers ─────────────────────────────────────────────────────────

async function getDripDonorsDue(): Promise<DripDonor[]> {
  // Query ALL pipelines — not just shirt_nurture
  const formula = `AND(
    NOT({DripPipeline}=BLANK()),
    NOT({DripNextSend}=BLANK()),
    IS_BEFORE({DripNextSend}, DATEADD(TODAY(), 1, 'day'))
  )`;

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${DONORS_TABLE}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=50`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    console.error('[Drip] Failed to query donors:', res.status);
    return [];
  }

  const data = await res.json();
  return (data.records || []).map((r: any) => ({
    recordId: r.id,
    email: r.fields['Email Address'] || '',
    firstName: (r.fields['Donor Name'] || '').split(' ')[0] || 'there',
    pipeline: r.fields['DripPipeline'] || '',
    dripStage: r.fields['DripStage'] ?? 0,
    childName: r.fields['DripChildName'] || '',
    shirtNumber: r.fields['DripShirtNumber'] || '',
  }));
}

async function advanceDripStage(
  recordId: string,
  newStage: number,
  nextSendDate: string | null
): Promise<void> {
  const fields: Record<string, unknown> = { DripStage: newStage };

  if (nextSendDate) {
    fields.DripNextSend = nextSendDate;
  } else {
    // Sequence complete — clear drip fields
    fields.DripPipeline = null;
    fields.DripStage = null;
    fields.DripNextSend = null;
    // Keep DripChildName and DripShirtNumber for analytics
  }

  await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${DONORS_TABLE}/${recordId}`,
    {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ fields }),
    }
  );
}

// Log to Communications table for audit trail
async function logDripSend(
  donorId: string,
  email: string,
  subject: string,
  pipeline: string,
  stage: number,
  maxStages: number,
  status: string
): Promise<void> {
  try {
    await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/tblw7ZmsfcphmfsWT`,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          fields: {
            Subject: subject,
            'Email Body': `[Drip] Pipeline: ${pipeline}, Stage: ${stage + 1} of ${maxStages}`,
            'Send Date': new Date().toISOString().split('T')[0],
            Status: status,
            'Recipient Email': email,
            'Email Type': 'Monthly Update', // Closest existing option
            'Related Donor': [donorId],
          },
        }),
      }
    );
  } catch (err) {
    console.error('[Drip] Failed to log communication:', err);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Airtable not configured' }, { status: 500 });
  }

  const today = new Date().toISOString().split('T')[0];
  console.log(`[Drip] Cron started: ${today}`);

  const donors = await getDripDonorsDue();
  console.log(`[Drip] ${donors.length} donor(s) due for drip email`);

  if (donors.length === 0) {
    return NextResponse.json({ success: true, processed: 0 });
  }

  const results: Array<{
    email: string;
    stage: number;
    status: string;
  }> = [];

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';

  for (const donor of donors) {
    const config = PIPELINE_CONFIGS[donor.pipeline];
    if (!config) {
      console.warn(`[Drip] Unknown pipeline "${donor.pipeline}" for ${donor.email}, skipping`);
      continue;
    }

    // Look up sponsor code for pipelines that include portal login instructions
    const sponsorCode = (donor.pipeline === 'sponsor_onboard' || donor.pipeline === 'shirt_sponsor')
      ? await getSponsorCode(donor.email)
      : null;

    const emailContent = getEmailForPipeline(donor.pipeline, donor.dripStage, donor, sponsorCode);

    if (!emailContent) {
      // Past the last stage — clear drip
      await advanceDripStage(donor.recordId, donor.dripStage, null);
      results.push({ email: donor.email, stage: donor.dripStage, status: 'completed' });
      continue;
    }

    try {
      const result = await sendEmail({
        to: { email: donor.email, name: donor.firstName },
        from: { email: fromEmail, name: 'Kevin at Be A Number' },
        subject: emailContent.subject,
        html: emailContent.html,
      });

      const newStage = donor.dripStage + 1;
      const gap = config.gaps[donor.dripStage];
      const nextSend = newStage < config.maxStages ? addDays(today, gap ?? 7) : null;

      await advanceDripStage(donor.recordId, newStage, nextSend);
      await logDripSend(
        donor.recordId,
        donor.email,
        emailContent.subject,
        donor.pipeline,
        donor.dripStage,
        config.maxStages,
        result.success ? 'Sent' : 'Failed'
      );

      results.push({
        email: donor.email,
        stage: donor.dripStage,
        status: result.success ? 'sent' : 'failed',
      });

      console.log(
        `[Drip] ${result.success ? 'Sent' : 'FAILED'} ${donor.pipeline} stage ${donor.dripStage + 1}/${config.maxStages} to ${donor.email}`
      );
    } catch (err: any) {
      console.error(`[Drip] Error processing ${donor.email}:`, err?.message || err);
      results.push({ email: donor.email, stage: donor.dripStage, status: 'error' });
    }
  }

  console.log(`[Drip] Cron complete. Processed ${results.length} donor(s).`);

  return NextResponse.json({
    success: true,
    processed: results.length,
    results,
  });
}
