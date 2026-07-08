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

  // Kid by first name only in the Surface 13 paragraph — "Aaron's classroom"
  // reads human; "Aaron Ouma Joseph's classroom" reads formal.
  const childFirstName = (childName || '').split(/\s+/)[0] || childName;

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">Hey ${firstName},</p>

    <p>Your sponsorship of ${childName} is active. That means ${childName} goes to school at the campus, eats two meals a day, and has the on-site clinic when they need it.</p>

    <p>One thing happens fast on the other side of this. The minute you clicked the button, a note went to the team at the campus. Tomorrow morning over there &mdash; they&rsquo;re hours ahead of us &mdash; the team is going to tell ${childFirstName} they have a sponsor. They don&rsquo;t know your name yet. They&rsquo;re going to ask.</p>

    <p style="background: #FFF8F0; border-left: 3px solid #D4A843; padding: 16px 20px; margin: 24px 0;"><strong>Reply to this email and tell us what you want ${childFirstName} to know.</strong> One sentence. Two. Whatever feels right. We&rsquo;ll pass it on.</p>

    ${pageLine}

    <p>You'll also get a monthly campus newsletter from our team in Northern Uganda, photos of ${childName} every few months, a handwritten letter from them once a year, and a year-end report card.</p>

    <p>If you ever want to write back, change your monthly, or ask anything else, reply here. I read every one.</p>

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

  // Under the Number-is-identity model the &ldquo;portal&rdquo; is /[N] (the
  // user&rsquo;s kid page). We don&rsquo;t know their Number from the newsletter
  // sender context, so the link points at the homepage where they
  // enter it. The deprecated /sponsor/login was this link&rsquo;s old
  // destination — see core_model.md §0b.
  const siteRoot = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
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
        You're receiving this because you're a Be A Number sponsor. Updates about your kid show up on your kid's page &mdash; enter your Number at <a href="${siteRoot}" style="color:#D4A843;">beanumber.org</a> to get there. Or <a href="${unsubscribeUrl}" style="color:#999;">manage your emails</a>.
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
  /**
   * Each kid the sponsor sponsors. `sponsorCode` is THIS kid's
   * specific sponsorship SponsorCode — used to mint an auto-login
   * token so the link drops them into the kid page in
   * authenticated sponsor mode (no "stay with X" non-sponsor
   * framing).
   */
  kids: Array<{ firstName: string; shirtNumber: number; sponsorCode?: string }>;
  heroPhotoUrl?: string;
}): Promise<EmailSendResult> {
  const { sponsorEmail, sponsorName, subject, teaser, kids, heroPhotoUrl } = params;
  const firstName = (sponsorName || 'Friend').trim().split(/\s+/)[0] || 'Friend';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

  // Token TTL — 30 days. People don't always click an email the day
  // it lands; aligning the auto-login window with the session TTL
  // keeps it simple. After 30 days a sponsor with a dead link can
  // still use the magic-link recovery form on the kid page.
  const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

  // Lazy-import so any environment that can't sign tokens
  // (CRON_SECRET missing in non-prod) still ships the bare links.
  let makeRecoveryToken: ((c: string, n: number, ttl?: number) => string) | null = null;
  try {
    const mod = await import('./recovery-tokens');
    makeRecoveryToken = mod.makeRecoveryToken;
  } catch {
    makeRecoveryToken = null;
  }

  // Build the per-kid link list. Most sponsors will have one entry.
  // Multi-kid sponsors get the full list — one click per relationship.
  // Each link runs through /api/sponsor/recover/callback with a
  // signed token so the sponsor lands on the kid page already
  // authenticated.
  const kidLines = kids
    .filter(k => typeof k.shirtNumber === 'number')
    .map(k => {
      let url: string;
      if (makeRecoveryToken && k.sponsorCode) {
        const token = makeRecoveryToken(k.sponsorCode, k.shirtNumber, TOKEN_TTL_SECONDS);
        url = `${siteUrl}/api/sponsor/recover/callback?t=${encodeURIComponent(token)}`;
      } else {
        // Fallback — bare link if token signing isn't available.
        // Sponsor will land in non-authenticated state but can
        // recover via the magic-link form on the page.
        url = `${siteUrl}/children/${k.shirtNumber}`;
      }
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

    <p>Check out your kid${kids.length === 1 ? "&rsquo;s" : "s&rsquo;"} page${kids.length === 1 ? '' : 's'} to read the update! :)</p>

    ${kidLines}

    <p style="margin-top: 24px; font-size: 14px; color: #555;">Also worth exploring: your <strong>My Campus</strong> page at <a href="${siteUrl}/me" style="color: #D4A843;">beanumber.org/me</a>. We built it to make exploring the campus feel closer. Your ${kids.length === 1 ? 'kid is' : 'kids are'} front and center &mdash; but so are the other kids at the campus you haven&rsquo;t met yet, the school itself, and every newsletter I&rsquo;ve sent. A home base, not a dashboard. Poke around.</p>

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

    <p style="margin: 24px 0 16px 0;"><strong>To read the rest:</strong> go to <a href="${siteUrl}" style="color: #D4A843; font-weight: bold;">beanumber.org</a> and type the number on the back of your shirt. The newsletter sits right under your kid&rsquo;s story.</p>

    <p style="margin: 24px 0;">
      <a href="${siteUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; padding: 14px 28px; text-decoration: none; font-size: 13px;">Type your number</a>
    </p>

    <p style="font-size: 14px; color: #555;">Don&rsquo;t have the shirt handy? Read it at <a href="${siteUrl}/news" style="color: #D4A843;">beanumber.org/news</a> &mdash; same story, without the kid-page framing.</p>

    <p style="font-size: 14px; color: #555;">Once you&rsquo;ve met your kid, your <strong>My Campus</strong> page at <a href="${siteUrl}/me" style="color: #D4A843;">beanumber.org/me</a> opens up. Your kid&rsquo;s front and center &mdash; but so are the other kids at the campus, the school itself, and every newsletter I&rsquo;ve sent. We built it to make exploring the campus feel closer. Home base, not dashboard. Explore it.</p>

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

    <p style="margin: 24px 0 16px 0;"><strong>Read it at <a href="${newsUrl}" style="color: #D4A843;">beanumber.org/news</a>.</strong> That&rsquo;s where every campus update lives.</p>

    <p style="margin: 24px 0;">
      <a href="${newsUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; padding: 14px 28px; text-decoration: none; font-size: 13px;">Read the newsletter</a>
    </p>

    <p style="font-size: 14px; color: #555;">How this works: every shirt at <a href="${siteUrl}" style="color: #D4A843;">beanumber.org</a> is tied to a kid at the campus by number. Buy one, and you&rsquo;ll meet the kid attached to it when it arrives. From there, $25/mo sponsorship is optional &mdash; cancel anytime, runs the whole campus.</p>

    <p style="font-size: 14px; color: #555;">Every shirt buyer also gets a <strong>My Campus</strong> page &mdash; a real home base for exploring the campus. Your kid front and center, but also the other kids there, the school itself, every newsletter. We built it to make the connection feel closer. Take a peek at <a href="${siteUrl}/me" style="color: #D4A843;">beanumber.org/me</a> to see what that looks like.</p>

    <p>Kevin</p>
  `);

  return sendEmail({
    to: { email: recipientEmail, name: recipientName },
    subject,
    html,
  });
}

/**
 * Legacy sponsor free-shirt email — sent to the ~3 people who sponsored a
 * specific kid before the shirt-first model existed (never bought a shirt).
 *
 * They get a Stripe promotion code (100% off shirt, customer-bound,
 * single-use). At fulfillment Kevin hand-picks a shirt whose number cycles
 * to THEIR sponsored kid (roster of 50 cycles every ~53 shirts, so kid X
 * lives at multiple shirt numbers). So hold-to-meet reveals the same kid
 * they've been sponsoring the whole time — the shirt closes that loop.
 */
export async function sendLegacySponsorFreeShirtEmail(params: {
  recipientEmail: string;
  recipientName: string;
  kidFirstName: string;
  promoCode: string;
  /**
   * Optional newsletter section shown ABOVE the free-shirt content. When
   * present, the email starts with a "This month at the campus" block
   * (hero photo + teaser + read-more link to /news) so the recipient
   * gets the newsletter content plus the thank-you in one email.
   */
  newsletter?: {
    title: string;
    teaser: string;
    heroPhotoUrl?: string;
    newsUrl: string;
  };
}): Promise<EmailSendResult> {
  const { recipientEmail, recipientName, kidFirstName, promoCode, newsletter } = params;
  const firstName = (recipientName || 'Friend').trim().split(/\s+/)[0] || 'Friend';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
  const subject = newsletter
    ? `A shirt for you, on us — plus this month at the campus`
    : `A shirt for you, on us`;

  const newsletterBlock = newsletter
    ? `
    <h2 style="font-size: 20px; margin: 0 0 12px 0;">First — this month at the campus</h2>
    <p>The July update just went live: <strong>${escapeHtml(newsletter.title)}</strong>. Read the full thing at <a href="${escapeHtml(newsletter.newsUrl)}" style="color: #D4A843; font-weight: bold;">beanumber.org/news</a>.</p>
    ${
      newsletter.heroPhotoUrl
        ? `<img src="${escapeAttr(newsletter.heroPhotoUrl)}" alt="From the campus" style="display:block;width:100%;max-width:560px;height:auto;border-radius:4px;margin:16px 0 20px 0;">`
        : ''
    }
    <p style="color: #555; font-style: italic; border-left: 3px solid #D4A843; padding-left: 16px; margin: 20px 0;">${escapeHtml(newsletter.teaser)}</p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 32px 0;">

    <h2 style="font-size: 20px; margin: 0 0 12px 0;">And &mdash; a shirt for you, on us</h2>
    `
    : '';

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">Hey ${escapeHtml(firstName)},</p>

    ${newsletterBlock}

    <p>Back when you signed up, our model let you pick a specific kid to sponsor &mdash; that&rsquo;s how you ended up with ${escapeHtml(kidFirstName)}, and ${escapeHtml(kidFirstName)} has stayed with you the whole time. Thank you for that.</p>

    <p>Since then we&rsquo;ve moved to a shirt-first model: every shirt sold at Be A Number ties its buyer to a kid by the number on the back. Hold-to-meet on beanumber.org, and the kid shows up. It&rsquo;s how we&rsquo;re building the connection now.</p>

    <p>The old model didn&rsquo;t include a shirt. This one does &mdash; and we want to make that up to you. ${escapeHtml(kidFirstName)} stays yours, the sponsorship is unchanged, and now you&rsquo;ve got a shirt with ${escapeHtml(kidFirstName)}&rsquo;s number on the back to actually wear.</p>

    <p><strong>This is our thank-you. The shirt is free, shipping is on us, no charge at all.</strong></p>

    <p style="margin: 24px 0; text-align: center;">
      <span style="display: inline-block; background: #0d0d0d; color: #D4A843; font-family: 'SF Mono', Menlo, monospace; font-size: 18px; font-weight: bold; letter-spacing: 0.1em; padding: 16px 28px; border-radius: 4px;">${escapeHtml(promoCode)}</span>
    </p>

    <p>Pick your style at <a href="${siteUrl}/shirts" style="color: #D4A843; font-weight: bold;">beanumber.org/shirts</a>, add to cart, and enter the code at checkout. Skip the &ldquo;continue monthly&rdquo; toggle &mdash; you&rsquo;re already sponsoring ${escapeHtml(kidFirstName)}.</p>

<p>When it arrives, look at the number on the back, hit hold-to-meet on <strong>beanumber.org/&lt;that number&gt;</strong>, and ${escapeHtml(kidFirstName)} will be right there &mdash; the same kid you&rsquo;ve been sponsoring the whole time. Rock it, share it, and pull people into the story.</p>

    <p style="margin-top: 24px; font-size: 14px; color: #888;">Reply to this email if you hit any snag. The code is tied to your account, so it only works from ${escapeHtml(recipientEmail)} and only once.</p>

    <p>Kevin</p>
  `);

  return sendEmail({
    to: { email: recipientEmail, name: recipientName },
    subject,
    html,
  });
}

