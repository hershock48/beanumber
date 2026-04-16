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

// ── Shirt nurture email schedule ─────────────────────────────────────────────
//
// Stage 0 → Email 2 (Day 6):  "It's on its way"
// Stage 1 → Email 3 (Day 12): "Did it land?"
// Stage 2 → Email 4 (Day 20): "Here's what happened" + conversion ask
// Stage 3 → Email 5 (Day 30): "Last one from me" + final nudge
// Stage 4 → Done (clear drip fields)
//
// Days between sends: 6, 6, 8, 10
const SHIRT_NURTURE_GAPS = [6, 6, 8, 10];

type DripDonor = {
  recordId: string;
  email: string;
  firstName: string;
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

// ── Airtable helpers ─────────────────────────────────────────────────────────

async function getDripDonorsDue(): Promise<DripDonor[]> {
  const today = new Date().toISOString().split('T')[0];
  const formula = `AND(
    {DripPipeline}="shirt_nurture",
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
  stage: number,
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
            'Email Body': `[Drip] Pipeline: shirt_nurture, Stage: ${stage + 1} of 4`,
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
    const emailContent = shirtNurtureEmail(donor.dripStage, donor);

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
      const gap = SHIRT_NURTURE_GAPS[donor.dripStage];
      const nextSend = newStage < 4 ? addDays(today, gap ?? 7) : null;

      await advanceDripStage(donor.recordId, newStage, nextSend);
      await logDripSend(
        donor.recordId,
        donor.email,
        emailContent.subject,
        donor.dripStage,
        result.success ? 'Sent' : 'Failed'
      );

      results.push({
        email: donor.email,
        stage: donor.dripStage,
        status: result.success ? 'sent' : 'failed',
      });

      console.log(
        `[Drip] ${result.success ? 'Sent' : 'FAILED'} stage ${donor.dripStage + 1}/4 to ${donor.email}`
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
