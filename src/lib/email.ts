/**
 * Email Service
 * Handles all email sending via SendGrid or Gmail
 *
 * This module follows the WAT architecture pattern:
 * - Returns structured results { success, data?, error? }
 * - Never throws unhandled exceptions
 * - Logs all operations
 */

import { logger } from './logger';
import { getEmailConfig } from './env';
import { sendEmailViaGmail, isGmailConfigured, GmailSendResult } from './gmail';
import { buildUnsubscribeUrl } from './unsubscribe-token';

// ============================================================================
// TYPES
// ============================================================================

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailOptions {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  html: string;
  text?: string;
  from?: EmailRecipient;
  replyTo?: EmailRecipient;
  /**
   * Extra MIME headers. Currently used for `List-Unsubscribe` and
   * `List-Unsubscribe-Post: List-Unsubscribe=One-Click` on newsletter
   * sends (RFC 8058).
   */
  headers?: Record<string, string>;
  /**
   * Send as plain text only (no HTML, no multipart MIME).
   * Use for carrier email-to-SMS gateways.
   */
  plainTextOnly?: boolean;
}

export interface EmailSendResult {
  success: boolean;
  data?: {
    messageId?: string;
    provider: 'gmail' | 'sendgrid' | 'disabled';
  };
  error?: string;
}

/**
 * Send email via SendGrid or Gmail (auto-detects which is configured)
 *
 * @param options - Email sending options
 * @returns Structured result with success/failure and data/error
 *
 * @example
 * const result = await sendEmail({
 *   to: { email: 'user@example.com', name: 'User' },
 *   subject: 'Hello',
 *   html: '<p>Hello World</p>'
 * });
 * if (result.success) {
 *   console.log('Sent via:', result.data?.provider);
 * } else {
 *   console.error('Failed:', result.error);
 * }
 */
export async function sendEmail(options: EmailOptions): Promise<EmailSendResult> {
  const config = getEmailConfig();

  if (!config.enabled) {
    logger.info('Email sending disabled in environment', {
      to: Array.isArray(options.to) ? options.to.map(r => r.email) : options.to.email,
      subject: options.subject,
    });
    return {
      success: true,
      data: {
        provider: 'disabled',
      },
    };
  }

  // Use Gmail if configured, otherwise fall back to SendGrid
  if (isGmailConfigured()) {
    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    const fromAddress = options.from?.email || config.fromEmail;
    const replyToAddress = options.replyTo?.email;

    const result = await sendEmailViaGmail({
      to: recipients.map(r => r.email),
      from: fromAddress,
      subject: options.subject,
      html: options.html,
      text: options.text || stripHtml(options.html),
      replyTo: replyToAddress,
      headers: options.headers,
      plainTextOnly: options.plainTextOnly,
    });

    return result;
  }

  // Fall back to SendGrid
  try {
    // Lazy load SendGrid to avoid initialization errors if API key is missing
    const sgMail = (await import('@sendgrid/mail')).default;
    sgMail.setApiKey(config.sendgridApiKey);

    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    const fromAddress = options.from || {
      email: config.fromEmail,
      name: config.fromName,
    };

    const message = {
      to: recipients,
      from: fromAddress,
      replyTo: options.replyTo,
      subject: options.subject,
      text: options.text || stripHtml(options.html),
      html: options.html,
      // SendGrid passes `headers` through to the recipient as custom
      // MIME headers. Used for List-Unsubscribe on newsletters.
      ...(options.headers ? { headers: options.headers } : {}),
    };

    const response = await sgMail.send(message);

    logger.info('Email sent successfully via SendGrid', {
      to: recipients.map(r => logger.maskEmail(r.email)),
      subject: options.subject,
      statusCode: response[0]?.statusCode,
    });

    return {
      success: true,
      data: {
        provider: 'sendgrid',
      },
    };
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { body?: unknown } };
    const recipients = Array.isArray(options.to) ? options.to : [options.to];

    logger.error('Failed to send email via SendGrid', {
      to: recipients.map(r => logger.maskEmail(r.email)),
      subject: options.subject,
      error: err.message,
      response: err.response?.body,
    });

    return {
      success: false,
      error: err.message || 'Failed to send email via SendGrid.',
    };
  }
}

// ============================================================================
// SHARED EMAIL WRAPPER
// Matches the drip email style: Georgia serif, 560px, cream/gold/sand.
// ============================================================================

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

