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

function shirtNurtureEmail(
  stage: number,
  donor: DripDonor
): { subject: string; html: string } | null {
  const { firstName, childName, shirtNumber } = donor;
  const childUrl = `${SITE_URL}/children/${shirtNumber}`;
  const sponsorUrl = `${SITE_URL}/sponsorship?child=${shirtNumber}`;

  // Shared email wrapper — Georgia serif, same look as the confirmation email
  const wrap = (body: string) => `<!DOCTYPE html>
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

  switch (stage) {
    // ── Email 2: "It's on its way" (Day ~6) ───────────────────────────────
    case 0:
      return {
        subject: "Your shirt is on its way.",
        html: wrap(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Your shirt should be headed your way. When it arrives, flip the collar and look at the number stamped inside.</p>
          <p>That number is someone&rsquo;s name. Come back to <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a>, enter it, and meet them.</p>
          <p>That&rsquo;s the whole point of this shirt.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: "Did it land?" (Day ~12) ─────────────────────────────────
    case 1:
      return {
        subject: "Did your shirt arrive?",
        html: wrap(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Just checking in &mdash; your shirt should be there by now. If you haven&rsquo;t already, take a look at the number inside the collar and enter it here:</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${SITE_URL}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">ENTER YOUR NUMBER</a>
          </p>
          <p>There&rsquo;s a real kid on the other side of that number. They&rsquo;re already enrolled at the campus. Your shirt put them there.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 4: "Here's what happened" + ask (Day ~20) ──────────────────
    case 2:
      return {
        subject: childName
          ? `What your $25 did for ${childName}.`
          : "What your $25 did this month.",
        html: wrap(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          ${childName
            ? `<p>By now you&rsquo;ve probably met ${childName} &mdash; the kid your shirt is connected to. If you haven&rsquo;t yet, <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">here they are</a>.</p>`
            : `<p>By now you&rsquo;ve probably entered your number and met the child your shirt is connected to. If not, <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">go do it</a> &mdash; it takes 10 seconds.</p>`
          }
          <p>Here&rsquo;s what your $25 covered this month: a seat in school, a meal every day, and access to the on-site medical clinic. That&rsquo;s not a metaphor. ${childName ? `${childName} went` : 'Your child went'} to class, ate lunch, and had a nurse available if they needed one &mdash; because you showed up.</p>
          <p>Month two is where the relationship starts. $25/month keeps you in ${childName ? `${childName}&rsquo;s` : 'their'} life &mdash; letters, photos, a report card at the end of the year, and a real connection to a real kid who knows your name.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">STAY IN ${childName ? childName.toUpperCase() + '&rsquo;S' : 'THEIR'} LIFE &mdash; $25/MO</a>
          </p>
          <p>Kevin</p>
        `),
      };

    // ── Email 5: "Last one from me" (Day ~30) ────────────────────────────
    case 3:
      return {
        subject: "Last one from me on this.",
        html: wrap(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I&rsquo;m not going to keep emailing you about this. You bought a shirt, you ${childName ? `met ${childName}` : 'met your child'}, and your first month already made a difference.</p>
          <p>If you want to stay in ${childName ? `${childName}&rsquo;s` : 'their'} life &mdash; $25 a month, letters, photos, the whole thing &mdash; <a href="${sponsorUrl}" style="color: #D4A843; font-weight: bold;">the door&rsquo;s open</a>.</p>
          <p>If not, wear the shirt well. It still starts conversations, and that matters too.</p>
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
  donor: DripDonor
): { subject: string; html: string } | null {
  const { firstName, childName, shirtNumber } = donor;
  const childUrl = `${SITE_URL}/children/${shirtNumber}`;
  const portalUrl = `${SITE_URL}/sponsor/welcome`;

  const wrap = (body: string) => `<!DOCTYPE html>
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

  switch (stage) {
    // ── Email 1: "Here's your portal" (Day ~3) ──────────────────────────
    case 0:
      return {
        subject: childName
          ? `You and ${childName} — here's how this works.`
          : "You're in — here's how this works.",
        html: wrap(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>You&rsquo;re officially a sponsor. That means a real kid at the YDO campus in Northern Uganda knows your name — or will soon.</p>
          ${childName
            ? `<p><a href="${childUrl}" style="color: #D4A843; font-weight: bold;">Here&rsquo;s ${childName}&rsquo;s page.</a> That&rsquo;s who your $25/month goes to — school fees, a daily meal, and access to the on-site medical clinic.</p>`
            : `<p>Your $25/month covers school fees, a daily meal, and access to the on-site medical clinic for a specific child at the campus.</p>`
          }
          <p>Your sponsor portal is where you&rsquo;ll get updates — photos, letters, report cards as they come in. Bookmark it:</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${portalUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">YOUR SPONSOR PORTAL</a>
          </p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: "Your first update is coming" (Day ~10) ────────────────
    case 1:
      return {
        subject: childName
          ? `An update on ${childName} is coming.`
          : "Your first sponsor update is coming.",
        html: wrap(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Quick note — the YDO team sends sponsor updates from the campus. ${childName ? `You&rsquo;ll hear about ${childName} specifically` : 'You&rsquo;ll hear about your child specifically'}: what they&rsquo;re studying, how they&rsquo;re doing, sometimes a photo or a letter they wrote.</p>
          <p>These come through your portal and by email. The first one usually lands within your first month.</p>
          <p>If you ever want to write back, reply to this email or send a note through the portal. The team reads every one and translates when needed.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: "You've been here a month" (Day ~21) ───────────────────
    case 2:
      return {
        subject: "One month in.",
        html: wrap(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>You&rsquo;ve been a sponsor for about a month now. Here&rsquo;s what that covered: ${childName ? `${childName} went` : 'your child went'} to school every day, ate a meal every day, and had a nurse on campus if they needed one. That&rsquo;s not a pitch — that&rsquo;s what happened because you showed up.</p>
          <p>Two things that help us:</p>
          <p><strong>1. Tell one person.</strong> Not a social media post (unless you want to) — a text to one friend who&rsquo;d get it. &ldquo;I sponsor a kid in Uganda through this org called Be A Number. Here&rsquo;s the site.&rdquo; That&rsquo;s how most of our sponsors find us.</p>
          <p><strong>2. Check your portal.</strong> Updates show up there first. <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">Bookmark it.</a></p>
          <p>Thank you for staying.</p>
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
  const shirtsUrl = `${SITE_URL}/shirts`;

  const wrap = (body: string) => `<!DOCTYPE html>
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

  switch (stage) {
    // ── Email 1: "Here's what your donation did" (Day ~5) ───────────────
    case 0:
      return {
        subject: "Where your donation went.",
        html: wrap(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Wanted to close the loop on your donation. Here&rsquo;s what it touched: school fees, daily meals, and medical access for children at the YDO campus in Northern Uganda. Not a fund. Not an overhead pool. Specific kids, specific days, specific meals.</p>
          <p>We run lean — one campus, one team on the ground, direct sponsorship. Every dollar goes through the same pipe.</p>
          <p>Thanks for trusting us with it.</p>
          <p>Kevin</p>
        `),
      };

    // ── Email 2: "Meet the kids" (Day ~14) ──────────────────────────────
    case 1:
      return {
        subject: "The part most people don't see.",
        html: wrap(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>Most donors give once and move on. Makes sense — there&rsquo;s a lot of noise out there. But there&rsquo;s something different about what we do, and I want to show you.</p>
          <p>Every child at the YDO campus has a number. That number connects to a specific sponsor — someone who funds their seat in school, their daily meal, and their medical care. $25 a month. The sponsor gets letters, photos, report cards. The child knows their sponsor&rsquo;s name.</p>
          <p>It&rsquo;s not abstract. It&rsquo;s a relationship.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">MEET THE KIDS</a>
          </p>
          <p>Kevin</p>
        `),
      };

    // ── Email 3: "Last one from me" (Day ~25) ───────────────────────────
    case 2:
      return {
        subject: "Last one from me on this.",
        html: wrap(`
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>I&rsquo;m not going to keep emailing you about this. Your donation already made a difference and I&rsquo;m grateful for it.</p>
          <p>If you ever want to go deeper — sponsor a specific child for $25/month or grab a shirt that connects you to one by number — <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">the door&rsquo;s open</a>.</p>
          <p>Either way, thanks for showing up when it counted.</p>
          <p>Kevin</p>
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
  donor: DripDonor
): { subject: string; html: string } | null {
  switch (pipeline) {
    case 'shirt_nurture':    return shirtNurtureEmail(stage, donor);
    case 'sponsor_onboard':  return sponsorOnboardEmail(stage, donor);
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

    const emailContent = getEmailForPipeline(donor.pipeline, donor.dripStage, donor);

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
