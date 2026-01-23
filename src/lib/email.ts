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

/**
 * Send welcome email to new sponsor
 *
 * @returns Structured result with success/failure and data/error
 */
export async function sendSponsorWelcomeEmail(
  sponsorEmail: string,
  sponsorName: string,
  childName: string,
  sponsorCode: string
): Promise<EmailSendResult> {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'}/sponsor/login`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1a1a1a; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background-color: #1a1a1a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          .credentials { background-color: #fff; padding: 20px; border-left: 4px solid #1a1a1a; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Be A Number!</h1>
          </div>
          <div class="content">
            <p>Dear ${sponsorName},</p>

            <p>Thank you for partnering with us to support ${childName}! Your sponsorship directly enables sustainable community systems in Northern Uganda — healthcare, education, workforce development, and economic infrastructure that transform lives.</p>

            <div class="credentials">
              <h3>Your Sponsor Dashboard</h3>
              <p>Access your personalized dashboard to see updates, photos, and impact reports about ${childName}:</p>
              <p><strong>Sponsor Code:</strong> ${sponsorCode}</p>
              <p><strong>Email:</strong> ${sponsorEmail}</p>
            </div>

            <div style="text-align: center;">
              <a href="${dashboardUrl}" class="button">Access Your Dashboard</a>
            </div>

            <h3>What Happens Next</h3>
            <ul>
              <li><strong>Regular Updates:</strong> We'll send you quarterly updates about ${childName} and community impact</li>
              <li><strong>Photos & Stories:</strong> Our field team shares photos and stories directly from the community</li>
              <li><strong>Impact Reports:</strong> See how your sponsorship contributes to measurable outcomes</li>
              <li><strong>Request Updates:</strong> You can request a personalized update once every 90 days</li>
            </ul>

            <p>Your support makes a lasting difference. Thank you for being a number that counts.</p>

            <p>With gratitude,<br>The Be A Number Team</p>
          </div>
          <div class="footer">
            <p>Be A Number, International | 501(c)(3) Nonprofit</p>
            <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'}">www.beanumber.org</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: { email: sponsorEmail, name: sponsorName },
    subject: `Welcome! You're now supporting ${childName}`,
    html,
  });
}

/**
 * Send update notification to sponsor
 *
 * @returns Structured result with success/failure and data/error
 */
export async function sendUpdateNotificationEmail(
  sponsorEmail: string,
  sponsorName: string,
  childName: string,
  updateTitle: string,
  updatePreview: string
): Promise<EmailSendResult> {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'}/sponsor/login`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1a1a1a; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background-color: #1a1a1a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          .update-box { background-color: #fff; padding: 20px; border-left: 4px solid #1a1a1a; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Update from ${childName}!</h1>
          </div>
          <div class="content">
            <p>Hi ${sponsorName},</p>

            <p>We have a new update to share about ${childName}:</p>

            <div class="update-box">
              <h3>${updateTitle}</h3>
              <p>${updatePreview}</p>
            </div>

            <div style="text-align: center;">
              <a href="${dashboardUrl}" class="button">Read Full Update</a>
            </div>

            <p>Log in to your sponsor dashboard to see the complete update with photos and details.</p>

            <p>Thank you for your continued support!</p>

            <p>With gratitude,<br>The Be A Number Team</p>
          </div>
          <div class="footer">
            <p>Be A Number, International | 501(c)(3) Nonprofit</p>
            <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'}">www.beanumber.org</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: { email: sponsorEmail, name: sponsorName },
    subject: `New update from ${childName}`,
    html,
  });
}