function wrapTransactionalEmail(body: string): string {
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

// ============================================================================
// TEMPLATE FUNCTIONS
// ============================================================================

/**
 * Send welcome email to new sponsor
 */
export async function sendSponsorWelcomeEmail(
  sponsorEmail: string,
  sponsorName: string,
  childName: string,
  sponsorCode: string,
  shirtNumber?: number | null
): Promise<EmailSendResult> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
  const firstName = (sponsorName || 'Friend').trim().split(/\s+/)[0] || 'Friend';
  // sponsorCode is retained on the record for internal lookup, but we don't
  // show it to the sponsor. The kid's page is their home base; the browser
  // remembers them, and recovery is an email to Kevin.
  void sponsorCode;

  // When we know the shirt number, link straight to the kid's page; otherwise
  // point at the homepage and tell them to enter the number.
  const hasNumber = typeof shirtNumber === 'number';
  const childUrl = hasNumber ? `${siteUrl}/children/${shirtNumber}` : siteUrl;
  const childUrlLabel = hasNumber ? `beanumber.org/${shirtNumber}` : 'beanumber.org';
  const pageLine = hasNumber
    ? `<p><strong>${childName}'s page is at <a href="${childUrl}" style="color: #D4A843;">${childUrlLabel}</a>.</strong> Bookmark it. That's where photos, updates, and letters from the campus show up over the year, and where you can pick up gear with their number on it. Your browser remembers you, so most of the time you'll just land on their page when you visit.</p>`
    : `<p><strong>${childName}'s page lives at <a href="${childUrl}" style="color: #D4A843;">${childUrlLabel}</a></strong> — enter their number and you'll land right on it. Bookmark it. That's where photos, updates, and letters from the campus show up over the year. Your browser remembers you, so most of the time you'll just land on their page when you visit.</p>`;

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">Hey ${firstName},</p>

    <p>Your sponsorship of ${childName} is active. That means ${childName} goes to school at the YDO campus, eats two meals a day, and has the on-site clinic when they need it.</p>

    ${pageLine}

    <p>You'll also get a monthly campus newsletter from our team in Northern Uganda, photos of ${childName} every few months, a handwritten letter from them once a year, and a year-end report card.</p>

    <p>If you ever can't get back to their page, or you want to write back, change your monthly, or ask anything at all, reply to this email or write me at <a href="mailto:Kevin@beanumber.org" style="color: #D4A843;">Kevin@beanumber.org</a>. I read every one.</p>

    <p>Kevin</p>
  `);

  return sendEmail({
    to: { email: sponsorEmail, name: sponsorName },
    subject: `Your sponsorship of ${childName} is active`,
    html,
  });
}

/**
 * Send campus newsletter to one sponsor.
 *
 * The newsletter is the monthly "here's what's happening on campus"
 * email — NOT child-specific. It goes to every active sponsor, including
 * those whose reveal is still pending, so the content must never name
 * a specific child. The only merge tag we substitute per-recipient is
 * {{sponsorFirstName}}, which the admin can drop into their HTML.
 *
 * The raw body comes from the Newsletters table in Airtable and is
 * treated as trusted HTML. Kevin writes it himself — we are not
 * letting user-supplied content flow through here.
 */
export async function sendCampusNewsletterEmail(params: {
  sponsorEmail: string;
  sponsorName: string;
  subject: string;
  bodyHtml: string;
  heroPhotoUrl?: string;
}): Promise<EmailSendResult> {
  const { sponsorEmail, sponsorName, subject, bodyHtml, heroPhotoUrl } = params;

  const firstName = (sponsorName || 'Friend').trim().split(/\s+/)[0] || 'Friend';

  // Substitute merge tags in the admin-authored body.
  const merged = bodyHtml
    .replace(/\{\{\s*sponsorFirstName\s*\}\}/g, escapeHtml(firstName))
    .replace(/\{\{\s*sponsorName\s*\}\}/g, escapeHtml(sponsorName || 'Friend'));

  const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'}/sponsor/login`;
  // Signed, one-click unsubscribe target. RFC 8058 + Gmail bulk sender
  // requirements both expect this to be a real, verifiable link and not
  // a page that asks the recipient to log in first.
  const unsubscribeUrl = buildUnsubscribeUrl(sponsorEmail);

  const heroBlock = heroPhotoUrl
    ? `<img src="${escapeAttr(heroPhotoUrl)}" alt="From the campus" style="display:block;width:100%;max-width:560px;height:auto;border-radius:8px;margin:0 0 24px 0;">`
    : '';

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#faf8f3;font-family:Georgia,'Times New Roman',serif;color:#2a2a2a;">
    <div style="max-width:600px;margin:0 auto;padding:32px 24px;background-color:#ffffff;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:12px;letter-spacing:0.2em;color:#999;text-transform:uppercase;">From the campus</div>
        <div style="font-size:14px;color:#666;margin-top:6px;">Be A Number &middot; Monthly Newsletter</div>
      </div>
      ${heroBlock}
      <div style="font-size:17px;line-height:1.7;color:#2a2a2a;">
        ${merged}
      </div>
      <hr style="border:none;border-top:1px solid #e8e0d4;margin:32px 0;">
      <p style="font-size:14px;color:#666;line-height:1.6;">
        You're receiving this because you're a Be A Number sponsor.
        <a href="${portalUrl}" style="color:#D4A843;">Visit your portal</a> to see updates about your child, or
        <a href="${unsubscribeUrl}" style="color:#999;">manage your emails</a>.
      </p>
      <p style="font-size:12px;color:#999;text-align:center;margin-top:24px;">
        Be A Number, International &middot; 501(c)(3) Nonprofit<br>
        <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'}" style="color:#D4A843;">beanumber.org</a>
      </p>
    </div>
  </body>
</html>`;

  return sendEmail({
    to: { email: sponsorEmail, name: sponsorName },
    subject,
    html,
    // RFC 8058 one-click unsubscribe headers.
    // - `List-Unsubscribe` wraps the URL in angle brackets (can also include
    //    a mailto: fallback; we don't ship one yet — the HTTP URL is enough
    //    for every major inbox provider in 2026).
    // - `List-Unsubscribe-Post` tells the client "this is a one-click URL,
    //    you can POST to it without my involvement." Required for Gmail to
    //    show the inbox-level "Unsubscribe" button on bulk mail.
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/**
 * Send a SHORT notification email — the new monthly-newsletter
 * delivery model. We no longer ship the full newsletter body to every
 * sponsor's inbox; the body lives on /[number] for each kid they
 * sponsor. This email tells them the newsletter is up, gives them
 * a teaser (first paragraph), and links to the kid page(s) where they
 * can read the full thing.
 *
 * One email per sponsor (deduped by email). When a sponsor has
 * multiple kids, all kid links are listed in the email body.
 */
export async function sendNewsletterNotificationEmail(params: {
  sponsorEmail: string;
  sponsorName: string;
  subject: string;            // newsletter subject — used as email subject too
  teaser: string;             // first paragraph of the newsletter body, plain text
  kids: Array<{ firstName: string; shirtNumber: number }>;
  heroPhotoUrl?: string;
}): Promise<EmailSendResult> {
  const { sponsorEmail, sponsorName, subject, teaser, kids, heroPhotoUrl } = params;
  const firstName = (sponsorName || 'Friend').trim().split(/\s+/)[0] || 'Friend';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

  // Build the per-kid link list. Most sponsors will have one entry.
  // Multi-kid sponsors get the full list — one click per relationship.
  const kidLines = kids
    .filter(k => typeof k.shirtNumber === 'number')
    .map(k => {
      const url = `${siteUrl}/children/${k.shirtNumber}`;
      const label = `beanumber.org/${k.shirtNumber}`;
      const name = escapeHtml(k.firstName || `kid #${k.shirtNumber}`);
      return `<p style="margin: 8px 0;"><a href="${url}" style="color: #D4A843; font-weight: bold;">Read on ${name}&rsquo;s page &middot; ${label}</a></p>`;
    })
    .join('');

  const heroBlock = heroPhotoUrl
    ? `<img src="${escapeAttr(heroPhotoUrl)}" alt="From the campus" style="display:block;width:100%;max-width:560px;height:auto;border-radius:4px;margin:0 0 24px 0;">`
    : '';

  const teaserBlock = teaser
    ? `<p style="color: #555; font-style: italic; border-left: 3px solid #D4A843; padding-left: 16px; margin: 24px 0;">${escapeHtml(teaser)}</p>`
    : '';

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">Hey ${escapeHtml(firstName)},</p>

    <p>The latest campus newsletter just went up &mdash; <strong>${escapeHtml(subject)}</strong>.</p>

    ${heroBlock}

    ${teaserBlock}

    <p>Read the rest on your kid${kids.length === 1 ? "&rsquo;s" : "s&rsquo;"} page:</p>

    ${kidLines}

    <p style="margin-top: 24px; font-size: 14px; color: #888;">Reply to this email if anything&rsquo;s not loading or you want to write back to the campus &mdash; I read every one.</p>

    <p>Kevin</p>
  `);

  return sendEmail({
    to: { email: sponsorEmail, name: sponsorName },
    subject,
    html,
  });
}

/**
 * Newsletter notification for SHIRT BUYERS who haven't sponsored
 * monthly yet. They have a shirt with a number on the back, so the
 * ask is direct: type your number at beanumber.org and the
 * newsletter is there waiting on the kid's page that matches.
 *
 * Under the May 2026 rewrite, the newsletter body lives on every
 * kid's /[number] page as a public feed. Sponsors get a direct
 * link to their kid; shirt buyers get the "type your number"
 * instruction; legacy donors (no shirt) get pointed at /news
 * instead via a separate variant.
 */
export async function sendNewsletterNotificationEmailForNonSponsor(params: {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  teaser: string;
  heroPhotoUrl?: string;
}): Promise<EmailSendResult> {
  const { recipientEmail, recipientName, subject, teaser, heroPhotoUrl } = params;
  const firstName = (recipientName || 'Friend').trim().split(/\s+/)[0] || 'Friend';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

  const heroBlock = heroPhotoUrl
    ? `<img src="${escapeAttr(heroPhotoUrl)}" alt="From the campus" style="display:block;width:100%;max-width:560px;height:auto;border-radius:4px;margin:0 0 24px 0;">`
    : '';

  const teaserBlock = teaser
    ? `<p style="color: #555; font-style: italic; border-left: 3px solid #D4A843; padding-left: 16px; margin: 24px 0;">${escapeHtml(teaser)}</p>`
    : '';

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">Hey ${escapeHtml(firstName)},</p>

    <p>The latest campus newsletter just went up &mdash; <strong>${escapeHtml(subject)}</strong>. You&rsquo;re getting this because you bought a shirt, and I want you to see what&rsquo;s been happening on the ground.</p>

    ${heroBlock}

    ${teaserBlock}

    <p style="margin: 24px 0 16px 0;"><strong>To read the rest:</strong> go to <a href="${siteUrl}" style="color: #D4A843; font-weight: bold;">beanumber.org</a> and type the number on the back of your shirt. You&rsquo;ll land on the page of the kid your shirt belongs to &mdash; the newsletter sits right under their story.</p>

    <p style="margin: 24px 0;">
      <a href="${siteUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; padding: 14px 28px; text-decoration: none; font-size: 13px;">Meet your kid</a>
    </p>

    <p style="font-size: 14px; color: #555;">If reading this makes you want to become a monthly sponsor of the kid on your shirt, that&rsquo;s a $25-a-month decision and the sponsor button is right there on their page. No pressure &mdash; the work runs either way. Just wanted you to know the door is open.</p>

    <p>Kevin</p>
  `);

  return sendEmail({
    to: { email: recipientEmail, name: recipientName },
    subject,
    html,
  });
}

