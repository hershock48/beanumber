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
// shirt_nurture (4 emails, ~30 days):
//   Stage 0 → Day 6:  "It's on its way"
//   Stage 1 → Day 12: "Did it land?"
//   Stage 2 → Day 20: "Here's what happened" + conversion ask
//   Stage 3 → Day 30: "Last one from me" + final nudge
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
// shirt_sponsor (4 emails, ~25 days):
//   Stage 0 → Day 3:  "Shirt on the way" — shipping, teases portal (no code yet)
//   Stage 1 → Day 8:  "Did the shirt land?" — reveal + sponsor code + portal
//   Stage 2 → Day 15: "What your first month did" — impact, updates coming
//   Stage 3 → Day 25: "Thank you for staying" — celebrate, tell one friend
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
  childName: string;
  shirtNumber: number;
};

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
  const { firstName, childName, shirtNumber } = donor;
  const childUrl = `${SITE_URL}/children/${shirtNumber}`;
  const sponsorUrl = `${SITE_URL}/api/sponsor-checkout?number=${shirtNumber}`;

  switch (stage) {
    // ── Email 1: "Shirt's coming" (Day ~6) ────────────────────────────────
    case 0:
      return {
        subject: "Your shirt's almost there.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Your shirt should be arriving soon. I make every one by hand, so yours was pressed specifically for you.</p>
          <p>When it shows up, check the tag inside the collar. There&rsquo;s a number on it. That number belongs to a child at our campus in Northern Uganda. Head to <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a>, enter it, and you&rsquo;ll meet them: their name, their face, their story.</p>
          <p>Talk soon,<br>Kevin</p>
        `),
      };

    // ── Email 2: "Did it land?" (Day ~12) ─────────────────────────────────
    case 1:
      return {
        subject: "Did your shirt make it?",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Checking in. Did it arrive?</p>
          <p>If so, the number inside the collar is yours. Enter it here and you&rsquo;ll meet the child on the other side:</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${SITE_URL}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">ENTER YOUR NUMBER</a>
          </p>
          <p>No rush. Whenever you&rsquo;re ready.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: "Here's what your shirt did" + ask (Day ~20) ────────────
    case 2:
      return {
        subject: childName
          ? `Something about ${childName}.`
          : "Something about the kid behind your shirt.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          ${childName
            ? `<p>The child connected to your shirt is ${childName}. If you haven&rsquo;t met them yet, <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">here&rsquo;s their page</a>.</p>
               <p>This past month, ${childName} went to school every day, ate breakfast and lunch at the campus, and had a nurse available if they needed one. That happened because of the people who fund their spot. Right now, that spot costs $25/month.</p>`
            : `<p>The child connected to your shirt went to school every day this month, ate breakfast and lunch at the campus, and had a nurse available if they needed one. That&rsquo;s what it looks like when someone funds a child&rsquo;s spot. Right now, that spot costs $25/month.</p>`
          }
          <p>For that, you get a direct connection to ${childName || 'a specific child'}: letters, photos, report cards, and a place to write to them. One person, one kid.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">SPONSOR ${childName ? childName.toUpperCase() : 'A CHILD'} &mdash; $25/MO</a>
          </p>
          <p>Kevin</p>
        `),
      };

    // ── Email 4: "Last one" (Day ~30) ────────────────────────────────────
    case 3:
      return {
        subject: "Last email from me on this.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Last one, I promise.</p>
          <p>The shirts are how people find us. Sponsorship is how we keep the campus running. $25/month covers school fees, two meals a day, and medical care for one child. For some of these kids, those two meals are the only ones they get. The sponsor gets letters, photos, and a real connection to that kid by name.</p>
          <p>If you want in: <a href="${sponsorUrl}" style="color: #D4A843; font-weight: bold;">sponsor ${childName || 'a child'} for $25/mo</a>.</p>
          <p>If not, thank you for the shirt. Wear it. It starts conversations, and those conversations find us new sponsors.</p>
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
  const childUrl = `${SITE_URL}/children/${shirtNumber}`;
  const portalUrl = `${SITE_URL}/sponsor/login`;

  switch (stage) {
    // ── Email 1: "Your portal is ready" (Day ~3) ─────────────────────────
    case 0:
      return {
        subject: childName
          ? `${childName}'s page is live.`
          : "Your sponsor portal is ready.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Your sponsorship is active. Here&rsquo;s what that means right now.</p>
          ${childName
            ? `<p>$25/month covers school fees, two meals a day, and medical care for ${childName} at the YDO campus in Northern Uganda. <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">Here&rsquo;s their page.</a> For some of the kids on campus, those two meals are the only ones they get. That&rsquo;s where your money goes.</p>`
            : `<p>$25/month covers school fees, two meals a day, and medical care for a specific child at the YDO campus in Northern Uganda. For some of the kids on campus, those two meals are the only ones they get. That&rsquo;s where your money goes.</p>`
          }
          <p>I built a sponsor portal where you can see updates, photos, and letters as they come in. To log in, you need your email and your sponsor code:</p>
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
          <p>You can write to ${childName || 'your child'} from the portal or by replying to this email. The YDO team on the ground delivers everything and translates when needed.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: "Updates are coming" (Day ~10) ──────────────────────────
    case 1:
      return {
        subject: childName
          ? `Something coming from ${childName}.`
          : "Your first update is almost here.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>The YDO team on the ground sends sponsor updates from the campus. ${childName ? `You&rsquo;ll hear about ${childName} specifically` : 'You&rsquo;ll hear about your child specifically'}: what subjects they&rsquo;re studying, how they&rsquo;re doing, sometimes a photo or a handwritten letter.</p>
          <p>These show up in your portal and by email. The first one usually lands within your first month.</p>
          <p>If you want to write first, you can. Reply to this email or use the portal. The YDO team reads every note and translates when needed. ${childName ? `${childName} will` : 'Your child will'} actually receive it.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: "One month in" (Day ~21) ─────────────────────────────────
    case 2:
      return {
        subject: "One month in.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>You&rsquo;ve been here about a month. Here&rsquo;s what your $25 did: ${childName ? `${childName} went` : 'your child went'} to school every day, ate breakfast and lunch at the campus, and had a nurse available if they needed one.</p>
          <p>That&rsquo;ll happen again next month because you&rsquo;re still here.</p>
          <p>One thing that helps us more than anything: tell one person. Not a social post. One friend, one text. &ldquo;I sponsor a kid in Uganda through Be A Number. Check it out.&rdquo; That&rsquo;s how most of our sponsors find us.</p>
          <p>Your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">portal</a> has the latest updates.</p>
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
    // ── Email 1: "Where your donation went" (Day ~5) ─────────────────────
    case 0:
      return {
        subject: "Wanted you to know where this went.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Your donation went to the YDO campus in Northern Uganda. One campus, one team on the ground. It funds school fees, two meals a day, and medical care for specific children by name.</p>
          <p>We&rsquo;re small on purpose. Every dollar goes through the same door, and I know exactly where yours went.</p>
          <p>Thank you for trusting us with it.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: "The kids behind the numbers" (Day ~14) ──────────────────
    case 1:
      return {
        subject: "The kids behind the numbers.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Every child at our campus has a number. That number connects them to one sponsor. $25/month covers school, two meals a day, and medical care. The sponsor gets letters, photos, and report cards. The child knows their sponsor&rsquo;s name.</p>
          <p>That&rsquo;s the whole model. One person, one kid, and you can see exactly where the money goes.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">MEET THE KIDS</a>
          </p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: "Last one" (Day ~25) ─────────────────────────────────────
    case 2:
      return {
        subject: "Last email from me on this.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Last one.</p>
          <p>What you gave fed kids and kept them in school. If you ever want to go deeper &mdash; sponsor a child for $25/month, or grab a shirt that connects you to one by number &mdash; <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">we&rsquo;re here</a>.</p>
          <p>Either way, thank you.</p>
          <p>God bless,<br>Kevin</p>
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
  const { firstName, childName, shirtNumber } = donor;
  const childUrl = `${SITE_URL}/children/${shirtNumber}`;
  const portalUrl = `${SITE_URL}/sponsor/login`;

  switch (stage) {
    // ── Email 1: "Your shirt is on the way" (Day ~3) ────────────────────
    case 0:
      return {
        subject: childName
          ? `Your shirt and ${childName} are both waiting for you.`
          : "Your shirt is being made, and something else happened too.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I&rsquo;m heat-pressing your shirt right now. Every Be A Number shirt is made by hand &mdash; just me, an iron, and a lot of vinyl &mdash; and yours will ship within the next few days.</p>
          <p>When it arrives, check the tag. There&rsquo;s a number on it, and that number belongs to a real child at our campus in Northern Uganda. That&rsquo;s your child. You&rsquo;ll come back to the site, enter the number, and meet them.</p>
          <p>You also signed up for monthly sponsorship, which means your $25/month covers breakfast and lunch, school fees, and medical care for ${childName || 'your child'} starting right now. That&rsquo;s already happening.</p>
          <p>Once you&rsquo;ve opened your shirt and met your child, I&rsquo;ll send you access to your sponsor portal &mdash; a spot where you can see updates, photos, and write to them directly. I want you to have that moment with the shirt first.</p>
          <p>More soon.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: "Did the shirt land?" + code + reveal (Day ~8) ────────
    case 1:
      return {
        subject: childName
          ? `Quick question (and something about ${childName}).`
          : "Quick question about your shirt.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Just checking &mdash; did your shirt arrive yet?</p>
          ${childName
            ? `<p>If it did, you&rsquo;ve seen the number. That number belongs to <strong>${childName}</strong>. <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">Here&rsquo;s their page.</a> Take a look when you get a minute &mdash; that&rsquo;s the kid you&rsquo;re keeping in school.</p>`
            : `<p>When it arrives, the number on it belongs to a real child at our campus. Check the tag, then visit <a href="${SITE_URL}/children" style="color: #D4A843; font-weight: bold;">beanumber.org/children</a> to meet them.</p>`
          }
          <p>As promised, here&rsquo;s your sponsor portal access. This is where updates, photos, and letters from ${childName || 'your child'} will show up over the coming months:</p>
          ${sponsorCode
            ? `<div style="background: #FFF8F0; border: 1px solid #e8e0d4; padding: 16px 20px; margin: 16px 0; text-align: center;">
                <p style="color: #999; font-size: 13px; margin: 0 0 4px 0;">Your sponsor code</p>
                <p style="font-size: 22px; color: #0d0d0d; margin: 0; font-weight: bold; letter-spacing: 0.1em; font-family: monospace;">${sponsorCode}</p>
              </div>`
            : `<p style="color: #666; font-size: 14px;">(I wasn&rsquo;t able to pull your sponsor code automatically. Reply to this email and I&rsquo;ll get it to you right away.)</p>`
          }
          <p style="text-align: center; margin: 24px 0;">
            <a href="${portalUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">LOG IN TO YOUR PORTAL</a>
          </p>
          <p>You can also write to ${childName || 'your child'} from the portal or by replying to this email. I relay everything through the YDO team on the ground.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: "What your first month did" (Day ~15) ──────────────────
    case 2:
      return {
        subject: "Here's what your first month did.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Two weeks in. Here&rsquo;s what happened on the ground.</p>
          <p>${childName ? `${childName} had` : 'Your child had'} a seat in school every day. Ate breakfast and lunch every day. Had a nurse on campus if they needed one. That&rsquo;s your $25 at work.</p>
          <p>Your first update from the campus is coming soon &mdash; photos, report cards, sometimes a handwritten letter. They show up in your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">portal</a> and by email.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 4: "One month check-in" (Day ~25) ──────────────────────────
    case 3:
      return {
        subject: "Quick check-in.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>You bought a shirt and signed up to sponsor ${childName || 'a child'} in the same decision. That covers school fees, two meals a day, and medical care &mdash; and it&rsquo;s already been running for a month.</p>
          <p>One thing that helps us: tell one friend. One text. &ldquo;I sponsor a kid in Uganda through Be A Number.&rdquo; That&rsquo;s how most of our sponsors find us.</p>
          <p>If you haven&rsquo;t checked your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">portal</a> lately, updates show up there first.</p>
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
    // ── Email 1: "Where your monthly gift goes" (Day ~3) ─────────────────
    case 0:
      return {
        subject: "Here's where your monthly gift goes.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Your monthly donation goes to the YDO campus in Northern Uganda. One campus, one team on the ground: 380 kids in school, 700+ patients through the clinic, 60 women in vocational training.</p>
          <p>Each month, your gift covers meals for kids who might not eat otherwise, school fees that keep them in class, and a medical clinic that serves the whole community.</p>
          <p>I&rsquo;ll keep you posted on what&rsquo;s happening on the ground.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: "How it works" (Day ~12) ─────────────────────────────────
    case 1:
      return {
        subject: "How it works on the ground.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Every child at the campus has a number. That number goes on a shirt, and when someone buys that shirt or sponsors that child, they&rsquo;re connected one-to-one. The sponsor gets letters, photos, and report cards. The child knows their sponsor by name.</p>
          <p>Your monthly gift is what keeps the whole campus running &mdash; the meals, the teachers, the clinic. Without monthly donors, none of the one-to-one connections work.</p>
          <p>If you want to see the kids: <a href="${SITE_URL}/children" style="color: #D4A843; font-weight: bold;">here they are</a>. Real names, real faces.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: "Last one — sponsorship intro" (Day ~22) ─────────────────
    case 2:
      return {
        subject: "Last one from me.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Last email in this series. I want to mention one thing before I go.</p>
          <p>For $25/month, you can sponsor a specific child. Connected by name and number. You get letters, photos, and report cards from the campus. They know who you are.</p>
          <p>If that sounds right: <a href="${SITE_URL}/sponsorship" style="color: #D4A843; font-weight: bold;">meet the kids here</a>.</p>
          <p>If not, your monthly gift keeps the campus running, and that matters.</p>
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
    shirtNumber: r.fields['DripShirtNumber'] || 0,
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
