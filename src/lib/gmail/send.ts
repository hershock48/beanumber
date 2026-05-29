/**
 * Gmail · send email via the Gmail API.
 *
 * Uses the stored refresh token to mint a fresh access token, then
 * builds a base64url-encoded RFC 2822 message and POSTs it to the
 * Gmail send endpoint. The email goes from Kevin's authorized Gmail
 * account (whatever address granted OAuth consent), lands in his
 * Sent folder, and is delivered like any other email he writes.
 *
 * If the refresh token has been revoked or expired, send throws —
 * callers should surface the error so Kevin knows to reconnect via
 * /admin/connect-gmail.
 */

import { refreshAccessToken } from './oauth';
import { getSetting, setSetting, SETTING_KEYS } from '../admin/settings';

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Plain text body. Line breaks preserved. Signature is appended
   *  server-side if `appendSignature` is true. */
  body: string;
  appendSignature?: boolean;
}

export interface SendEmailResult {
  messageId: string;
  threadId: string;
  fromEmail: string;
}

/** Base64url-encode a string (replace +/= per RFC 4648 §5). */
function base64UrlEncode(s: string): string {
  // Buffer is available in Node runtime.
  return Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Build an RFC 2822 message. Keep it minimal: from + to + subject +
 *  body. Plain text only for v1. If we want HTML later, switch
 *  Content-Type to text/html and ensure the body is well-formed. */
function buildMimeMessage(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  // Encode subject with MIME encoded-word if it contains non-ASCII.
  const subject = /[^\x00-\x7F]/.test(opts.subject)
    ? `=?utf-8?B?${Buffer.from(opts.subject, 'utf8').toString('base64')}?=`
    : opts.subject;

  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
  ].join('\r\n');

  return `${headers}\r\n\r\n${opts.body}`;
}

export async function sendEmailViaGmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const refreshToken = await getSetting(SETTING_KEYS.gmailRefreshToken);
  if (!refreshToken) {
    throw new Error(
      'Gmail is not connected yet. Visit /admin/connect-gmail to authorize.'
    );
  }
  const fromEmail = (await getSetting(SETTING_KEYS.gmailAuthorizedEmail)) || '';
  if (!fromEmail) {
    throw new Error(
      'Gmail authorized email is missing. Re-run the /admin/connect-gmail flow.'
    );
  }

  const tokens = await refreshAccessToken(refreshToken);
  // Google occasionally rotates refresh tokens. Save the new one.
  if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
    await setSetting(SETTING_KEYS.gmailRefreshToken, tokens.refresh_token);
  }

  let body = input.body;
  if (input.appendSignature !== false) {
    const sig = (await getSetting(SETTING_KEYS.gmailSignature)) || '';
    if (sig.trim()) {
      body = body.replace(/\n+$/, '') + '\n\n' + sig.replace(/\n+$/, '') + '\n';
    }
  }

  const mime = buildMimeMessage({
    from: fromEmail,
    to: input.to,
    subject: input.subject,
    body,
  });
  const raw = base64UrlEncode(mime);

  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string; threadId?: string };
  return {
    messageId: data.id || '',
    threadId: data.threadId || '',
    fromEmail,
  };
}