/**
 * Newsletter notification for LEGACY DONORS — people who gave
 * earlier (e.g. through Donorbox) but haven't bought a shirt or
 * sponsored monthly. They don't have a number-to-kid relationship
 * yet, so we don't ask them to type a number into beanumber.org's
 * lookup — that would feel like a slot machine and undermine the
 * brand. Instead we point them at /news (the dedicated campus
 * newsfeed without kid framing) and offer a soft path into meeting
 * the kids if they want.
 */
export async function sendNewsletterNotificationEmailForLegacyDonor(params: {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  teaser: string;
  heroPhotoUrl?: string;
}): Promise<EmailSendResult> {
  const { recipientEmail, recipientName, subject, teaser, heroPhotoUrl } = params;
  const firstName = (recipientName || 'Friend').trim().split(/\s+/)[0] || 'Friend';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
  const newsUrl = `${siteUrl}/news`;

  const heroBlock = heroPhotoUrl
    ? `<img src="${escapeAttr(heroPhotoUrl)}" alt="From the campus" style="display:block;width:100%;max-width:560px;height:auto;border-radius:4px;margin:0 0 24px 0;">`
    : '';

  const teaserBlock = teaser
    ? `<p style="color: #555; font-style: italic; border-left: 3px solid #D4A843; padding-left: 16px; margin: 24px 0;">${escapeHtml(teaser)}</p>`
    : '';

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">Hey ${escapeHtml(firstName)},</p>

    <p>The latest campus newsletter just went up &mdash; <strong>${escapeHtml(subject)}</strong>. You gave to Be A Number at some point and stayed on the list, and I want you to see what&rsquo;s been happening on the ground.</p>

    ${heroBlock}

    ${teaserBlock}

    <p style="margin: 24px 0 16px 0;"><strong>Read the rest at <a href="${newsUrl}" style="color: #D4A843;">beanumber.org/news</a>.</strong> That&rsquo;s the dedicated campus feed &mdash; everything we&rsquo;ve been sending lives there.</p>

    <p style="margin: 24px 0;">
      <a href="${newsUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; padding: 14px 28px; text-decoration: none; font-size: 13px;">Read the newsletter</a>
    </p>

    <p style="font-size: 14px; color: #555;">Curious about the kids the campus runs for? Browse them at <a href="${siteUrl}" style="color: #D4A843;">beanumber.org</a>. Every shirt sold matches its buyer to one of them by number &mdash; and if that&rsquo;s something you want in on, the sponsor button is on every kid&rsquo;s page. $25 a month, cancel anytime, runs the whole campus.</p>

    <p>Kevin</p>
  `);

  return sendEmail({
    to: { email: recipientEmail, name: recipientName },
    subject,
    html,
  });
}

/**
 * Send update notification to sponsor
 */
export async function sendUpdateNotificationEmail(
  sponsorEmail: string,
  sponsorName: string,
  childName: string,
  updateTitle: string,
  updatePreview: string
): Promise<EmailSendResult> {
  const dashboardUrl = `${SITE_URL}/sponsor/login`;
  const firstName = (sponsorName || 'Friend').trim().split(/\s+/)[0] || 'Friend';

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">Hey ${firstName},</p>

    <p>There is a new update about ${childName} waiting for you in your portal.</p>

    <div style="background: #f5f0e8; border: 1px solid #e8e0d4; padding: 16px 20px; margin: 24px 0;">
      <p style="margin: 0 0 6px 0; font-weight: bold; color: #0d0d0d;">${updateTitle}</p>
      <p style="margin: 0; font-size: 14px; color: #555;">${updatePreview}</p>
    </div>

    <p style="text-align: center; margin: 24px 0;">
      <a href="${dashboardUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">READ THE FULL UPDATE</a>
    </p>

    <p>Kevin</p>
  `);

  return sendEmail({
    to: { email: sponsorEmail, name: sponsorName },
    subject: `New update about ${childName}`,
    html,
  });
}

