/**
 * POST /api/admin/messages/[id]/resend-notification
 *
 * Fires (or re-fires) the sponsor-reply notification email for a
 * kid_to_sponsor reply row. Idempotent-ish: if the sponsor already
 * got the original notification, they now get a second one — which
 * is annoying but strictly better than the alternative (Kevin has
 * no way to know the first landed and no way to correct if it
 * didn't).
 *
 * Called from the admin queue's "Resend notification" button which
 * shows on any reply row where sponsor_notified_at is NULL. Also
 * safe to call directly for any reply id if a sponsor emails Kevin
 * asking where the letter is.
 *
 * Auth: admin cookie required.
 *
 * Body: none. The reply id comes from the URL.
 *
 * Response:
 *   200 { ok: true, notifiedAt }
 *   400 { error }  — reply id malformed or row isn't a kid_to_sponsor
 *   401 { error }
 *   404 { error: 'Reply not found.' }
 *   502 { error }  — sendEmail threw (SendGrid is down, key rotated, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { kidMessages, children } from '@/lib/db/schema';
import { getAdminRole } from '@/lib/admin-session';
import { sendEmail } from '@/lib/email';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
const FROM_EMAIL =
  process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getAdminRole();
  if (!role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Reply not found.' }, { status: 404 });
  }

  // Load the reply row + the joined kid context so we can rebuild
  // the same email body the original send used.
  const rows = await db
    .select({
      id: kidMessages.id,
      direction: kidMessages.direction,
      sponsorEmail: kidMessages.sponsorEmail,
      sponsorName: kidMessages.sponsorName,
      childShirtNumber: children.shirtNumber,
      childFirstName: children.firstName,
    })
    .from(kidMessages)
    .leftJoin(children, eq(children.id, kidMessages.childId))
    .where(eq(kidMessages.id, id))
    .limit(1);
  const reply = rows[0];
  if (!reply) {
    return NextResponse.json({ error: 'Reply not found.' }, { status: 404 });
  }
  if (reply.direction !== 'kid_to_sponsor') {
    return NextResponse.json(
      { error: "Only kid→sponsor replies have a sponsor notification to resend." },
      { status: 400 }
    );
  }

  const firstNamePlain = reply.childFirstName || 'your penpal';
  const firstNameSafe = escapeHtml(firstNamePlain);
  const kidPageUrl = reply.childShirtNumber
    ? `${SITE_URL}/children/${reply.childShirtNumber}#note-${reply.id}`
    : `${SITE_URL}/me`;
  const firstWordOfName = reply.sponsorName?.trim().split(/\s+/)[0];
  const greeting = firstWordOfName
    ? `Hey ${escapeHtml(firstWordOfName)},`
    : 'Hey,';

  try {
    await sendEmail({
      to: { email: reply.sponsorEmail },
      from: { email: FROM_EMAIL, name: 'Kevin at Be A Number' },
      subject: `A penpal letter from ${firstNamePlain}.`,
      html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
<p>${greeting}</p>
<p>Your penpal ${firstNameSafe} sat down at the campus and wrote you a reply. It&rsquo;s waiting for you on their page.</p>
<p style="text-align: center; margin: 28px 0;">
  <a href="${kidPageUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">
    Read ${firstNameSafe}&rsquo;s penpal letter
  </a>
</p>
<p>Write your penpal back whenever you want.</p>
<p>Kevin</p>
<hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">
<p style="font-size: 12px; color: #999; line-height: 1.5;">
  Be A Number, International<br>
  <a href="${SITE_URL}" style="color: #D4A843;">beanumber.org</a>
</p>
</body></html>`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Email send failed: ${err.message}`
            : 'Email send failed.',
      },
      { status: 502 }
    );
  }

  const now = new Date();
  try {
    await db
      .update(kidMessages)
      .set({ sponsorNotifiedAt: now })
      .where(eq(kidMessages.id, reply.id));
  } catch {
    // If the stamp fails, the email still went out. Report ok:true
    // but flag that we couldn't record it, so the button retries
    // gracefully next time.
    return NextResponse.json({
      ok: true,
      notifiedAt: null,
      warning: 'Email sent, but the timestamp write failed. Try again to record it.',
    });
  }

  return NextResponse.json({
    ok: true,
    notifiedAt: now.toISOString(),
  });
}
