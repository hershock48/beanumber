/**
 * PATCH /api/admin/messages/[id]
 *
 * Simon or Kevin updates a message row through the workflow:
 *   - Simon writes a translation → status='translated', translated_at set
 *   - Simon or Kevin marks delivered → status='delivered', delivered_at set,
 *     sponsor gets a notification email
 *   - Simon or Kevin declines → status='declined', declined_at set,
 *     sponsor gets a soft explanation email (or none, at their choice)
 *
 * Body:
 *   {
 *     action: 'translate' | 'deliver' | 'decline' | 'edit-notes',
 *     bodyTranslated?: string,   // required for translate
 *     simonNotes?: string,       // optional on any action
 *     notifySponsor?: boolean,   // deliver: default true; decline: default true
 *   }
 *
 * Auth: admin cookie required. Both Simon and Kevin can act on any
 * message.
 *
 * Response:
 *   { ok: true, id, status }
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { kidMessages, children } from '@/lib/db/schema';
import { getAdminRole } from '@/lib/admin-session';
import { sendEmail } from '@/lib/email';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';

interface PatchBody {
  action?: string;
  bodyTranslated?: string;
  simonNotes?: string;
  notifySponsor?: boolean;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getAdminRole();
  if (!role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const action = body.action;

  // Load the message + linked kid for the sponsor notification templates.
  const rows = await db
    .select({
      id: kidMessages.id,
      sponsorEmail: kidMessages.sponsorEmail,
      sponsorName: kidMessages.sponsorName,
      status: kidMessages.status,
      bodyEn: kidMessages.bodyEn,
      childId: kidMessages.childId,
      firstName: children.firstName,
      shirtNumber: children.shirtNumber,
    })
    .from(kidMessages)
    .leftJoin(children, eq(children.id, kidMessages.childId))
    .where(eq(kidMessages.id, id))
    .limit(1);
  const message = rows[0];
  if (!message) {
    return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  }

  const now = new Date();
  const patch: Record<string, unknown> = {
    updatedAt: now,
  };

  if (typeof body.simonNotes === 'string') {
    patch.simonNotes = body.simonNotes;
  }

  switch (action) {
    case 'translate': {
      const translation = (body.bodyTranslated ?? '').trim();
      if (translation.length < 3) {
        return NextResponse.json(
          { error: 'Translation is required and must be at least a few characters.' },
          { status: 400 }
        );
      }
      patch.bodyTranslated = translation;
      patch.translatedAt = now;
      // Keep status at 'pending' if this is the first translation
      // pass and Simon hasn't marked delivered yet — 'translated'
      // means it's ready for the campus batch.
      patch.status = 'translated';
      break;
    }
    case 'deliver': {
      if (message.status === 'declined') {
        return NextResponse.json(
          { error: 'This message was declined and can\'t be delivered.' },
          { status: 409 }
        );
      }
      patch.deliveredAt = now;
      patch.status = 'delivered';
      break;
    }
    case 'decline': {
      if (message.status === 'delivered') {
        return NextResponse.json(
          { error: 'This message was already delivered.' },
          { status: 409 }
        );
      }
      patch.declinedAt = now;
      patch.status = 'declined';
      break;
    }
    case 'edit-notes': {
      // simon_notes-only update; no status change. Handled by the
      // simonNotes assignment above. Nothing else to do.
      break;
    }
    default: {
      return NextResponse.json(
        { error: 'Unknown action.' },
        { status: 400 }
      );
    }
  }

  await db.update(kidMessages).set(patch).where(eq(kidMessages.id, id));

  // Sponsor notification for deliver / decline. Best-effort — don't
  // fail the API if SendGrid is having a moment.
  const shouldNotify = body.notifySponsor !== false;
  if (shouldNotify && (action === 'deliver' || action === 'decline')) {
    try {
      const firstName = message.firstName || 'your kid';
      const shirtNumber = message.shirtNumber;
      const kidPageUrl = shirtNumber
        ? `${SITE_URL}/children/${shirtNumber}`
        : `${SITE_URL}/me`;
      const greeting = message.sponsorName
        ? `Hey ${message.sponsorName.split(' ')[0]},`
        : 'Hey,';
      const subject =
        action === 'deliver'
          ? `Your note reached ${firstName}.`
          : 'A note about your recent message';
      const html =
        action === 'deliver'
          ? deliveredEmailHtml({ greeting, firstName, kidPageUrl })
          : declinedEmailHtml({ greeting, firstName });
      await sendEmail({
        to: { email: message.sponsorEmail },
        from: { email: FROM_EMAIL, name: 'Kevin at Be A Number' },
        subject,
        html,
      });
    } catch (err) {
      console.warn(
        '[messages] sponsor notification failed (non-fatal):',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return NextResponse.json({
    ok: true,
    id,
    status: patch.status ?? message.status,
  });
}

// ─── Sponsor notification templates ─────────────────────────────

function deliveredEmailHtml({
  greeting,
  firstName,
  kidPageUrl,
}: {
  greeting: string;
  firstName: string;
  kidPageUrl: string;
}): string {
  return wrap(`
    <p>${greeting}</p>
    <p>Simon delivered your note to ${firstName} at the campus. He read it out loud, translated where it needed to be, and handed the paper over.</p>
    <p>You can write another whenever you want — the composer is on ${firstName}'s page.</p>
    <p style="text-align: center; margin: 24px 0;">
      <a href="${kidPageUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 12px 28px; font-size: 14px; letter-spacing: 0.05em;">
        Open ${firstName}'s page
      </a>
    </p>
    <p>Kevin</p>
  `);
}

function declinedEmailHtml({
  greeting,
  firstName,
}: {
  greeting: string;
  firstName: string;
}): string {
  return wrap(`
    <p>${greeting}</p>
    <p>Wanted to give you a heads up — the last note you wrote to ${firstName} didn't make it into this week's campus batch. If that's confusing, hit reply and I'll walk you through it.</p>
    <p>Nothing broken. You can write another whenever you want.</p>
    <p>Kevin</p>
  `);
}

function wrap(inner: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
${inner}
<hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">
<p style="font-size: 12px; color: #999; line-height: 1.5;">
  Be A Number, International<br>
  <a href="${SITE_URL}" style="color: #D4A843;">beanumber.org</a>
</p>
</body></html>`;
}