/**
 * Send donation receipt email
 */
export async function sendDonationReceiptEmail(
  donorEmail: string,
  donorName: string,
  amount: number,
  donationType: 'one-time' | 'monthly',
  transactionId: string,
  date: string
): Promise<EmailSendResult> {
  const formattedAmount = (amount / 100).toFixed(2);
  const firstName = (donorName || 'Friend').trim().split(/\s+/)[0] || 'Friend';
  const dateStr = new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">Hey ${firstName},</p>

    <p>This is your tax-deductible receipt for your ${donationType === 'monthly' ? 'monthly ' : ''}donation to Be A Number. We are a 501(c)(3) public charity (EIN 93-1948872), and no goods or services were provided in exchange for this contribution.</p>

    <div style="background: #f5f0e8; border: 1px solid #e8e0d4; padding: 16px 20px; margin: 24px 0;">
      <p style="margin: 0; font-size: 22px; font-weight: bold; color: #0d0d0d;">$${formattedAmount}</p>
      <p style="margin: 4px 0 0 0; font-size: 14px; color: #555;">
        ${donationType === 'monthly' ? 'Monthly recurring' : 'One-time'} &middot; ${dateStr}
      </p>
      <p style="margin: 4px 0 0 0; font-size: 13px; color: #999;">Transaction: ${transactionId}</p>
    </div>

    <p>Your donation goes to a six-acre campus in Northern Uganda with a school built for 380 kids, a medical clinic that has treated 700+ patients, and vocational training where 60 women are learning trades. If you ever want to see more about where it goes, the <a href="${SITE_URL}/impact" style="color: #D4A843;">impact page</a> has the full picture.</p>

    <p>Thank you for this,<br>
    <strong>Kevin</strong></p>
  `);

  return sendEmail({
    to: { email: donorEmail, name: donorName },
    subject: `Your receipt from Be A Number`,
    html,
  });
}

/**
 * Send update request confirmation to sponsor
 */
export async function sendUpdateRequestConfirmationEmail(
  sponsorEmail: string,
  sponsorName: string,
  childName: string,
  nextEligibleDate: string
): Promise<EmailSendResult> {
  const firstName = (sponsorName || 'Friend').trim().split(/\s+/)[0] || 'Friend';

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">Hey ${firstName},</p>

    <p>Got your update request for ${childName}. I am passing it along to the team on the ground, and they will put together recent photos and a progress update. Expect it within 2 to 4 weeks. I will email you when it is ready in your portal.</p>

    <p>Your next update request opens up on ${nextEligibleDate}.</p>

    <p>Kevin</p>
  `);

  return sendEmail({
    to: { email: sponsorEmail, name: sponsorName },
    subject: `Update request received for ${childName}`,
    html,
  });
}

