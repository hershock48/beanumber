/**
 * Gmail API Service
 * Handles Gmail API authentication and email sending via Google Workspace
 *
 * This module follows the WAT architecture pattern:
 * - Returns structured results { success, data?, error? }
 * - Never throws unhandled exceptions
 * - Logs all operations
 */

import { google } from 'googleapis';
import { logger } from './logger';
import { getEmailConfig, isGmailConfigured } from './env';

// ============================================================================
// TYPES
// ============================================================================

export interface GmailSendOptions {
  to: string | string[];
  from?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface GmailSendResult {
  success: boolean;
  data?: {
    messageId: string;
    provider: 'gmail';
  };
  error?: string;
}

// ============================================================================
// GMAIL CLIENT
// ============================================================================

let gmailClient: ReturnType<typeof google.gmail> | null = null;

/**
 * Initialize Gmail API client with OAuth2
 * Returns null if Gmail is not configured
 */
function getGmailClient(): ReturnType<typeof google.gmail> | null {
  if (gmailClient) {
    return gmailClient;
  }

  if (!isGmailConfigured()) {
    return null;
  }

  const config = getEmailConfig();

  const oauth2Client = new google.auth.OAuth2(
    config.gmailClientId,
    config.gmailClientSecret,
    'urn:ietf:wg:oauth:2.0:oob' // Redirect URI for installed apps
  );

  // Set the refresh token
  oauth2Client.setCredentials({
    refresh_token: config.gmailRefreshToken,
  });

  // Create Gmail API client
  gmailClient = google.gmail({
    version: 'v1',
    auth: oauth2Client,
  });

  return gmailClient;
}

/**
 * Create a MIME message for Gmail API
 */
function createMessage(
  to: string | string[],
  from: string,
  subject: string,
  html: string,
  text?: string,
  replyTo?: string
): string {
  const recipients = Array.isArray(to) ? to.join(', ') : to;
  const textContent = text || stripHtml(html);

  // Create MIME message
  const messageParts = [
    `To: ${recipients}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    replyTo ? `Reply-To: ${replyTo}` : '',
    'Content-Type: multipart/alternative; boundary="boundary123"',
    '',
    '--boundary123',
    'Content-Type: text/plain; charset=utf-8',
    '',
    textContent,
    '',
    '--boundary123',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
    '--boundary123--',
  ].filter(Boolean);

  const message = messageParts.join('\n');

  // Encode to base64url format (Gmail API requirement)
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Send email via Gmail API
 *
 * @param options - Email sending options
 * @returns Structured result with success/failure and data/error
 *
 * @example
 * const result = await sendEmailViaGmail({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<p>Hello World</p>'
 * });
 * if (result.success) {
 *   console.log('Sent:', result.data?.messageId);
 * } else {
 *   console.error('Failed:', result.error);
 * }
 */
export async function sendEmailViaGmail(options: GmailSendOptions): Promise<GmailSendResult> {
  // Validate Gmail is configured
  if (!isGmailConfigured()) {
    logger.warn('Gmail send attempted but Gmail is not configured');
    return {
      success: false,
      error: 'Gmail is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN environment variables.',
    };
  }

  // Validate required fields
  if (!options.to || (Array.isArray(options.to) && options.to.length === 0)) {
    return {
      success: false,
      error: 'Email recipient (to) is required.',
    };
  }

  if (!options.subject) {
    return {
      success: false,
      error: 'Email subject is required.',
    };
  }

  if (!options.html) {
    return {
      success: false,
      error: 'Email content (html) is required.',
    };
  }

  try {
    const config = getEmailConfig();
    const gmail = getGmailClient();

    if (!gmail) {
      return {
        success: false,
        error: 'Failed to initialize Gmail client.',
      };
    }

    const fromAddress = options.from || config.gmailUserEmail || config.fromEmail;
    const recipients = Array.isArray(options.to) ? options.to : [options.to];

    // Create the message
    const rawMessage = createMessage(
      options.to,
      fromAddress,
      options.subject,
      options.html,
      options.text,
      options.replyTo
    );

    // Send the message
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
      },
    });

    const messageId = response.data.id || 'unknown';

    logger.info('Email sent successfully via Gmail', {
      to: recipients.map(r => logger.maskEmail(r)),
      subject: options.subject,
      messageId,
    });

    return {
      success: true,
      data: {
        messageId,
        provider: 'gmail',
      },
    };
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string; response?: { data?: unknown } };
    const recipients = Array.isArray(options.to) ? options.to : [options.to];

    logger.error('Failed to send email via Gmail', {
      to: recipients.map(r => logger.maskEmail(r)),
      subject: options.subject,
      error: err.message,
      details: err.response?.data,
    });

    // Return specific error messages for known Gmail API errors
    if (err.code === 401) {
      return {
        success: false,
        error: 'Gmail authentication failed. Please check your refresh token.',
      };
    } else if (err.code === 403) {
      return {
        success: false,
        error: 'Gmail API permission denied. Please check your OAuth scopes.',
      };
    } else if (err.code === 429) {
      return {
        success: false,
        error: 'Gmail API rate limit exceeded. Please try again later.',
      };
    }

    return {
      success: false,
      error: err.message || 'Failed to send email via Gmail.',
    };
  }
}

// Re-export isGmailConfigured from env.ts for backwards compatibility
export { isGmailConfigured } from './env';

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
