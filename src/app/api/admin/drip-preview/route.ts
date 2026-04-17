/**
 * GET|POST /api/admin/drip-preview
 *
 * Sends all 4 shirt_nurture drip emails to Kevin for copy review.
 * Uses sample data. Not a production endpoint — delete after review.
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

export async function POST(request: NextRequest) {
  const to = 'kevin@beanumber.org';
  const from = { email: process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org', name: 'Kevin at Be A Number' };

  // Sample data for preview
  const firstName = 'Kevin';
  const childName = 'Grace';
  const shirtNumber = 12;
  const childUrl = `${SITE_URL}/children/${shirtNumber}`;
  const sponsorUrl = `${SITE_URL}/sponsorship?child=${shirtNumber}`;

  const emails = [
    {
      subject: `[DRIP PREVIEW 1/4] Your shirt is on its way.`,
      html: wrap(`
        <p style="background: #fff3cd; border: 1px solid #ffc107; padding: 10px 14px; font-size: 13px; color: #856404; margin-bottom: 20px;"><strong>PREVIEW:</strong> This is drip email 2 of 5 (Day 6). The buyer just purchased, shirt is in transit.</p>
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Your shirt should be headed your way. When it arrives, flip the collar and look at the number stamped inside.</p>
        <p>That number is someone&rsquo;s name. Come back to <a href="${SITE_URL}" style="color: #D4A843; font-weight: bold;">beanumber.org</a>, enter it, and meet them.</p>
        <p>That&rsquo;s the whole point of this shirt.</p>
        <p>Kevin</p>
      `),
    },
    {
      subject: `[DRIP PREVIEW 2/4] Did your shirt arrive?`,
      html: wrap(`
        <p style="background: #fff3cd; border: 1px solid #ffc107; padding: 10px 14px; font-size: 13px; color: #856404; margin-bottom: 20px;"><strong>PREVIEW:</strong> This is drip email 3 of 5 (Day 12). Shirt should have arrived. Goal: get them to enter their number.</p>
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
      subject: `[DRIP PREVIEW 3/4] What your $25 did for ${childName}.`,
      html: wrap(`
        <p style="background: #fff3cd; border: 1px solid #ffc107; padding: 10px 14px; font-size: 13px; color: #856404; margin-bottom: 20px;"><strong>PREVIEW:</strong> This is drip email 4 of 5 (Day 20). The pivot email — uses child's real name and makes the sponsorship ask.</p>
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
      subject: `[DRIP PREVIEW 4/4] Last one from me on this.`,
      html: wrap(`
        <p style="background: #fff3cd; border: 1px solid #ffc107; padding: 10px 14px; font-size: 13px; color: #856404; margin-bottom: 20px;"><strong>PREVIEW:</strong> This is drip email 5 of 5 (Day 30). Final nudge — respectful close. After this, they drop into the general monthly newsletter.</p>
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>I&rsquo;m not going to keep emailing you about this. You bought a shirt, you met ${childName}, and your first month already made a difference.</p>
        <p>If you want to stay in ${childName}&rsquo;s life &mdash; $25 a month, letters, photos, the whole thing &mdash; <a href="${sponsorUrl}" style="color: #D4A843; font-weight: bold;">the door&rsquo;s open</a>.</p>
        <p>If not, wear the shirt well. It still starts conversations, and that matters too.</p>
        <p>Kevin</p>
      `),
    },
  ];

  const results = [];
  for (const email of emails) {
    const result = await sendEmail({
      to: { email: to },
      from,
      subject: email.subject,
      html: email.html,
    });
    results.push({ subject: email.subject, success: result.success });
    // Small delay between sends to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  return NextResponse.json({ sent: results });
}

// Also accept GET so the Vercel fetch tool can trigger it
export async function GET(request: NextRequest) {
  return POST(request);
}