/**
 * Legacy DONOR free-shirt email — sent to long-time supporters (typically
 * Donorbox recurring donors) who aren't in the shirt-first Stripe flow. No
 * specific kid to reference (they haven't sponsored one) — the shirt they
 * receive will introduce them to a random kid via hold-to-meet, which is
 * the whole point of the model.
 */
export async function sendLegacyDonorFreeShirtEmail(params: {
  recipientEmail: string;
  recipientName: string;
  promoCode: string;
  /** How many times the code can be redeemed. Defaults to 1. */
  maxRedemptions?: number;
  /** Optional newsletter section shown above the free-shirt content. */
  newsletter?: {
    title: string;
    teaser: string;
    heroPhotoUrl?: string;
    newsUrl: string;
  };
}): Promise<EmailSendResult> {
  const {
    recipientEmail,
    recipientName,
    promoCode,
    maxRedemptions = 1,
    newsletter,
  } = params;
  const firstName = (recipientName || 'Friend').trim().split(/\s+/)[0] || 'Friend';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
  const subject = newsletter
    ? `A shirt on us — plus this month at the campus`
    : `A shirt on us`;

  const newsletterBlock = newsletter
    ? `
    <h2 style="font-size: 20px; margin: 0 0 12px 0;">First — this month at the campus</h2>
    <p>The July update just went live: <strong>${escapeHtml(newsletter.title)}</strong>. Read the full thing at <a href="${escapeHtml(newsletter.newsUrl)}" style="color: #D4A843; font-weight: bold;">beanumber.org/news</a>.</p>
    ${
      newsletter.heroPhotoUrl
        ? `<img src="${escapeAttr(newsletter.heroPhotoUrl)}" alt="From the campus" style="display:block;width:100%;max-width:560px;height:auto;border-radius:4px;margin:16px 0 20px 0;">`
        : ''
    }
    <p style="color: #555; font-style: italic; border-left: 3px solid #D4A843; padding-left: 16px; margin: 20px 0;">${escapeHtml(newsletter.teaser)}</p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 32px 0;">

    <h2 style="font-size: 20px; margin: 0 0 12px 0;">And &mdash; a shirt on us</h2>
    `
    : '';

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">Hey ${escapeHtml(firstName)},</p>

    ${newsletterBlock}

    <p>You&rsquo;ve been giving monthly to Be A Number for a long time &mdash; thank you. That kind of steady support is a big part of what got us this far.</p>

    <p>We&rsquo;ve built out a shirt-first model since those early days. Every shirt sold at Be A Number ties its buyer to a specific kid by the number on the back. Hold-to-meet on beanumber.org, and the kid shows up. It&rsquo;s how the whole thing works now &mdash; and it&rsquo;s way more fun than clicking &ldquo;give.&rdquo;</p>

    <p>You&rsquo;ve been part of this a while and we want to make sure you&rsquo;re pulled all the way in.</p>

    <p><strong>This is our thank-you. The shirt is free, shipping is on us, no charge at all.</strong></p>

    <p style="margin: 24px 0; text-align: center;">
      <span style="display: inline-block; background: #0d0d0d; color: #D4A843; font-family: 'SF Mono', Menlo, monospace; font-size: 18px; font-weight: bold; letter-spacing: 0.1em; padding: 16px 28px; border-radius: 4px;">${escapeHtml(promoCode)}</span>
    </p>

    <p>Pick your style at <a href="${siteUrl}/shirts" style="color: #D4A843; font-weight: bold;">beanumber.org/shirts</a>, add to cart, and enter the code at checkout. Skip the &ldquo;continue monthly&rdquo; toggle unless you want to layer another sponsorship on top &mdash; this code covers the shirt.</p>

<p>When it arrives, look at the number on the back, hit hold-to-meet on <strong>beanumber.org/&lt;that number&gt;</strong>, and meet the kid it belongs to. Rock the shirt, share the story, and pull more people in.</p>

    <p style="margin-top: 24px; font-size: 14px; color: #888;">Reply to this email if you hit any snag. ${
      maxRedemptions === 1
        ? 'The code is one-time use.'
        : `The code works up to ${maxRedemptions} times &mdash; enough for the whole household.`
    }</p>

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
  updatePreview: string,
  shirtNumber?: number
): Promise<EmailSendResult> {
  // If we know the kid&rsquo;s Number, deep-link straight to /[N] —
  // that&rsquo;s the canonical dashboard under the Number-is-identity
  // model and the update will render in place. If not, send them
  // to the homepage to enter their Number.
  const dashboardUrl = shirtNumber
    ? `${SITE_URL}/children/${shirtNumber}`
    : SITE_URL;
  const dashboardLabel = shirtNumber
    ? `${childName}&rsquo;s page`
    : 'your kid&rsquo;s page';
  const firstName = (sponsorName || 'Friend').trim().split(/\s+/)[0] || 'Friend';

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">Hey ${firstName},</p>

    <p>There&rsquo;s a new update about ${childName} on ${dashboardLabel}.</p>

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

    <p>Got your update request for ${childName}. I am passing it along to the team on the ground, and they will put together recent photos and a progress update. Expect it within 2 to 4 weeks. I&rsquo;ll email you when it lands on ${childName}&rsquo;s page.</p>

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
    ? `<p>Your monthly sponsorship of $${formattedAmount} was processed on ${dateStr}. That keeps ${childName} in school at the campus, eating two meals a day, with the on-site clinic when they need it.</p>

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
 * Admin alert to Kevin — a sponsor just wrote a note to their kid.
 *
 * Fires from src/app/api/sponsor/notes/route.ts POST right after the
 * insert lands. Non-fatal: the caller ignores any failure so a Gmail
 * blip doesn't take down the composer POST. The sponsor's write is
 * what matters; this email is Kevin's notification path.
 *
 * Includes a truncated body preview (~200 chars) so Kevin can gauge
 * urgency without opening the admin console for every note, plus a
 * direct link into /admin/messages so he can review and translate.
 *
 * Recipient is hardcoded to kevin@beanumber.org — same address the
 * existing admin order notification uses. Not templated because this
 * is internal ops, not a user-facing template.
 */
function truncateForPreview(text: string, cap = 200): string {
  const trimmed = (text || '').replace(/\s+/g, ' ').trim();
  if (trimmed.length <= cap) return trimmed;
  return `${trimmed.slice(0, cap - 1).trimEnd()}…`;
}

export async function sendKevinNoteAlert(params: {
  noteId: string;
  sponsorEmail: string;
  sponsorName: string | null;
  kidFirstName: string;
  kidDisplayName: string;
  shirtNumber: number | null;
  /**
   * True when the sponsor holds the shirt for THIS specific kid —
   * i.e., they claimed this kid's number via Hold-to-Meet. False
   * when they added the sponsorship without owning the shirt (a
   * co-sponsor). Both are equally-real sponsorships per CLAUDE.md
   * non-negotiable #4 — numbers are exclusive, sponsorships are not.
   * Kevin uses the distinction to gauge which channel the note came
   * through and for retention analysis; both channels get the same
   * warmth in any follow-up.
   */
  sponsorHoldsShirt: boolean;
  bodyEn: string;
}): Promise<EmailSendResult> {
  const {
    noteId,
    sponsorEmail,
    sponsorName,
    kidFirstName,
    kidDisplayName,
    shirtNumber,
    sponsorHoldsShirt,
    bodyEn,
  } = params;

  // The kid's shirt number is always the identifier (it's THE kid's
  // public number, regardless of which sponsor is writing). But when
  // the writer doesn't own that shirt, don't imply they do — the
  // # follows the kid, not the sponsor's channel.
  const kidLabel = shirtNumber
    ? `${kidDisplayName || kidFirstName} (#${shirtNumber})`
    : kidDisplayName || kidFirstName;
  const preview = truncateForPreview(bodyEn, 240);
  const sponsorDisplay = sponsorName?.trim() || sponsorEmail;
  // Channel tag — factual, not hierarchical. "Holds #N" for the
  // shirt-linked sponsor (they physically hold the shirt with this
  // kid's number). "Co-sponsor" for a sponsor who added the kid
  // without owning the shirt. Both are equally-real sponsorships;
  // the tag just tells Kevin which channel the note came through.
  const holderTag = shirtNumber
    ? `Holds #${shirtNumber}`
    : `Shirt-linked`;
  const channelTag = sponsorHoldsShirt
    ? `<span style="display: inline-block; background: #D4A843; color: #0d0d0d; padding: 2px 8px; font-size: 11px; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase; margin-left: 6px;">${escapeHtmlLocal(holderTag)}</span>`
    : `<span style="display: inline-block; background: #e8e0d4; color: #333; padding: 2px 8px; font-size: 11px; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase; margin-left: 6px;">Co-sponsor</span>`;

  // Deep-link to the messages queue. There's no per-note URL yet, but
  // /admin/messages surfaces pending items at the top ordered by age,
  // so this new one will be the first thing Kevin sees.
  const queueUrl = `${SITE_URL}/admin/messages`;

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">A new note landed in the sponsor queue.</p>

    <p><strong>From:</strong> ${escapeHtmlLocal(sponsorDisplay)}${
    sponsorName ? ` &lt;${escapeHtmlLocal(sponsorEmail)}&gt;` : ''
  } ${channelTag}<br>
    <strong>To:</strong> ${escapeHtmlLocal(kidLabel)}</p>

    <p style="background: #FFF8F0; border-left: 3px solid #D4A843; padding: 16px 20px; margin: 24px 0; font-style: italic; color: #555;">
      &ldquo;${escapeHtmlLocal(preview)}&rdquo;
    </p>

    <p style="text-align: center; margin: 28px 0;">
      <a href="${queueUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">
        Open the queue
      </a>
    </p>

    <p style="color: #888; font-size: 12px;">Note ID: ${escapeHtmlLocal(noteId)}</p>
  `);

  return sendEmail({
    to: { email: 'kevin@beanumber.org', name: 'Kevin' },
    subject: `New sponsor note: ${sponsorDisplay} → ${kidFirstName}`,
    html,
  });
}

/**
 * Campus-side alert to Simon — a new penpal note landed for a kid.
 *
 * Simon is the YDO team member who translates, reviews, and hand-carries
 * the sponsor's message to the actual child, then types the child's
 * reply back into the admin queue. Without this alert he only sees new
 * notes if he happens to log into /admin/messages — which means real
 * delay between "sponsor sends" and "kid gets it."
 *
 * Non-fatal — if Gmail is down or SIMON_EMAIL is unset, the note still
 * lands in the queue and Kevin still gets his own alert; Simon just
 * won't be pinged this cycle.
 *
 * Recipient defaults to scholarship.uganda@gmail.com (Simon's stable
 * campus address) but the SIMON_EMAIL env var overrides — makes team
 * changes a config swap, not a code push.
 */
export async function sendSimonNoteAlert(params: {
  noteId: string;
  sponsorName: string | null;
  sponsorEmail: string;
  kidFirstName: string;
  kidDisplayName: string;
  shirtNumber: number | null;
  bodyEn: string;
}): Promise<EmailSendResult | { success: false; error: string }> {
  const {
    noteId,
    sponsorName,
    sponsorEmail,
    kidFirstName,
    kidDisplayName,
    shirtNumber,
    bodyEn,
  } = params;

  const simonEmail =
    process.env.SIMON_EMAIL || 'scholarship.uganda@gmail.com';

  const kidLabel = shirtNumber
    ? `${kidDisplayName || kidFirstName} (#${shirtNumber})`
    : kidDisplayName || kidFirstName;
  const preview = truncateForPreview(bodyEn, 320);
  const sponsorDisplay = sponsorName?.trim() || sponsorEmail;

  const queueUrl = `${SITE_URL}/admin/messages`;

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">A new penpal note is waiting for ${escapeHtmlLocal(kidFirstName)} at the campus.</p>

    <p><strong>From:</strong> ${escapeHtmlLocal(sponsorDisplay)}<br>
    <strong>To:</strong> ${escapeHtmlLocal(kidLabel)}</p>

    <p style="background: #FFF8F0; border-left: 3px solid #D4A843; padding: 16px 20px; margin: 24px 0; font-style: italic; color: #555;">
      &ldquo;${escapeHtmlLocal(preview)}&rdquo;
    </p>

    <p>Please translate this note into ${escapeHtmlLocal(kidFirstName)}&rsquo;s language, hand it to them, and type their reply back into the queue when it comes.</p>

    <p style="text-align: center; margin: 28px 0;">
      <a href="${queueUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">
        Open the queue
      </a>
    </p>

    <p style="color: #888; font-size: 12px;">Note ID: ${escapeHtmlLocal(noteId)}</p>
  `);

  return sendEmail({
    to: { email: simonEmail, name: 'Simon' },
    subject: `New penpal note for ${kidFirstName} — please translate`,
    html,
  });
}

/**
 * Admin alert to Kevin — a kid just replied to a sponsor.
 *
 * Fires from src/app/api/admin/messages/[id]/reply/route.ts alongside
 * the sponsor-facing teaser email. Non-fatal, same posture as
 * sendKevinNoteAlert. Includes a preview of what the kid said so Kevin
 * can gauge the moment without opening the console (this is the
 * highlight-reel side of the correspondence engine — worth surfacing).
 */
export async function sendKevinReplyAlert(params: {
  replyId: string;
  parentMessageId: string;
  sponsorEmail: string;
  sponsorName: string | null;
  kidFirstName: string;
  kidDisplayName: string;
  shirtNumber: number | null;
  /** See sendKevinNoteAlert for the channel-tag semantics. */
  sponsorHoldsShirt: boolean;
  replyBodyEn: string;
}): Promise<EmailSendResult> {
  const {
    replyId,
    sponsorEmail,
    sponsorName,
    kidFirstName,
    kidDisplayName,
    shirtNumber,
    sponsorHoldsShirt,
    replyBodyEn,
  } = params;

  const kidLabel = shirtNumber
    ? `${kidDisplayName || kidFirstName} (#${shirtNumber})`
    : kidDisplayName || kidFirstName;
  const preview = truncateForPreview(replyBodyEn, 240);
  const sponsorDisplay = sponsorName?.trim() || sponsorEmail;
  const holderTag = shirtNumber ? `Holds #${shirtNumber}` : `Shirt-linked`;
  const channelTag = sponsorHoldsShirt
    ? `<span style="display: inline-block; background: #D4A843; color: #0d0d0d; padding: 2px 8px; font-size: 11px; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase; margin-left: 6px;">${escapeHtmlLocal(holderTag)}</span>`
    : `<span style="display: inline-block; background: #e8e0d4; color: #333; padding: 2px 8px; font-size: 11px; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase; margin-left: 6px;">Co-sponsor</span>`;

  const queueUrl = `${SITE_URL}/admin/messages`;
  const kidPageUrl = shirtNumber
    ? `${SITE_URL}/children/${shirtNumber}`
    : queueUrl;

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">A kid just wrote back.</p>

    <p><strong>From:</strong> ${escapeHtmlLocal(kidLabel)}<br>
    <strong>To:</strong> ${escapeHtmlLocal(sponsorDisplay)}${
    sponsorName ? ` &lt;${escapeHtmlLocal(sponsorEmail)}&gt;` : ''
  } ${channelTag}</p>

    <p style="background: #FFF8F0; border-left: 3px solid #c0392b; padding: 16px 20px; margin: 24px 0; font-style: italic; color: #555;">
      &ldquo;${escapeHtmlLocal(preview)}&rdquo;
    </p>

    <p>The sponsor got a teaser email pointing them back to their kid's page. Reply thread lives there.</p>

    <p style="text-align: center; margin: 28px 0;">
      <a href="${kidPageUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">
        Open ${escapeHtmlLocal(kidFirstName)}&rsquo;s page
      </a>
    </p>

    <p style="color: #888; font-size: 12px;">Reply ID: ${escapeHtmlLocal(replyId)}</p>
  `);

  return sendEmail({
    to: { email: 'kevin@beanumber.org', name: 'Kevin' },
    subject: `${kidFirstName} wrote back to ${sponsorDisplay}`,
    html,
  });
}

/**
 * Admin alert to Kevin — Simon declined a sponsor's note.
 *
 * Fires from src/app/api/admin/messages/[id]/route.ts on the decline
 * action. Includes Simon's internal decline notes if he wrote any, so
 * Kevin can weigh in on borderline cases before the decline email
 * lands with the sponsor. Non-fatal.
 */
export async function sendKevinDeclineAlert(params: {
  noteId: string;
  sponsorEmail: string;
  sponsorName: string | null;
  kidFirstName: string;
  kidDisplayName: string;
  shirtNumber: number | null;
  /** See sendKevinNoteAlert for the channel-tag semantics. */
  sponsorHoldsShirt: boolean;
  bodyEn: string;
  simonNotes: string | null;
  notifiedSponsor: boolean;
}): Promise<EmailSendResult> {
  const {
    noteId,
    sponsorEmail,
    sponsorName,
    kidFirstName,
    kidDisplayName,
    shirtNumber,
    sponsorHoldsShirt,
    bodyEn,
    simonNotes,
    notifiedSponsor,
  } = params;

  const kidLabel = shirtNumber
    ? `${kidDisplayName || kidFirstName} (#${shirtNumber})`
    : kidDisplayName || kidFirstName;
  const preview = truncateForPreview(bodyEn, 240);
  const sponsorDisplay = sponsorName?.trim() || sponsorEmail;
  const holderTag = shirtNumber ? `Holds #${shirtNumber}` : `Shirt-linked`;
  const channelTag = sponsorHoldsShirt
    ? `<span style="display: inline-block; background: #D4A843; color: #0d0d0d; padding: 2px 8px; font-size: 11px; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase; margin-left: 6px;">${escapeHtmlLocal(holderTag)}</span>`
    : `<span style="display: inline-block; background: #e8e0d4; color: #333; padding: 2px 8px; font-size: 11px; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase; margin-left: 6px;">Co-sponsor</span>`;
  const queueUrl = `${SITE_URL}/admin/messages`;

  const html = wrapTransactionalEmail(`
    <p style="margin-top: 0;">A sponsor's note was declined at the queue.</p>

    <p><strong>From:</strong> ${escapeHtmlLocal(sponsorDisplay)}${
    sponsorName ? ` &lt;${escapeHtmlLocal(sponsorEmail)}&gt;` : ''
  } ${channelTag}<br>
    <strong>To:</strong> ${escapeHtmlLocal(kidLabel)}</p>

    <p style="background: #FFF8F0; border-left: 3px solid #D4A843; padding: 16px 20px; margin: 20px 0; font-style: italic; color: #555;">
      &ldquo;${escapeHtmlLocal(preview)}&rdquo;
    </p>

    ${
      simonNotes && simonNotes.trim()
        ? `<p><strong>Reason logged:</strong></p>
    <p style="background: #f8f4ed; padding: 14px 18px; margin: 12px 0 24px; color: #333;">
      ${escapeHtmlLocal(simonNotes.trim())}
    </p>`
        : `<p style="color: #888; font-style: italic;">No reason was logged on the decline.</p>`
    }

    <p style="color: ${notifiedSponsor ? '#333' : '#c0392b'};">
      ${
        notifiedSponsor
          ? 'The sponsor was emailed a soft explanation.'
          : 'The sponsor was NOT notified. If you want to reach out, this is the moment.'
      }
    </p>

    <p style="text-align: center; margin: 28px 0;">
      <a href="${queueUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">
        Open the queue
      </a>
    </p>

    <p style="color: #888; font-size: 12px;">Note ID: ${escapeHtmlLocal(noteId)}</p>
  `);

  return sendEmail({
    to: { email: 'kevin@beanumber.org', name: 'Kevin' },
    subject: `Note declined: ${sponsorDisplay} → ${kidFirstName}`,
    html,
  });
}

// Local escape because email.ts doesn't already export one. Kept
// module-private to avoid competing with per-file escapers elsewhere.
function escapeHtmlLocal(input: string | null | undefined): string {
  if (input == null) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
