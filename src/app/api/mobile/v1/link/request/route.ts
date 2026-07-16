/**
 * POST /api/mobile/v1/link/request
 *
 * Body: { email: string } — the purchase/sponsorship email the signed-in
 * mobile user wants to link to their app account.
 *
 * Why this exists: mobile sign-in is Apple/Google, and the email that
 * comes back (often an Apple private relay) frequently is NOT the email
 * the person bought their shirt or started their sponsorship with. Until
 * they link the purchase email, "Your kids" is empty and the app looks
 * broken. This endpoint sends a one-tap confirmation link to the claimed
 * email; only someone who can open that inbox can complete the link —
 * same proof-of-ownership bar as the web magic-link sign-in.
 *
 * Privacy: always returns { success: true } whether or not the email
 * exists anywhere in our data — the endpoint must not be an email-
 * enumeration oracle. The confirmation email is sent regardless of
 * whether the address currently has sponsorships (a buyer might link
 * before their webhook row lands; the link is still valid and the kids
 * appear the moment the data does).
 *
 * Rate limiting: same in-memory per-email throttle as the web
 * send-link route — UX polish against double-taps, not security.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { requireMobileAuth } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { getEmailConfig } from '@/lib/env';
import { makeMobileLinkToken } from '@/lib/mobile-link-tokens';

export const dynamic = 'force-dynamic';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

const schema = z.object({
  email: z.string().email(),
});

const RESEND_WINDOW_MS = 20 * 1000;
const recentSends = new Map<string, number>();
function isThrottled(key: string): boolean {
  const last = recentSends.get(key);
  return Boolean(last && Date.now() - last < RESEND_WINDOW_MS);
}
function markSend(key: string): void {
  const now = Date.now();
  if (recentSends.size > 500) {
    for (const [k, ts] of recentSends) {
      if (now - ts > RESEND_WINDOW_MS) recentSends.delete(k);
    }
  }
  recentSends.set(key, now);
}

export async function POST(request: NextRequest) {
  const responseShape = { success: true };
  const path = '/api/mobile/v1/link/request';

  let viewer: { userId: string; email: string };
  try {
    viewer = await requireMobileAuth(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    const status = message === 'tokenExpired' ? 401 : 401;
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const email = parsed.data.email.trim();
    const emailLower = email.toLowerCase();
    logger.apiRequest('POST', path);

    // Linking your own sign-in email is a no-op the client should
    // prevent, but if it slips through, succeed silently — the
    // provider email is already matched at sign-in.
    if (emailLower === viewer.email.trim().toLowerCase()) {
      return NextResponse.json(responseShape);
    }

    if (isThrottled(`${viewer.userId}:${emailLower}`)) {
      return NextResponse.json(responseShape);
    }

    let token: string;
    try {
      token = makeMobileLinkToken(viewer.userId, emailLower);
    } catch (err) {
      // Missing CRON_SECRET — every link silently fails. Same
      // greppable ATTENTION tag the recovery route uses.
      console.error(
        `[MobileLink] ATTENTION token gen FAILED for user ${viewer.userId}:`,
        err
      );
      return NextResponse.json(responseShape);
    }

    const confirmUrl = `${SITE_URL}/api/mobile/v1/link/confirm?t=${encodeURIComponent(token)}`;
    const fromEmail = getEmailConfig().fromEmail;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
          <p style="margin-top: 0;">Hey there,</p>
          <p>Someone signed in to the Be A Number app and asked to
            connect this email address to their app account. If that
            was you, tap the button below and your shirts and
            sponsorships will show up in the app.</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${confirmUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase;">
              Yes, connect my email
            </a>
          </p>
          <p style="color: #888; font-size: 13px;">
            If you didn&rsquo;t request this, you can ignore this email
            &mdash; nothing changes without the tap. Link is good for
            24 hours.
          </p>
          <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 24px 0;">
          <p style="font-size: 12px; color: #999; line-height: 1.5;">
            Be A Number, International<br>
            <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a>
          </p>
        </body>
      </html>
    `;

    markSend(`${viewer.userId}:${emailLower}`);
    const result = await sendEmail({
      to: { email, name: '' },
      from: { email: fromEmail, name: 'Be A Number' },
      subject: 'Connect this email to your Be A Number app',
      html,
    });
    if (!result.success) {
      console.error(
        `[MobileLink] ATTENTION send FAILED to ${email} for user ${viewer.userId}: ${result.error}`
      );
    }

    logger.apiResponse('POST', path, 200);
    return NextResponse.json(responseShape);
  } catch (err) {
    console.error('[MobileLink] request error:', err);
    return NextResponse.json(responseShape);
  }
}
