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
// Auth temporarily removed so Kevin can review drip emails in browser.
// TODO: delete this entire file after review is complete.
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
const sponsorCode = 'BAN-2026-001';
const childUrl = `${SITE_URL}/children/${shirtNumber}`;
const portalUrl = `${SITE_URL}/sponsor/login`;

type PreviewEmail = { pipeline: string; subject: string; html: string };

// ── shirt_nurture (4 emails) ────────────────────────────────────────────────

function getShirtNurtureEmails(): PreviewEmail[] {
  const sponsorUrl = `${SITE_URL}/api/sponsor-checkout?number=${shirtNumber}`;
  return [
    {
      pipeline: 'shirt_nurture',
      subject: '[SHIRT 1/4] Quick update on your shirt',
      html: wrap(`
        ${banner('shirt_nurture — Stage 0 (Day 6). Shirt is in transit.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Your shirt should be arriving in the next few days. I make each one by hand (heat press, vinyl, the whole thing), so it was made specifically for you.</p>
        <p>When you get it, look inside the collar. There&rsquo;s a number printed there, and that number belongs to a real child at our campus in Northern Uganda. You can go to <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a>, enter the number, and meet them. You&rsquo;ll see their name, their photo, and a little about their life.</p>
        <p>I hope you love the shirt.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_nurture',
      subject: '[SHIRT 2/4] Did your shirt arrive?',
      html: wrap(`
        ${banner('shirt_nurture — Stage 1 (Day 12). Goal: get them to enter their number.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Just wanted to check in and see if your shirt made it. If it did and you haven&rsquo;t had a chance to check the number yet, no rush at all. But when you&rsquo;re ready, enter it here and you&rsquo;ll meet the child your shirt is connected to.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${SITE_URL}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">ENTER YOUR NUMBER</a>
        </p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_nurture',
      subject: '[SHIRT 3/4] Wanted to tell you about Grace',
      html: wrap(`
        ${banner('shirt_nurture — Stage 2 (Day 20). Uses child name, makes the sponsorship ask.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>The child connected to your shirt is ${childName}. If you haven&rsquo;t met them yet, <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">here&rsquo;s their page</a>.</p>
        <p>Right now, $25 a month covers school fees, two meals a day, and medical care for the children at the campus. That&rsquo;s what sponsorship funds, and it starts the day you sign up.</p>
        <p>If you sponsor ${childName}, you get a direct connection to them. Letters, photos, report cards, and a place to write to them whenever you want.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">SPONSOR ${childName.toUpperCase()} FOR $25/MO</a>
        </p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_nurture',
      subject: '[SHIRT 4/4] Last email from me about this',
      html: wrap(`
        ${banner('shirt_nurture — Stage 3 (Day 30). Final nudge — respectful close.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>This is the last email I&rsquo;ll send you about this, and I&rsquo;ll keep it short.</p>
        <p>The shirts are how most people find us, and sponsorship is how we keep the campus running. $25 a month covers school fees, two meals a day, and medical care for all the children at the campus, and the sponsor gets letters, photos, and a real relationship with a specific kid by name.</p>
        <p>If you want in, you can <a href="${sponsorUrl}" style="color: #D4A843; font-weight: bold;">sponsor ${childName} here</a>. And if not, wear that shirt with pride. You can always come back to <a href="${sponsorUrl}" style="color: #D4A843;">sponsor ${childName}</a> in the future, or grab another design and get matched to a different child, giving them a month in school.</p>
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
      subject: '[SPONSOR 1/3] Your sponsorship is active',
      html: wrap(`
        ${banner('sponsor_onboard — Stage 0 (Day 3). New sponsor. Portal access + code.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Your sponsorship is active, and I wanted to make sure you have everything you need to get started.</p>
        <p>Your $25 a month covers school fees, two meals a day, and medical care for ${childName} at the YDO campus in Northern Uganda. <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">Here&rsquo;s their page.</a> For a lot of the kids on campus, those meals are the only ones they get all day, so this is making a real difference starting right now.</p>
        <p>I built a sponsor portal where you can see updates, photos, and letters as they come in from the campus. To log in, you&rsquo;ll need your email and your sponsor code:</p>
        <div style="background: #FFF8F0; border: 1px solid #e8e0d4; padding: 16px 20px; margin: 16px 0; text-align: center;">
          <p style="color: #999; font-size: 13px; margin: 0 0 4px 0;">Your sponsor code</p>
          <p style="font-size: 22px; color: #0d0d0d; margin: 0; font-weight: bold; letter-spacing: 0.1em; font-family: monospace;">${sponsorCode}</p>
        </div>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${portalUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">LOG IN TO YOUR PORTAL</a>
        </p>
        <p>If you ever want to write to ${childName}, you can do it through the portal or by replying to this email. The YDO team on the ground handles delivery and translation.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'sponsor_onboard',
      subject: '[SPONSOR 2/3] What to expect over the next few weeks',
      html: wrap(`
        ${banner('sponsor_onboard — Stage 1 (Day 10). Set expectations for updates.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Just wanted to give you a heads up on what to expect over the next few weeks.</p>
        <p>The YDO team on the ground in Uganda sends regular updates from the campus. You&rsquo;ll hear about ${childName} specifically: what they&rsquo;re studying, how they&rsquo;re doing in class, sometimes a photo or a handwritten letter. Those updates show up in your portal and by email, and the first one usually comes within your first month.</p>
        <p>If you want to write to ${childName} yourself, go for it. You can do it through the portal or reply to any email. The YDO team reads every note, translates when needed, and makes sure it actually gets to them.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'sponsor_onboard',
      subject: '[SPONSOR 3/3] Checking in after your first month',
      html: wrap(`
        ${banner('sponsor_onboard — Stage 2 (Day 21). One month check-in. Tell one friend.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>You&rsquo;ve been sponsoring for about a month now, so I just wanted to check in and let you know what your $25 covered this month: ${childName} went to school every day, ate breakfast and lunch at the campus every day, and had a nurse available whenever they needed one. Same thing will happen next month because you&rsquo;re still here.</p>
        <p>One thing that really helps us grow: if you know someone who&rsquo;d be into what we do, send them a quick text. It doesn&rsquo;t need to be a whole thing, something like &ldquo;I sponsor a kid in Uganda through this org called Be A Number, you should check it out.&rdquo; That&rsquo;s genuinely how most of our sponsors find us.</p>
        <p>Your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">portal</a> has the latest updates whenever you want to check in.</p>
        <p>Kevin</p>
      `),
    },
  ];
}

// ── donor_convert (3 emails) ────────────────────────────────────────────────

function getDonorConvertEmails(): PreviewEmail[] {
  const sponsorUrl = `${SITE_URL}/sponsorship`;
  return [
    {
      pipeline: 'donor_convert',
      subject: '[DONOR 1/3] Following up on your donation',
      html: wrap(`
        ${banner('donor_convert — Stage 0 (Day 5). One-time donor. Close the loop.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I wanted to follow up and let you know where your donation actually went, because I think that matters.</p>
        <p>It went to the YDO campus in Northern Uganda. One campus, one team on the ground. We use it to cover school fees, meals, and medical care for specific kids by name. We&rsquo;re small on purpose, which means I can tell you exactly where your money ends up.</p>
        <p>Thank you for trusting us with it.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'donor_convert',
      subject: '[DONOR 2/3] A little more about how we work',
      html: wrap(`
        ${banner('donor_convert — Stage 1 (Day 14). Introduce the sponsorship model.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I wanted to tell you a little more about how we work, since you already took a chance on us once.</p>
        <p>Every child at our campus has a number, and that number connects them to one specific sponsor. The sponsor pays $25 a month, which covers school, two meals a day, and medical care. In return, the sponsor gets letters, photos, and report cards from the campus. The child knows their sponsor&rsquo;s name. It&rsquo;s a real relationship between two real people, and that&rsquo;s kind of the whole point of what we built.</p>
        <p>If you want to see the kids, you can <a href="${sponsorUrl}" style="color: #D4A843; font-weight: bold;">meet them here</a>.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${sponsorUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">MEET THE KIDS</a>
        </p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'donor_convert',
      subject: '[DONOR 3/3] Last email from me about this',
      html: wrap(`
        ${banner('donor_convert — Stage 2 (Day 25). Final nudge. Respectful close.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>This is the last email I&rsquo;ll send you about this.</p>
        <p>What you gave went to real kids. It paid for meals and kept them in school. If you ever want to go deeper, whether that&rsquo;s sponsoring a child for $25 a month or picking up a shirt that connects you to one by number, <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">we&rsquo;re always here</a>.</p>
        <p>Thank you again.</p>
        <p>Kevin</p>
      `),
    },
  ];
}

// ── shirt_sponsor (4 emails) ────────────────────────────────────────────────

function getShirtSponsorEmails(): PreviewEmail[] {
  return [
    {
      pipeline: 'shirt_sponsor',
      subject: '[SHIRT+SPONSOR 1/4] Your shirt is being made right now',
      html: wrap(`
        ${banner('shirt_sponsor — Stage 0 (Day 3). Shirt on the way, teases portal. No code yet.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Your shirt is being made right now. I heat-press every one by hand, and yours will ship within the next few days.</p>
        <p>When it arrives, check the tag inside the collar. There&rsquo;s a number on it, and that number belongs to a real child at our campus in Northern Uganda. You&rsquo;ll come back to the site, enter the number, and meet them.</p>
        <p>You also signed up for monthly sponsorship, which means your $25 a month is already covering breakfast and lunch, school fees, and medical care for ${childName}. That started the day you signed up.</p>
        <p>Once you&rsquo;ve gotten your shirt and had a chance to meet your child, I&rsquo;ll send you access to your sponsor portal where you can see updates, photos, and write to them directly. I want you to have that moment with the shirt first.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_sponsor',
      subject: '[SHIRT+SPONSOR 2/4] Did your shirt arrive? (plus something about Grace)',
      html: wrap(`
        ${banner('shirt_sponsor — Stage 1 (Day 8). Shirt arrival check + reveal + sponsor code + portal.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Checking in to see if your shirt made it.</p>
        <p>If it did, you&rsquo;ve already seen the number. That number belongs to <strong>${childName}</strong>. <a href="${childUrl}" style="color: #D4A843; font-weight: bold;">Here&rsquo;s their page</a> if you want to take a look.</p>
        <p>As promised, here&rsquo;s your sponsor portal access. This is where updates, photos, and letters from ${childName} will show up over the coming months:</p>
        <div style="background: #FFF8F0; border: 1px solid #e8e0d4; padding: 16px 20px; margin: 16px 0; text-align: center;">
          <p style="color: #999; font-size: 13px; margin: 0 0 4px 0;">Your sponsor code</p>
          <p style="font-size: 22px; color: #0d0d0d; margin: 0; font-weight: bold; letter-spacing: 0.1em; font-family: monospace;">${sponsorCode}</p>
        </div>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${portalUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">LOG IN TO YOUR PORTAL</a>
        </p>
        <p>You can also write to ${childName} through the portal or by replying to this email. The YDO team on the ground handles delivery and translation.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_sponsor',
      subject: '[SHIRT+SPONSOR 3/4] Your first two weeks as a sponsor',
      html: wrap(`
        ${banner('shirt_sponsor — Stage 2 (Day 15). First month impact.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>You&rsquo;ve been sponsoring for about two weeks now, and I wanted to give you a picture of what that looks like on the ground.</p>
        <p>${childName} had a seat in school every day this month, ate breakfast and lunch at the campus every day, and had a nurse available whenever they needed one. Your $25 is what makes that possible.</p>
        <p>Your first update from the campus should be coming soon. The YDO team sends photos, report cards, and sometimes handwritten letters from the kids, and they show up in your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">portal</a> and by email.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'shirt_sponsor',
      subject: '[SHIRT+SPONSOR 4/4] One month in',
      html: wrap(`
        ${banner('shirt_sponsor — Stage 3 (Day 25). One month. Tell one friend.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>You bought a shirt and signed up to sponsor ${childName} in the same decision, and that decision has been covering school fees, meals, and medical care for a full month now.</p>
        <p>If you know someone who&rsquo;d be into what we do, the best thing you can do is send them a text. Doesn&rsquo;t need to be a big deal, something like &ldquo;I sponsor a kid in Uganda through Be A Number, you should check it out.&rdquo; That&rsquo;s how most of our sponsors find us.</p>
        <p>Your <a href="${portalUrl}" style="color: #D4A843; font-weight: bold;">portal</a> has the latest updates whenever you want to check in.</p>
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
      subject: '[MONTHLY 1/3] Where your monthly donation goes',
      html: wrap(`
        ${banner('monthly_donor — Stage 0 (Day 3). Monthly donor via donate page. Show impact.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I wanted to reach out and let you know where your monthly donation goes.</p>
        <p>It goes to the YDO campus in Northern Uganda. One campus, one team on the ground. We built a school for 380 kids, a medical clinic that has treated more than 700 patients, and vocational programs where 60 women are learning trades. Your gift each month helps cover meals for kids who might not eat otherwise, school fees that keep them in class, and a medical clinic that serves the whole community.</p>
        <p>I&rsquo;ll keep you in the loop on what&rsquo;s happening at the campus.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'monthly_donor',
      subject: '[MONTHLY 2/3] How things work at the campus',
      html: wrap(`
        ${banner('monthly_donor — Stage 1 (Day 12). Explain the one-to-one model.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I wanted to give you a better picture of how things work on the ground, since your monthly gift is part of what makes it all run.</p>
        <p>Every child at the campus has a number, and that number goes on a shirt. When someone buys that shirt or sponsors that child, they get connected one-to-one. The sponsor gets letters, photos, and report cards, and the child knows their sponsor by name. It&rsquo;s not a big faceless program. It&rsquo;s one person and one kid.</p>
        <p>Your monthly gift is what keeps the whole campus going: the meals, the teachers, the clinic. Without monthly donors, none of the one-to-one stuff would work.</p>
        <p>If you want to see the kids your gift is supporting, you can <a href="${SITE_URL}/sponsorship" style="color: #D4A843; font-weight: bold;">meet them here</a>.</p>
        <p>Kevin</p>
      `),
    },
    {
      pipeline: 'monthly_donor',
      subject: '[MONTHLY 3/3] Last email from me in this series',
      html: wrap(`
        ${banner('monthly_donor — Stage 2 (Day 22). Gentle sponsorship intro.')}
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>This is the last email in this series, and I want to be straightforward about why I&rsquo;m sending it.</p>
        <p>Your monthly donation already makes a real difference at the campus. But there&rsquo;s something else we offer that I&rsquo;d feel wrong not telling you about. For $25 a month, you can sponsor a specific child. You&rsquo;d be connected to them by name and number, you&rsquo;d get letters, photos, and report cards from the campus, and they&rsquo;d know who you are.</p>
        <p>If that sounds like something you&rsquo;d want, you can <a href="${SITE_URL}/sponsorship" style="color: #D4A843; font-weight: bold;">meet the kids here</a>. If not, your monthly gift keeps the campus running, and I&rsquo;m grateful for it.</p>
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
