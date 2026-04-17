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

type PipelineConfig = { gaps: number[]; maxStages: number };

const PIPELINE_CONFIGS: Record<string, PipelineConfig> = {
  shirt_nurture:    { gaps: [6, 6, 8, 10], maxStages: 4 },
  sponsor_onboard:  { gaps: [3, 7, 11],    maxStages: 3 },
  donor_convert:    { gaps: [5, 9, 11],    maxStages: 3 },
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
    // ── Email 2: "It's on its way" (Day ~6) ───────────────────────────────
    case 0:
      return {
        subject: "Your shirt is on its way.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I wanted to give you a heads up that your shirt should be arriving soon. I actually make these by hand, so yours was cut and pressed specifically for you.</p>
          <p>When it shows up, flip the collar. There&rsquo;s a number stamped inside. That number belongs to a real child at our campus in Northern Uganda. Their name, their face, their story. Head over to <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a> and enter it when you&rsquo;re ready.</p>
          <p>I think that moment is going to stick with you.</p>
          <p>Talk soon,<br>Kevin</p>
        `),
      };

    // ── Email 3: "Did it land?" (Day ~12) ─────────────────────────────────
    case 1:
      return {
        subject: "Quick question for you.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Did your shirt make it? I always get a little anxious until I know they&rsquo;ve landed safely.</p>
          <p>If it&rsquo;s there, I hope you&rsquo;ve had a chance to check the number inside the collar. If not, no rush. But when you do, enter it here and you&rsquo;ll meet the child behind your number:</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${SITE_URL}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">ENTER YOUR NUMBER</a>
          </p>
          <p>That&rsquo;s the part of this that I love the most. You bought a shirt, but there&rsquo;s a kid on the other side of it who&rsquo;s already enrolled at the campus because of you.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 4: "Here's what happened" + ask (Day ~20) ──────────────────
    case 2:
      return {
        subject: childName
          ? `I wanted to tell you about ${childName}.`
          : "Something I wanted you to see.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          ${childName
            ? `<p>I wanted to circle back to you about ${childName}, the child connected to your shirt. If you haven&rsquo;t met them yet, <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">take a look</a>. I think you&rsquo;ll be glad you did.</p>
               <p>Here&rsquo;s what I can tell you: this past month, ${childName} had a seat in school every day. They ate breakfast and lunch every day. And they had a nurse on campus if they needed one. That&rsquo;s real, and it happened because people like you showed up.</p>`
            : `<p>I wanted to tell you what your purchase actually did this past month. The child connected to your shirt had a seat in school every day, ate breakfast and lunch every day, and had a nurse on campus if they needed one. That&rsquo;s not a talking point. That&rsquo;s what happened.</p>`
          }
          <p>Here&rsquo;s the thing I keep coming back to: $25 a month is what it costs to keep ${childName || 'a child'} in that seat. To keep the meals coming. To keep the clinic staffed. And for that $25, you don&rsquo;t get a generic thank-you. You get letters. Photos. Report cards. A real connection to ${childName ? `${childName} specifically` : 'a real kid who knows your name'}.</p>
          <p>If that sounds like something you want to be part of, I&rsquo;d love to have you.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">SPONSOR ${childName ? childName.toUpperCase() : 'A CHILD'} FOR $25/MO</a>
          </p>
          <p>Either way, thank you for what you&rsquo;ve already done. It mattered.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 5: "Last one from me" (Day ~30) ────────────────────────────
    case 3:
      return {
        subject: "One last thing.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>This is the last email I&rsquo;m going to send you about this, and I want to be straight with you about why I&rsquo;m sending it at all.</p>
          <p>I started Be A Number because I met these kids and couldn&rsquo;t walk away. ${childName ? `${childName} is one of them.` : 'Every single one of them is real to me.'} The shirts are how most people find us, but sponsorship is how we actually keep the doors open. $25 a month keeps a child in school, fed, and cared for. And the sponsor gets to be part of that child&rsquo;s life in a way that I think is pretty rare.</p>
          <p>If that&rsquo;s something you want to do, <a href="${sponsorUrl}" style="color: #D4A843; font-weight: bold;">sponsor ${childName || 'a child'} for $25/mo</a>. If not, I genuinely appreciate you buying the shirt. Wear it well. It starts conversations, and those conversations have changed kids&rsquo; lives before.</p>
          <p>Thank you for being part of this, ${firstName}.</p>
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
    // ── Email 1: "Here's your portal" (Day ~3) ──────────────────────────
    case 0:
      return {
        subject: childName
          ? `${childName} is waiting for you.`
          : "Welcome to the family.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I&rsquo;m so glad you&rsquo;re here. I mean that. Every new sponsor changes what&rsquo;s possible for us, and it changes everything for one specific kid.</p>
          ${childName
            ? `<p>${childName} is the child your sponsorship supports. <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">Here&rsquo;s their page.</a> Your $25/month covers their school fees, breakfast and lunch every day, and access to the medical clinic on campus. For some of these kids, those two meals are all they eat. That&rsquo;s not a summary. That&rsquo;s literally where the money goes.</p>`
            : `<p>Your $25/month covers school fees, breakfast and lunch every day, and access to the on-site medical clinic for a specific child at our campus. For some of these kids, those two meals are all they eat. That&rsquo;s not a summary. That&rsquo;s literally where the money goes.</p>`
          }
          <p>I set up a sponsor portal where you can see updates, photos, and letters as they come in from the campus. To log in, you&rsquo;ll need your email and your sponsor code:</p>
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
          <p>If you ever have questions, or if you want to send a note to ${childName || 'your child'}, reply to this email. I&rsquo;ll make sure it gets to them through the YDO team on the ground.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: "Your first update is coming" (Day ~10) ────────────────
    case 1:
      return {
        subject: childName
          ? `Something coming from ${childName}.`
          : "Your first update is almost here.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I wanted to let you know what to expect over the next few weeks. The YDO team on the ground in Uganda sends sponsor updates from the campus. ${childName ? `You&rsquo;ll hear about ${childName} specifically` : 'You&rsquo;ll hear about your child specifically'}: what subjects they&rsquo;re studying, how they&rsquo;re doing in class, sometimes a photo or a handwritten letter.</p>
          <p>These show up in your portal and by email. The first one usually lands within your first month, and I always love hearing from sponsors when they get theirs. It makes the whole thing feel different when you&rsquo;re reading words from an actual kid who knows your name.</p>
          <p>And if you want to write back? You can. The YDO team reads every note sponsors send and translates when needed. ${childName ? `${childName} will` : 'Your child will'} actually receive it.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: "You've been here a month" (Day ~21) ───────────────────
    case 2:
      return {
        subject: "Thank you for staying.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>You&rsquo;ve been a sponsor for about a month now, and I wanted to take a second to say something I don&rsquo;t say enough: thank you for not leaving.</p>
          <p>That might sound weird, but the truth is, a lot of people sign up for things and quietly cancel. You didn&rsquo;t. And because you didn&rsquo;t, ${childName ? `${childName} went` : 'your child went'} to school every day this month, ate breakfast and lunch every day, and had a nurse on campus every day. For some of these kids, those are the only meals they get. That&rsquo;s not a pitch. That is literally what your $25 did.</p>
          <p>One thing that really helps us: if you know one person who&rsquo;d get what we do, send them a text. Not a social media blast. One friend. &ldquo;Hey, I sponsor a kid in Uganda through this org called Be A Number. Check it out.&rdquo; That&rsquo;s how most of our sponsors find us.</p>
          <p>And if you haven&rsquo;t checked your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">sponsor portal</a> lately, updates show up there first.</p>
          <p>Grateful for you,<br>Kevin</p>
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
    // ── Email 1: "Here's what your donation did" (Day ~5) ───────────────
    case 0:
      return {
        subject: "Wanted you to know where this went.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I know you probably get a lot of donation receipts and never hear anything again. I didn&rsquo;t want to do that to you.</p>
          <p>Your donation went to the YDO campus in Northern Uganda, where we fund school fees, breakfast and lunch, and medical care for specific children. For some of these kids, those two meals are all they eat in a day. Not a general fund. Not overhead. Real kids, real meals, real school days.</p>
          <p>We&rsquo;re small on purpose. One campus, one team on the ground, and a model where every dollar goes through the same door. I run this myself, and I take it personally when someone trusts us with their money.</p>
          <p>So thank you. I wanted you to know it landed somewhere real.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: "Meet the kids" (Day ~14) ──────────────────────────────
    case 1:
      return {
        subject: "Can I show you something?",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I&rsquo;ve been thinking about something, and I wanted to share it with you because you already showed up for these kids once.</p>
          <p>At our campus, every child has a number. That number connects them to a specific sponsor. One person, one child. The sponsor pays $25 a month, and that covers school, meals, and medical care. In return, the sponsor gets letters, photos, and report cards. The child knows their sponsor&rsquo;s name. It&rsquo;s not abstract. It&rsquo;s a real relationship between two real people.</p>
          <p>I built Be A Number around that idea because I think most of us want to help but don&rsquo;t trust where the money goes. This way, you know exactly where it goes. You can see it.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">MEET THE KIDS</a>
          </p>
          <p>No pressure at all. I&rsquo;m grateful for what you already gave.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: "Last one from me" (Day ~25) ───────────────────────────
    case 2:
      return {
        subject: "Last thing, then I'll leave you alone.",
        html: wrapEmail(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I promise this is the last time I&rsquo;m going to email you about this. I don&rsquo;t want to be that guy.</p>
          <p>But I do want to say one more time: what you gave mattered. It fed kids. It kept them in school. And if you ever feel pulled to go deeper, whether that&rsquo;s sponsoring a child for $25 a month or grabbing a shirt that connects you to one by number, <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">we&rsquo;re here</a>.</p>
          <p>Either way, you&rsquo;re part of this story now, and I&rsquo;m thankful for that.</p>
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

    // Look up sponsor code for sponsor_onboard emails (needed for portal login instructions)
    const sponsorCode = donor.pipeline === 'sponsor_onboard'
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