/**
 * Send recurring donation thank-you email (fires on each invoice.payment_succeeded)
 */
export async function sendRecurringDonationThankYouEmail(
  donorEmail: string,
  donorName: string,
  amount: number,
  currency: string,
  sponsor?: { childName?: string | null; shirtNumber?: number | null }
): Promise<EmailSendResult> {
  const formattedAmount = amount.toFixed(2);
  const firstName = (donorName || 'Friend').trim().split(/\s+/)[0] || 'Friend';
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const isSponsor = !!(sponsor && (sponsor.childName || typeof sponsor.shirtNumber === 'number'));
  const childName = sponsor?.childName || 'your child';
  const childUrl = typeof sponsor?.shirtNumber === 'number'
    ? `${SITE_URL}/children/${sponsor.shirtNumber}`
    : SITE_URL;
  const childUrlLabel = typeof sponsor?.shirtNumber === 'number'
    ? `beanumber.org/${sponsor.shirtNumber}`
    : 'beanumber.org';

  const bodyMiddle = isSponsor
    ? `<p>Your monthly sponsorship of $${formattedAmount} was processed on ${dateStr}. That keeps ${childName} in school at the YDO campus, eating two meals a day, with the on-site clinic when they need it.</p>

    <p>${childName === 'your child' ? 'Your kid&rsquo;s' : `${childName}&rsquo;s`} page at <a href="${childUrl}" style="color: #D4A843;">${childUrlLabel}</a> is your place for them. When something new lands &mdash; a photo, a letter, a note from the teachers &mdash; I&rsquo;ll email you so you know to look. If you ever can&rsquo;t get back to the page, or you need to change or cancel your monthly for any reason, reply to this email or write me at <a href="mailto:Kevin@beanumber.org" style="color: #D4A843;">Kevin@beanumber.org</a> and I&rsquo;ll take care of it.</p>`
    : `<p>Your monthly donation of $${formattedAmount} was processed on ${dateStr}. It goes to the same place as last month: a six-acre campus in Northern Uganda with a school built for 380 kids, a medical clinic that has treated 700+ patients, and vocational training where 60 women are learning trades.</p>

    <p>If you ever want to see what your monthly support adds up to, the <a href="${SITE_URL}/impact" style="color: #D4A843;">impact page</a> has the full breakdown. And if you need to change or cancel your donation for any reason, reply to this email or write me at <a href="mailto:Kevin@beanumber.org" style="color: #D4A843;">Kevin@beanumber.org</a> and I&rsquo;ll take care of it.</p>`;

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">Hey ${firstName},</p>

    ${bodyMiddle}

    <p>Kevin</p>
  `);

  return sendEmail({
    to: { email: donorEmail, name: donorName },
    subject: isSponsor ? `Your monthly sponsorship was processed` : `Your monthly donation was processed`,
    html,
  });
}

/**
 * Helper function to strip HTML tags for plain text fallback
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
