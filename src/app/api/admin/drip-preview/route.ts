/**
 * GET|POST /api/admin/drip-preview
 *
 * Sends all drip emails across all 3 pipelines to Kevin for copy review.
 * Uses sample data. Not a production endpoint — delete after review.
 *
 * Query params:
 *   ?pipeline=shirt_nurture   — only send that pipeline's emails
 *   ?pipeline=sponsor_onboard
 *   ?pipeline=donor_convert
 *   (no param = send all 10)
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

function wrap(body: string) {
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

function banner(text: string) {
  return `<p style="background: #fff3cd; border: 1px solid #ffc107; padding: 10px 14px; font-size: 13px; color: #856404; margin-bottom: 20px;"><strong>PREVIEW:</strong> ${text}</p>`;
}

// Sample data
const firstName = 'Kevin';
const childName = 'Grace';
const shirtNumber = 12;
const childUrl = `${SITE_URL}/children/${shirtNumber}`;
const sponsorUrl = `${SITE_URL}/sponsorship?child=${shirtNumber}`;
const portalUrl = `${SITE_URL}/sponsor/welcome`;

type PreviewEmail = { pipeline: string; subject: string; html: string };

function getShirtNurtureEmails(): PreviewEmail[] {
  return [
    {
      pipeline: 'shirt_nurture',
      subject: '[SHIRT 1/4] Your shirt is on its way.',
      html: wrap(`
        ${banner('shirt_nurture — Stage 0 (Day 6). Shirt is in transit.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Your shirt should be headed your way. When it arrives, flip the collar and look at the number stamped inside.</p>
        <p>That number is someone&rsquo;s name. Come back to <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a>, enter it, and meet them.</p>
        <p>That&rsquo;s the whole point of this shirt.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_nurture',
      subject: '[SHIRT 2/4] Did your shirt arrive?',
      html: wrap(`
        ${banner('shirt_nurture — Stage 1 (Day 12). Goal: get them to enter their number.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Just checking in &mdash; your shirt should be there by now. If you haven&rsquo;t already, take a look at the number inside the collar and enter it here:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">ENTER YOUR NUMBER</a>
        </p>
        <p>There&rsquo;s a real kid on the other side of that number. They&rsquo;re already enrolled at the campus. Your shirt put them there.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_nurture',
      subject: `[SHIRT 3/4] What your $25 did for ${childName}.`,
      html: wrap(`
        ${banner('shirt_nurture — Stage 2 (Day 20). The pivot email — uses child\'s name, makes the sponsorship ask.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>By now you&rsquo;ve probably met ${childName} &mdash; the kid your shirt is connected to. If you haven&rsquo;t yet, <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">here they are</a>.</p>
        <p>Here&rsquo;s what your $25 covered this month: a seat in school, a meal every day, and access to the on-site medical clinic. That&rsquo;s not a metaphor. ${childName} went to class, ate lunch, and had a nurse available if they needed one &mdash; because you showed up.</p>
        <p>Month two is where the relationship starts. $25/month keeps you in ${childName}&rsquo;s life &mdash; letters, photos, a report card at the end of the year, and a real connection to a real kid who knows your name.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">STAY IN ${childName.toUpperCase()}&rsquo;S LIFE &mdash; $25/MO</a>
        </p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_nurture',
      subject: '[SHIRT 4/4] Last one from me on this.',
      html: wrap(`
        ${banner('shirt_nurture — Stage 3 (Day 30). Final nudge — respectful close.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I&rsquo;m not going to keep emailing you about this. You bought a shirt, you met ${childName}, and your first month already made a difference.</p>
        <p>If you want to stay in ${childName}&rsquo;s life &mdash; $25 a month, letters, photos, the whole thing &mdash; <a href="${sponsorUrl}" style="color: #D4A843; font-weight: bold;">the door&rsquo;s open</a>.</p>
        <p>If not, wear the shirt well. It still starts conversations, and that matters too.</p>
        <p>Kevin</p>
      `),
    },
  ];
}

function getSponsorOnboardEmails(): PreviewEmail[] {
  return [
    {
      pipeline: 'sponsor_onboard',
      subject: `[SPONSOR 1/3] You and ${childName} — here's how this works.`,
      html: wrap(`
        ${banner('sponsor_onboard — Stage 0 (Day 3). New sponsor just subscribed. Show them the portal.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>You&rsquo;re officially a sponsor. That means a real kid at the YDO campus in Northern Uganda knows your name — or will soon.</p>
        <p><a href="${childUrl}" style="color: #D4A843; font-weight: bold;">Here&rsquo;s ${childName}&rsquo;s page.</a> That&rsquo;s who your $25/month goes to — school fees, a daily meal, and access to the on-site medical clinic.</p>
        <p>Your sponsor portal is where you&rsquo;ll get updates — photos, letters, report cards as they come in. Bookmark it:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${portalUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">YOUR SPONSOR PORTAL</a>
        </p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'sponsor_onboard',
      subject: `[SPONSOR 2/3] An update on ${childName} is coming.`,
      html: wrap(`
        ${banner('sponsor_onboard — Stage 1 (Day 10). Set expectations for updates, encourage writing back.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Quick note — the YDO team sends sponsor updates from the campus. You&rsquo;ll hear about ${childName} specifically: what they&rsquo;re studying, how they&rsquo;re doing, sometimes a photo or a letter they wrote.</p>
        <p>These come through your portal and by email. The first one usually lands within your first month.</p>
        <p>If you ever want to write back, reply to this email or send a note through the portal. The team reads every one and translates when needed.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'sponsor_onboard',
      subject: '[SPONSOR 3/3] One month in.',
      html: wrap(`
        ${banner('sponsor_onboard — Stage 2 (Day 21). Celebrate the milestone. Ask them to tell one person.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>You&rsquo;ve been a sponsor for about a month now. Here&rsquo;s what that covered: ${childName} went to school every day, ate a meal every day, and had a nurse on campus if they needed one. That&rsquo;s not a pitch — that&rsquo;s what happened because you showed up.</p>
        <p>Two things that help us:</p>
        <p><strong>1. Tell one person.</strong> Not a social media post (unless you want to) — a text to one friend who&rsquo;d get it. &ldquo;I sponsor a kid in Uganda through this org called Be A Number. Here&rsquo;s the site.&rdquo; That&rsquo;s how most of our sponsors find us.</p>
        <p><strong>2. Check your portal.</strong> Updates show up there first. <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">Bookmark it.</a></p>
        <p>Thank you for staying.</p>
        <p>Kevin</p>
      `),
    },
  ];
}

function getDonorConvertEmails(): PreviewEmail[] {
  return [
    {
      pipeline: 'donor_convert',
      subject: '[DONOR 1/3] Where your donation went.',
      html: wrap(`
        ${banner('donor_convert — Stage 0 (Day 5). One-time donor. Close the loop on impact.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Wanted to close the loop on your donation. Here&rsquo;s what it touched: school fees, daily meals, and medical access for children at the YDO campus in Northern Uganda. Not a fund. Not an overhead pool. Specific kids, specific days, specific meals.</p>
        <p>We run lean — one campus, one team on the ground, direct sponsorship. Every dollar goes through the same pipe.</p>
        <p>Thanks for trusting us with it.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'donor_convert',
      subject: "[DONOR 2/3] The part most people don't see.",
      html: wrap(`
        ${banner('donor_convert — Stage 1 (Day 14). Introduce the sponsorship model. Make the relationship tangible.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Most donors give once and move on. Makes sense — there&rsquo;s a lot of noise out there. But there&rsquo;s something different about what we do, and I want to show you.</p>
        <p>Every child at the YDO campus has a number. That number connects to a specific sponsor — someone who funds their seat in school, their daily meal, and their medical care. $25 a month. The sponsor gets letters, photos, report cards. The child knows their sponsor&rsquo;s name.</p>
        <p>It&rsquo;s not abstract. It&rsquo;s a relationship.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}/sponsorship" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">MEET THE KIDS</a>
        </p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'donor_convert',
      subject: '[DONOR 3/3] Last one from me on this.',
      html: wrap(`
        ${banner('donor_convert — Stage 2 (Day 25). Final nudge. Respectful close.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I&rsquo;m not going to keep emailing you about this. Your donation already made a difference and I&rsquo;m grateful for it.</p>
        <p>If you ever want to go deeper — sponsor a specific child for $25/month or grab a shirt that connects you to one by number — <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">the door&rsquo;s open</a>.</p>
        <p>Either way, thanks for showing up when it counted.</p>
        <p>Kevin</p>
      `),
    },
  ];
}

export async function POST(request: NextRequest) {
  const to = 'kevin@beanumber.org';
  const from = { email: process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org', name: 'Kevin at Be A Number' };

  // Allow filtering by pipeline via query param
  const { searchParams } = new URL(request.url);
  const filterPipeline = searchParams.get('pipeline');

  let allEmails: PreviewEmail[] = [];
  if (!filterPipeline || filterPipeline === 'shirt_nurture') {
    allEmails = allEmails.concat(getShirtNurtureEmails());
  }
  if (!filterPipeline || filterPipeline === 'sponsor_onboard') {
    allEmails = allEmails.concat(getSponsorOnboardEmails());
  }
  if (!filterPipeline || filterPipeline === 'donor_convert') {
    allEmails = allEmails.concat(getDonorConvertEmails());
  }

  const results = [];
  for (const email of allEmails) {
    const result = await sendEmail({
      to: { email: to },
      from,
      subject: email.subject,
      html: email.html,
    });
    results.push({ pipeline: email.pipeline, subject: email.subject, success: result.success });
    // Small delay between sends to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  return NextResponse.json({ sent: results });
}

// Also accept GET so the Vercel fetch tool can trigger it
export async function GET(request: NextRequest) {
  return POST(request);
}
