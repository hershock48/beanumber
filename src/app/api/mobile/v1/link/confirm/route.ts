/**
 * GET /api/mobile/v1/link/confirm?t=<token>
 *
 * The landing side of the mobile email-link flow. The token (minted by
 * /link/request, delivered by email) IS the authentication — whoever
 * opens the link has proven they control the inbox. We stamp
 * mobile_users.linked_sponsor_email and render a small branded page
 * that bounces back into the app.
 *
 * This is a WEB page (opened from a mail client), so the response is
 * HTML, not JSON. The "Open the app" button uses the beanumber://
 * custom scheme; a JS auto-attempt fires too so most users never need
 * the tap. If the app isn't installed on the device that opened the
 * email (e.g. they read mail on a laptop), the page still confirms the
 * link worked — the app picks the new email up on its next refetch.
 */
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { mobileUsers } from '@/lib/db/schema';
import { verifyMobileLinkToken } from '@/lib/mobile-link-tokens';

export const dynamic = 'force-dynamic';

function page(title: string, body: string, deepLink?: string): NextResponse {
  const auto = deepLink
    ? `<script>setTimeout(function () { window.location.href = ${JSON.stringify(deepLink)}; }, 600);</script>`
    : '';
  const button = deepLink
    ? `<p style="text-align:center;margin:28px 0;">
         <a href="${deepLink}" style="display:inline-block;background:#D4A843;color:#0d0d0d;font-weight:bold;text-decoration:none;padding:14px 32px;font-size:15px;letter-spacing:0.05em;text-transform:uppercase;">Open the app</a>
       </p>`
    : '';
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — Be A Number</title>
  </head>
  <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 40px 20px; background:#FFF8F0;">
    <h1 style="font-size: 24px; color: #0d0d0d;">${title}</h1>
    <p>${body}</p>
    ${button}
    <hr style="border:none;border-top:1px solid #e8e0d4;margin:24px 0;">
    <p style="font-size:12px;color:#999;">Be A Number, International · <a href="https://www.beanumber.org" style="color:#D4A843;">beanumber.org</a></p>
    ${auto}
  </body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t');
  const verified = verifyMobileLinkToken(token);
  if (!verified) {
    return page(
      'This link has expired.',
      'Email links are good for 24 hours. Open the Be A Number app and request a fresh one from the same screen — it takes ten seconds.'
    );
  }

  try {
    const updated = await db
      .update(mobileUsers)
      .set({ linkedSponsorEmail: verified.email })
      .where(eq(mobileUsers.id, verified.mobileUserId))
      .returning({ id: mobileUsers.id });

    if (updated.length === 0) {
      // The app account was deleted between request and confirm.
      return page(
        'That app account is gone.',
        'The account this link belongs to no longer exists. Sign in to the app again and re-request the link.'
      );
    }

    console.log(
      `[MobileLink] Linked ${verified.email} to mobile user ${verified.mobileUserId}`
    );
    return page(
      "You're connected.",
      'Your shirts and sponsorships now show up in the Be A Number app under this email. Head back to the app — your kids are waiting.',
      'beanumber:///?linked=1'
    );
  } catch (err) {
    console.error('[MobileLink] confirm error:', err);
    return page(
      'Something went sideways.',
      'The link is valid but we hit a hiccup saving it. Try the link again in a minute — or email kevin@beanumber.org and a person will sort it.'
    );
  }
}
