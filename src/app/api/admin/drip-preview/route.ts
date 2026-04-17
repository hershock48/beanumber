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
const portalUrl = `${SITE_URL}/sponsor/login`;

type PreviewEmail = { pipeline: string; subject: string; html: string };

function getShirtNurtureEmails(): PreviewEmail[] {
  return [
    {
      pipeline: 'shirt_nurture',
      subject: '[SHIRT 1/4] Your shirt is on its way.',
      html: wrap(`
        ${banner('shirt_nurture — Stage 0 (Day 6). Shirt is in transit.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I wanted to give you a heads up that your shirt should be arriving soon. I actually make these by hand, so yours was cut and pressed specifically for you.</p>
        <p>When it shows up, flip the collar. There&rsquo;s a number stamped inside. That number belongs to a real child at our campus in Northern Uganda. Their name, their face, their story. Head over to <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a> and enter it when you&rsquo;re ready.</p>
        <p>I think that moment is going to stick with you.</p>
        <p>Talk soon,<br>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_nurture',
      subject: '[SHIRT 2/4] Quick question for you.',
      html: wrap(`
        ${banner('shirt_nurture — Stage 1 (Day 12). Goal: get them to enter their number.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Did your shirt make it? I always get a little anxious until I know they&rsquo;ve landed safely.</p>
        <p>If it&rsquo;s there, I hope you&rsquo;ve had a chance to check the number inside the collar. If not, no rush. But when you do, enter it here and you&rsquo;ll meet the child behind your number:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">ENTER YOUR NUMBER</a>
        </p>
        <p>That&rsquo;s the part of this that I love the most. You bought a shirt, but there&rsquo;s a kid on the other side of it who&rsquo;s already enrolled at the campus because of you.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_nurture',
      subject: `[SHIRT 3/4] I wanted to tell you about ${childName}.`,
      html: wrap(`
        ${banner('shirt_nurture — Stage 2 (Day 20). The pivot email — uses child\'s name, makes the sponsorship ask.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I wanted to circle back to you about ${childName}, the child connected to your shirt. If you haven&rsquo;t met them yet, <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">take a look</a>. I think you&rsquo;ll be glad you did.</p>
        <p>Here&rsquo;s what I can tell you: this past month, ${childName} had a seat in school every day. They ate a full meal every day. And they had a nurse on campus if they needed one. That&rsquo;s real, and it happened because people like you showed up.</p>
        <p>Here&rsquo;s the thing I keep coming back to: $25 a month is what it costs to keep ${childName} in that seat. To keep the meals coming. To keep the clinic staffed. And for that $25, you don&rsquo;t get a generic thank-you. You get letters. Photos. Report cards. A real connection to ${childName} specifically.</p>
        <p>If that sounds like something you want to be part of, I&rsquo;d love to have you.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">SPONSOR ${childName.toUpperCase()} FOR $25/MO</a>
        </p>
        <p>Either way, thank you for what you&rsquo;ve already done. It mattered.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_nurture',
      subject: '[SHIRT 4/4] One last thing.',
      html: wrap(`
        ${banner('shirt_nurture — Stage 3 (Day 30). Final nudge — respectful close.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>This is the last email I&rsquo;m going to send you about this, and I want to be straight with you about why I&rsquo;m sending it at all.</p>
        <p>I started Be A Number because I met these kids and couldn&rsquo;t walk away. ${childName} is one of them. The shirts are how most people find us, but sponsorship is how we actually keep the doors open. $25 a month keeps a child in school, fed, and cared for. And the sponsor gets to be part of that child&rsquo;s life in a way that I think is pretty rare.</p>
        <p>If that&rsquo;s something you want to do, <a href="${sponsorUrl}" style="color: #D4A843; font-weight: bold;">I&rsquo;d be honored</a>. If not, I genuinely appreciate you buying the shirt. Wear it well. It starts conversations, and those conversations have changed kids&rsquo; lives before.</p>
        <p>Thank you for being part of this, ${firstName}.</p>
        <p>Kevin</p>
      `),
    },
  ];
}

function getSponsorOnboardEmails(): PreviewEmail[] {
  return [
    {
      pipeline: 'sponsor_onboard',
      subject: `[SPONSOR 1/3] ${childName} is waiting for you.`,
      html: wrap(`
        ${banner('sponsor_onboard — Stage 0 (Day 3). New sponsor just subscribed. Show them the portal.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I&rsquo;m so glad you&rsquo;re here. I mean that. Every new sponsor changes what&rsquo;s possible for us, and it changes everything for one specific kid.</p>
        <p>${childName} is the child your sponsorship supports. <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">Here&rsquo;s their page.</a> Your $25/month covers their school fees, a daily meal, and access to the medical clinic on campus. That&rsquo;s not a summary. That&rsquo;s literally where the money goes.</p>
        <p>I set up a sponsor portal where you&rsquo;ll be able to see updates, photos, and letters as they come in from the campus. I&rsquo;d recommend bookmarking it:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${portalUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">YOUR SPONSOR PORTAL</a>
        </p>
        <p>If you ever have questions or want to send a message to ${childName}, reply to this email. I read every one.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'sponsor_onboard',
      subject: `[SPONSOR 2/3] Something coming from ${childName}.`,
      html: wrap(`
        ${banner('sponsor_onboard — Stage 1 (Day 10). Set expectations for updates, encourage writing back.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I wanted to let you know what to expect over the next few weeks. The YDO team on the ground in Uganda sends sponsor updates from the campus. You&rsquo;ll hear about ${childName} specifically: what subjects they&rsquo;re studying, how they&rsquo;re doing in class, sometimes a photo or a handwritten letter.</p>
        <p>These show up in your portal and by email. The first one usually lands within your first month, and I always love hearing from sponsors when they get theirs. It makes the whole thing feel different when you&rsquo;re reading words from an actual kid who knows your name.</p>
        <p>And if you want to write back? You can. The YDO team reads every note sponsors send and translates when needed. ${childName} will actually receive it.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'sponsor_onboard',
      subject: '[SPONSOR 3/3] Thank you for staying.',
      html: wrap(`
        ${banner('sponsor_onboard — Stage 2 (Day 21). Celebrate the milestone. Ask them to tell one person.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>You&rsquo;ve been a sponsor for about a month now, and I wanted to take a second to say something I don&rsquo;t say enough: thank you for not leaving.</p>
        <p>That might sound weird, but the truth is, a lot of people sign up for things and quietly cancel. You didn&rsquo;t. And because you didn&rsquo;t, ${childName} went to school every day this month, ate a real meal every day, and had a nurse on campus every day. That&rsquo;s not a pitch. That is literally what your $25 did.</p>
        <p>One thing that really helps us: if you know one person who&rsquo;d get what we do, send them a text. Not a social media blast. One friend. &ldquo;Hey, I sponsor a kid in Uganda through this org called Be A Number. Check it out.&rdquo; That&rsquo;s how most of our sponsors find us.</p>
        <p>And if you haven&rsquo;t checked your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">sponsor portal</a> lately, updates show up there first.</p>
        <p>Grateful for you,<br>Kevin</p>
      `),
    },
  ];
}

function getDonorConvertEmails(): PreviewEmail[] {
  return [
    {
      pipeline: 'donor_convert',
      subject: '[DONOR 1/3] Wanted you to know where this went.',
      html: wrap(`
        ${banner('donor_convert — Stage 0 (Day 5). One-time donor. Close the loop on impact.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I know you probably get a lot of donation receipts and never hear anything again. I didn&rsquo;t want to do that to you.</p>
        <p>Your donation went to the YDO campus in Northern Uganda, where we fund school fees, daily meals, and medical care for specific children. Not a general fund. Not overhead. Real kids, real meals, real school days.</p>
        <p>We&rsquo;re small on purpose. One campus, one team on the ground, and a model where every dollar goes through the same door. I run this myself, and I take it personally when someone trusts us with their money.</p>
        <p>So thank you. I wanted you to know it landed somewhere real.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'donor_convert',
      subject: "[DONOR 2/3] Can I show you something?",
      html: wrap(`
        ${banner('donor_convert — Stage 1 (Day 14). Introduce the sponsorship model. Make the relationship tangible.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I&rsquo;ve been thinking about something, and I wanted to share it with you because you already showed up for these kids once.</p>
        <p>At our campus, every child has a number. That number connects them to a specific sponsor. One person, one child. The sponsor pays $25 a month, and that covers school, meals, and medical care. In return, the sponsor gets letters, photos, and report cards. The child knows their sponsor&rsquo;s name. It&rsquo;s not abstract. It&rsquo;s a real relationship between two real people.</p>
        <p>I built Be A Number around that idea because I think most of us want to help but don&rsquo;t trust where the money goes. This way, you know exactly where it goes. You can see it.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}/sponsorship" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">MEET THE KIDS</a>
        </p>
        <p>No pressure at all. I&rsquo;m grateful for what you already gave.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'donor_convert',
      subject: "[DONOR 3/3] Last thing, then I'll leave you alone.",
      html: wrap(`
        ${banner('donor_convert — Stage 2 (Day 25). Final nudge. Respectful close.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I promise this is the last time I&rsquo;m going to email you about this. I don&rsquo;t want to be that guy.</p>
        <p>But I do want to say one more time: what you gave mattered. It fed kids. It kept them in school. And if you ever feel pulled to go deeper, whether that&rsquo;s sponsoring a child for $25 a month or grabbing a shirt that connects you to one by number, <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">we&rsquo;re here</a>.</p>
        <p>Either way, you&rsquo;re part of this story now, and I&rsquo;m thankful for that.</p>
        <p>God bless,<br>Kevin</p>
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