/**
 * Send donation receipt email
 *
 * @returns Structured result with success/failure and data/error
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
  const donationTypeText = donationType === 'monthly' ? 'Monthly Donation' : 'One-Time Donation';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1a1a1a; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .receipt-box { background-color: #fff; padding: 20px; border: 2px solid #1a1a1a; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          .amount { font-size: 32px; font-weight: bold; color: #1a1a1a; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Thank You for Your Donation!</h1>
          </div>
          <div class="content">
            <p>Dear ${donorName},</p>

            <p>Thank you for changing lives. Your generosity supports sustainable community systems in Northern Uganda — healthcare, education, workforce development, and economic empowerment that transform communities.</p>

            <div class="receipt-box">
              <h3>Tax-Deductible Receipt</h3>
              <div class="amount">$${formattedAmount}</div>
              <p><strong>Donation Type:</strong> ${donationTypeText}</p>
              <p><strong>Transaction ID:</strong> ${transactionId}</p>
              <p><strong>Date:</strong> ${date}</p>
              <p><strong>Tax ID:</strong> 46-2612870</p>
              <p style="margin-top: 20px; font-size: 12px; color: #666;">
                Be A Number, International is a 501(c)(3) nonprofit organization. Your donation is tax-deductible to the fullest extent allowed by law. No goods or services were provided in exchange for this donation.
              </p>
            </div>

            <h3>Your Impact</h3>
            <p>96-97% of your contribution directly supports programs and community impact:</p>
            <ul>
              <li><strong>Healthcare:</strong> Medical services and outreach programs</li>
              <li><strong>Education:</strong> School support and student sponsorships</li>
              <li><strong>Workforce Development:</strong> Vocational training programs</li>
              <li><strong>Economic Systems:</strong> Income-generating infrastructure</li>
            </ul>

            <p>We'll share quarterly updates on how your contribution is creating lasting change.</p>

            <p>With gratitude,<br>The Be A Number Team</p>
          </div>
          <div class="footer">
            <p>Be A Number, International | 501(c)(3) Nonprofit | Tax ID: 46-2612870</p>
            <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'}">www.beanumber.org</a></p>
            <p>Questions? Email us at info@beanumber.org</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: { email: donorEmail, name: donorName },
    subject: `Donation Receipt - $${formattedAmount} to Be A Number`,
    html,
  });
}

/**
 * Send update request confirmation to sponsor
 *
 * @returns Structured result with success/failure and data/error
 */
export async function sendUpdateRequestConfirmationEmail(
  sponsorEmail: string,
  sponsorName: string,
  childName: string,
  nextEligibleDate: string
): Promise<EmailSendResult> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1a1a1a; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          .info-box { background-color: #fff; padding: 20px; border-left: 4px solid #1a1a1a; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Update Request Received</h1>
          </div>
          <div class="content">
            <p>Hi ${sponsorName},</p>

            <p>We've received your request for an update about ${childName}!</p>

            <div class="info-box">
              <h3>What Happens Next</h3>
              <p>Our field team in Northern Uganda will prepare a personalized update with:</p>
              <ul>
                <li>Recent photos of ${childName}</li>
                <li>Information about their activities and progress</li>
                <li>Community and program updates</li>
              </ul>
              <p>You'll receive an email notification when the update is ready, typically within 2-4 weeks.</p>
            </div>

            <p><strong>Next Request Date:</strong> You can request your next update on ${nextEligibleDate}.</p>

            <p>Thank you for your patience and continued support!</p>

            <p>With gratitude,<br>The Be A Number Team</p>
          </div>
          <div class="footer">
            <p>Be A Number, International | 501(c)(3) Nonprofit</p>
            <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'}">www.beanumber.org</a></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: { email: sponsorEmail, name: sponsorName },
    subject: `Update request received for ${childName}`,
    html,
  });
}

/**
 * Send recurring donation thank-you email
 *
 * @returns Structured result with success/failure and data/error
 */
export async function sendRecurringDonationThankYouEmail(
  donorEmail: string,
  donorName: string,
  amount: number,
  currency: string
): Promise<EmailSendResult> {
  const formattedAmount = amount.toFixed(2);
  const impactUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'}/impact`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1a1a1a; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background-color: #1a1a1a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          .amount-box { background-color: #fff; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
          .amount { font-size: 28px; font-weight: bold; color: #1a1a1a; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Thank You for Your Continued Support!</h1>
          </div>
          <div class="content">
            <p>Dear ${donorName},</p>

            <p>Your monthly donation has been processed. Thank you for your ongoing commitment to creating lasting change in Northern Uganda!</p>

            <div class="amount-box">
              <p style="margin: 0; color: #666;">Monthly Donation</p>
              <div class="amount">$${formattedAmount} ${currency.toUpperCase()}</div>
              <p style="margin: 0; font-size: 12px; color: #666;">Processed ${new Date().toLocaleDateString()}</p>
            </div>

            <p>Your consistent support enables us to:</p>
            <ul>
              <li>Plan long-term healthcare programs</li>
              <li>Provide continuous education support</li>
              <li>Sustain vocational training initiatives</li>
              <li>Build lasting community infrastructure</li>
            </ul>

            <p>Monthly donors like you make it possible to create sustainable change rather than one-time interventions. Your ongoing commitment is truly making a difference.</p>

            <div style="text-align: center;">
              <a href="${impactUrl}" class="button">See Your Impact</a>
            </div>

            <p>With gratitude,<br>
            <strong>Kevin C. Hershock</strong><br>
            Founder & Executive Director<br>
            Be A Number, International</p>
          </div>
          <div class="footer">
            <p>Be A Number, International | 501(c)(3) Nonprofit | Tax ID: 46-2612870</p>
            <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'}">www.beanumber.org</a></p>
            <p>To update or cancel your subscription, reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: { email: donorEmail, name: donorName },
    subject: `Thank you for your continued support - $${formattedAmount}/month`,
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
