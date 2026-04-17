/**
 * GET|POST /api/admin/drip-preview
 *
 * Sends all drip emails across all 5 pipelines to Kevin for copy review.
 * Uses sample data. Not a production endpoint — delete after review.
 *
 * Query params:
 *   ?pipeline=shirt_nurture   — only send that pipeline's emails
 *   ?pipeline=sponsor_onboard
 *   ?pipeline=donor_convert
 *   ?pipeline=shirt_sponsor
 *   ?pipeline=monthly_donor
 *   (no param = send all 17)
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
const sponsorUrl = `${SITE_URL}/api/sponsor-checkout?number=${shirtNumber}`;
const portalUrl = `${SITE_URL}/sponsor/login`;

type PreviewEmail = { pipeline: string; subject: string; html: string };

// ── shirt_nurture (4 emails) ────────────────────────────────────────────────

function getShirtNurtureEmails(): PreviewEmail[] {
  return [
    {
      pipeline: 'shirt_nurture',
      subject: "[SHIRT 1/4] Your shirt's almost there.",
      html: wrap(`
        ${banner('shirt_nurture — Stage 0 (Day 6). Shirt is in transit.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Your shirt should be arriving soon. I make every one by hand, so yours was pressed specifically for you.</p>
        <p>When it shows up, check the tag inside the collar. There&rsquo;s a number on it. That number belongs to a child at our campus in Northern Uganda. Head to <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a>, enter it, and you&rsquo;ll meet them: their name, their face, their story.</p>
        <p>Talk soon,<br>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_nurture',
      subject: '[SHIRT 2/4] Did your shirt make it?',
      html: wrap(`
        ${banner('shirt_nurture — Stage 1 (Day 12). Goal: get them to enter their number.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Checking in. Did it arrive?</p>
        <p>If so, the number inside the collar is yours. Enter it here and you&rsquo;ll meet the child on the other side:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">ENTER YOUR NUMBER</a>
        </p>
        <p>No rush. Whenever you&rsquo;re ready.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_nurture',
      subject: `[SHIRT 3/4] Something about ${childName}.`,
      html: wrap(`
        ${banner('shirt_nurture — Stage 2 (Day 20). Uses child name, makes the sponsorship ask.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>The child connected to your shirt is ${childName}. If you haven&rsquo;t met them yet, <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">here&rsquo;s their page</a>.</p>
        <p>This past month, ${childName} went to school every day, ate breakfast and lunch at the campus, and had a nurse available if they needed one. That happened because of the people who fund their spot. Right now, that spot costs $25/month.</p>
        <p>For that, you get a direct connection to ${childName}: letters, photos, report cards, and a place to write to them. One person, one kid.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">SPONSOR ${childName.toUpperCase()} &mdash; $25/MO</a>
        </p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_nurture',
      subject: '[SHIRT 4/4] Last email from me on this.',
      html: wrap(`
        ${banner('shirt_nurture — Stage 3 (Day 30). Final nudge — respectful close.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Last one, I promise.</p>
        <p>The shirts are how people find us. Sponsorship is how we keep the campus running. $25/month covers school fees, two meals a day, and medical care for one child. For some of these kids, those two meals are the only ones they get. The sponsor gets letters, photos, and a real connection to that kid by name.</p>
        <p>If you want in: <a href="${sponsorUrl}" style="color: #D4A843; font-weight: bold;">sponsor ${childName} for $25/mo</a>.</p>
        <p>If not, thank you for the shirt. Wear it. It starts conversations, and those conversations find us new sponsors.</p>
        <p>Kevin</p>
      `),
    },
  ];
}

// ── sponsor_onboard (3 emails) ──────────────────────────────────────────────

function getSponsorOnboardEmails(): PreviewEmail[] {
  return [
    {
      pipeline: 'sponsor_onboard',
      subject: `[SPONSOR 1/3] ${childName}'s page is live.`,
      html: wrap(`
        ${banner('sponsor_onboard — Stage 0 (Day 3). New sponsor. Portal access + code.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Your sponsorship is active. Here&rsquo;s what that means right now.</p>
        <p>$25/month covers school fees, two meals a day, and medical care for ${childName} at the YDO campus in Northern Uganda. <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">Here&rsquo;s their page.</a> For some of the kids on campus, those two meals are the only ones they get. That&rsquo;s where your money goes.</p>
        <p>I built a sponsor portal where you can see updates, photos, and letters as they come in. To log in, you need your email and your sponsor code:</p>
        <div style="background: #FFF8F0; border: 1px solid #e8e0d4; padding: 16px 20px; margin: 16px 0; text-align: center;">
          <p style="color: #999; font-size: 13px; margin: 0 0 4px 0;">Your sponsor code</p>
          <p style="font-size: 22px; color: #0d0d0d; margin: 0; font-weight: bold; letter-spacing: 0.1em; font-family: monospace;">BAN-2026-001</p>
        </div>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${portalUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">LOG IN TO YOUR PORTAL</a>
        </p>
        <p>You can write to ${childName} from the portal or by replying to this email. The YDO team on the ground delivers everything and translates when needed.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'sponsor_onboard',
      subject: `[SPONSOR 2/3] Something coming from ${childName}.`,
      html: wrap(`
        ${banner('sponsor_onboard — Stage 1 (Day 10). Set expectations for updates.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>The YDO team on the ground sends sponsor updates from the campus. You&rsquo;ll hear about ${childName} specifically: what subjects they&rsquo;re studying, how they&rsquo;re doing, sometimes a photo or a handwritten letter.</p>
        <p>These show up in your portal and by email. The first one usually lands within your first month.</p>
        <p>If you want to write first, you can. Reply to this email or use the portal. The YDO team reads every note and translates when needed. ${childName} will actually receive it.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'sponsor_onboard',
      subject: '[SPONSOR 3/3] One month in.',
      html: wrap(`
        ${banner('sponsor_onboard — Stage 2 (Day 21). One month check-in. Tell one friend.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>You&rsquo;ve been here about a month. Here&rsquo;s what your $25 did: ${childName} went to school every day, ate breakfast and lunch at the campus, and had a nurse available if they needed one.</p>
        <p>That&rsquo;ll happen again next month because you&rsquo;re still here.</p>
        <p>One thing that helps us more than anything: tell one person. Not a social post. One friend, one text. &ldquo;I sponsor a kid in Uganda through Be A Number. Check it out.&rdquo; That&rsquo;s how most of our sponsors find us.</p>
        <p>Your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">portal</a> has the latest updates.</p>
        <p>Kevin</p>
      `),
    },
  ];
}

// ── donor_convert (3 emails) ────────────────────────────────────────────────

function getDonorConvertEmails(): PreviewEmail[] {
  return [
    {
      pipeline: 'donor_convert',
      subject: '[DONOR 1/3] Wanted you to know where this went.',
      html: wrap(`
        ${banner('donor_convert — Stage 0 (Day 5). One-time donor. Close the loop.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Your donation went to the YDO campus in Northern Uganda. One campus, one team on the ground. It funds school fees, two meals a day, and medical care for specific children by name.</p>
        <p>We&rsquo;re small on purpose. Every dollar goes through the same door, and I know exactly where yours went.</p>
        <p>Thank you for trusting us with it.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'donor_convert',
      subject: '[DONOR 2/3] The kids behind the numbers.',
      html: wrap(`
        ${banner('donor_convert — Stage 1 (Day 14). Introduce the sponsorship model.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Every child at our campus has a number. That number connects them to one sponsor. $25/month covers school, two meals a day, and medical care. The sponsor gets letters, photos, and report cards. The child knows their sponsor&rsquo;s name.</p>
        <p>That&rsquo;s the whole model. One person, one kid, and you can see exactly where the money goes.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}/sponsorship" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">MEET THE KIDS</a>
        </p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'donor_convert',
      subject: '[DONOR 3/3] Last email from me on this.',
      html: wrap(`
        ${banner('donor_convert — Stage 2 (Day 25). Final nudge. Respectful close.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Last one.</p>
        <p>What you gave fed kids and kept them in school. If you ever want to go deeper &mdash; sponsor a child for $25/month, or grab a shirt that connects you to one by number &mdash; <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">we&rsquo;re here</a>.</p>
        <p>Either way, thank you.</p>
        <p>God bless,<br>Kevin</p>
      `),
    },
  ];
}

// ── shirt_sponsor (4 emails) ────────────────────────────────────────────────

function getShirtSponsorEmails(): PreviewEmail[] {
  return [
    {
      pipeline: 'shirt_sponsor',
      subject: `[SHIRT+SPONSOR 1/4] Your shirt and ${childName} are both waiting for you.`,
      html: wrap(`
        ${banner('shirt_sponsor — Stage 0 (Day 3). Shirt on the way, teases portal. No code yet.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I&rsquo;m heat-pressing your shirt right now. Every Be A Number shirt is made by hand &mdash; just me, an iron, and a lot of vinyl &mdash; and yours will ship within the next few days.</p>
        <p>When it arrives, check the tag. There&rsquo;s a number on it, and that number belongs to a real child at our campus in Northern Uganda. That&rsquo;s your child. You&rsquo;ll come back to the site, enter the number, and meet them.</p>
        <p>You also signed up for monthly sponsorship, which means your $25/month covers breakfast and lunch, school fees, and medical care for ${childName} starting right now. That&rsquo;s already happening.</p>
        <p>Once you&rsquo;ve opened your shirt and met your child, I&rsquo;ll send you access to your sponsor portal &mdash; a spot where you can see updates, photos, and write to them directly. I want you to have that moment with the shirt first.</p>
        <p>More soon.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_sponsor',
      subject: `[SHIRT+SPONSOR 2/4] Quick question (and something about ${childName}).`,
      html: wrap(`
        ${banner('shirt_sponsor — Stage 1 (Day 8). Shirt arrival check + reveal + sponsor code + portal.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Just checking &mdash; did your shirt arrive yet?</p>
        <p>If it did, you&rsquo;ve seen the number. That number belongs to <strong>${childName}</strong>. <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">Here&rsquo;s their page.</a> Take a look when you get a minute &mdash; that&rsquo;s the kid you&rsquo;re keeping in school.</p>
        <p>As promised, here&rsquo;s your sponsor portal access. This is where updates, photos, and letters from ${childName} will show up over the coming months:</p>
        <div style="background: #FFF8F0; border: 1px solid #e8e0d4; padding: 16px 20px; margin: 16px 0; text-align: center;">
          <p style="color: #999; font-size: 13px; margin: 0 0 4px 0;">Your sponsor code</p>
          <p style="font-size: 22px; color: #0d0d0d; margin: 0; font-weight: bold; letter-spacing: 0.1em; font-family: monospace;">BAN-2026-001</p>
        </div>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${portalUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">LOG IN TO YOUR PORTAL</a>
        </p>
        <p>You can also write to ${childName} from the portal or by replying to this email. I relay everything through the YDO team on the ground.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_sponsor',
      subject: "[SHIRT+SPONSOR 3/4] Here's what your first month did.",
      html: wrap(`
        ${banner('shirt_sponsor — Stage 2 (Day 15). First month impact.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Two weeks in. Here&rsquo;s what happened on the ground.</p>
        <p>${childName} had a seat in school every day. Ate breakfast and lunch every day. Had a nurse on campus if they needed one. That&rsquo;s your $25 at work.</p>
        <p>Your first update from the campus is coming soon &mdash; photos, report cards, sometimes a handwritten letter. They show up in your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">portal</a> and by email.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_sponsor',
      subject: '[SHIRT+SPONSOR 4/4] Quick check-in.',
      html: wrap(`
        ${banner('shirt_sponsor — Stage 3 (Day 25). One month. Tell one friend.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>You bought a shirt and signed up to sponsor ${childName} in the same decision. That covers school fees, two meals a day, and medical care &mdash; and it&rsquo;s already been running for a month.</p>
        <p>One thing that helps us: tell one friend. One text. &ldquo;I sponsor a kid in Uganda through Be A Number.&rdquo; That&rsquo;s how most of our sponsors find us.</p>
        <p>If you haven&rsquo;t checked your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">portal</a> lately, updates show up there first.</p>
        <p>Kevin</p>
      `),
    },
  ];
}

// ── monthly_donor (3 emails) ────────────────────────────────────────────────

function getMonthlyDonorEmails(): PreviewEmail[] {
  return [
    {
      pipeline: 'monthly_donor',
      subject: "[MONTHLY 1/3] Here's where your monthly gift goes.",
      html: wrap(`
        ${banner('monthly_donor — Stage 0 (Day 3). Monthly donor via donate page. Show impact.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Your monthly donation goes to the YDO campus in Northern Uganda. One campus, one team on the ground: 380 kids in school, 700+ patients through the clinic, 60 women in vocational training.</p>
        <p>Each month, your gift covers meals for kids who might not eat otherwise, school fees that keep them in class, and a medical clinic that serves the whole community.</p>
        <p>I&rsquo;ll keep you posted on what&rsquo;s happening on the ground.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'monthly_donor',
      subject: '[MONTHLY 2/3] How it works on the ground.',
      html: wrap(`
        ${banner('monthly_donor — Stage 1 (Day 12). Explain the one-to-one model.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Every child at the campus has a number. That number goes on a shirt, and when someone buys that shirt or sponsors that child, they&rsquo;re connected one-to-one. The sponsor gets letters, photos, and report cards. The child knows their sponsor by name.</p>
        <p>Your monthly gift is what keeps the whole campus running &mdash; the meals, the teachers, the clinic. Without monthly donors, none of the one-to-one connections work.</p>
        <p>If you want to see the kids: <a href="${SITE_URL}/children" style="color: #D4A843; font-weight: bold;">here they are</a>. Real names, real faces.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'monthly_donor',
      subject: '[MONTHLY 3/3] Last one from me.',
      html: wrap(`
        ${banner('monthly_donor — Stage 2 (Day 22). Gentle sponsorship intro.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Last email in this series. I want to mention one thing before I go.</p>
        <p>For $25/month, you can sponsor a specific child. Connected by name and number. You get letters, photos, and report cards from the campus. They know who you are.</p>
        <p>If that sounds right: <a href="${SITE_URL}/sponsorship" style="color: #D4A843; font-weight: bold;">meet the kids here</a>.</p>
        <p>If not, your monthly gift keeps the campus running, and that matters.</p>
        <p>God bless,<br>Kevin</p>
      `),
    },
  ];
}

// ── Handler ─────────────────────────────────────────────────────────────────

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
  if (!filterPipeline || filterPipeline === 'shirt_sponsor') {
    allEmails = allEmails.concat(getShirtSponsorEmails());
  }
  if (!filterPipeline || filterPipeline === 'monthly_donor') {
    allEmails = allEmails.concat(getMonthlyDonorEmails());
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
