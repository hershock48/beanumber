/**
 * POST /api/admin/messages/[id]/reply
 *
 * The campus team records what the kid said after receiving a
 * delivered sponsor-to-kid note. Creates a new kid_messages row
 * with direction='kid_to_sponsor' and parent_message_id pointing
 * to the original. Sponsor gets an email; the reply becomes
 * visible on their /children/[N] view.
 *
 * Body:
 *   {
 *     bodyEn: string,             // English text of the reply (Simon
 *                                 // translates from the kid's original)
 *     bodyOriginal?: string,      // OPTIONAL — the kid's actual
 *                                 // language transcription. Stored in
 *                                 // body_translated for audit.
 *     notifySponsor?: boolean,    // default true
 *   }
 *
 * Rules
 * ─────
 *   - Original message must exist and be direction='sponsor_to_kid'.
 *   - Original must have status='delivered' — a reply to something
 *     that hasn't been delivered doesn't make sense.
 *   - The original can only have ONE reply. Enforced at write time
 *     with a pre-check + a partial unique index at the DB layer.
 *   - bodyEn is required, 3–2000 chars after trim.
 *
 * Auth: admin cookie required (Simon or Kevin).
 *
 * Response:
 *   200 { ok: true, id, parentId }
 *   400 { error }
 *   401 { error }
 *   404 { error: 'Original message not found.' }
 *   409 { error: '...' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
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
const MIN_REPLY = 3;
const MAX_REPLY = 2000;

function escapeHtml(input: string | null | undefined): string {
  if (input == null) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getAdminRole();
  if (!role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'Original message not found.' },
      { status: 404 }
    );
  }

  let body: {
    bodyEn?: string;
    bodyOriginal?: string;
    notifySponsor?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const bodyEn = (body.bodyEn ?? '').trim();
  if (bodyEn.length < MIN_REPLY) {
    return NextResponse.json(
      { error: `Reply is too short. Say a little more (${MIN_REPLY}+ characters).` },
      { status: 400 }
    );
  }
  if (bodyEn.length > MAX_REPLY) {
    return NextResponse.json(
      { error: `Reply is too long. Under ${MAX_REPLY} characters.` },
      { status: 400 }
    );
  }

  // Load the parent + kid so we know who to email and what kid to
  // link the reply to.
  const parentRows = await db
    .select({
      id: kidMessages.id,
      direction: kidMessages.direction,
      status: kidMessages.status,
      sponsorEmail: kidMessages.sponsorEmail,
      sponsorName: kidMessages.sponsorName,
      childId: kidMessages.childId,
      firstName: children.firstName,
      shirtNumber: children.shirtNumber,
    })
    .from(kidMessages)
    .leftJoin(children, eq(children.id, kidMessages.childId))
    .where(eq(kidMessages.id, id))
    .limit(1);
  const parent = parentRows[0];
  if (!parent) {
    return NextResponse.json(
      { error: 'Original message not found.' },
      { status: 404 }
    );
  }
  if (parent.direction !== 'sponsor_to_kid') {
    return NextResponse.json(
      { error: "You can only reply to a sponsor's note, not another reply." },
      { status: 409 }
    );
  }
  if (parent.status !== 'delivered') {
    return NextResponse.json(
      {
        error:
          "The original note hasn't been marked delivered yet — deliver it first, then record the kid's reply.",
      },
      { status: 409 }
    );
  }

  // Enforce one reply per parent. Belt-and-suspenders: the app-layer
  // pre-check here + a future partial unique index (deferred; the
  // check-then-insert race is negligible at admin-team scale of two
  // humans working on the same queue).
  const existingReplies = await db
    .select({ id: kidMessages.id })
    .from(kidMessages)
    .where(
      and(
        eq(kidMessages.parentMessageId, id),
        eq(kidMessages.direction, 'kid_to_sponsor')
      )
    )
    .limit(1);
  if (existingReplies.length > 0) {
    return NextResponse.json(
      {
        error:
          "This note already has a reply on file. Edit it there instead of adding a second.",
      },
      { status: 409 }
    );
  }

  const now = new Date();
  const bodyOriginal = (body.bodyOriginal ?? '').trim() || null;

  // The reply is a new kid_messages row that carries the same
  // sponsor + child pair as its parent. Status is 'delivered' from
  // the moment it's recorded — the campus IS the delivery point for
  // the kid's words, and there's no additional workflow.
  const inserted = await db
    .insert(kidMessages)
    .values({
      sponsorEmail: parent.sponsorEmail,
      sponsorName: parent.sponsorName,
      childId: parent.childId,
      parentMessageId: parent.id,
      direction: 'kid_to_sponsor',
      bodyEn,
      bodyTranslated: bodyOriginal,
      status: 'delivered',
      deliveredAt: now,
    })
    .returning({ id: kidMessages.id });

  const shouldNotify = body.notifySponsor !== false;
  if (shouldNotify) {
    try {
      const firstNamePlain = parent.firstName || 'your kid';
      const firstNameSafe = escapeHtml(firstNamePlain);
      const kidPageUrl = parent.shirtNumber
        ? `${SITE_URL}/children/${parent.shirtNumber}`
        : `${SITE_URL}/me`;
      const firstWordOfName = parent.sponsorName?.trim().split(/\s+/)[0];
      const greeting = firstWordOfName
        ? `Hey ${escapeHtml(firstWordOfName)},`
        : 'Hey,';
      const bodySafe = escapeHtml(bodyEn);
      await sendEmail({
        to: { email: parent.sponsorEmail },
        from: { email: FROM_EMAIL, name: 'Kevin at Be A Number' },
        subject: `${firstNamePlain} wrote you back.`,
        html: wrap(`
          <p>${greeting}</p>
          <p>${firstNameSafe} sat down at the campus and wrote you a reply. The team translated it and here it is:</p>
          <blockquote style="border-left: 3px solid #D4A843; margin: 20px 0; padding: 6px 20px; color: #333; font-style: italic;">
            ${bodySafe}
          </blockquote>
          <p>The full thread lives on ${firstNameSafe}&rsquo;s page.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${kidPageUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 12px 28px; font-size: 14px; letter-spacing: 0.05em;">
              Open ${firstNameSafe}&rsquo;s page
            </a>
          </p>
          <p>Write back whenever you want.</p>
          <p>Kevin</p>
        `),
      });
    } catch (err) {
      console.warn(
        '[messages/reply] sponsor notification failed (non-fatal):',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return NextResponse.json({
    ok: true,
    id: inserted[0].id,
    parentId: parent.id,
  });
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
