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
 *     bodyEn: string,             // English translation of the reply
 *                                 // (short — one to a few sentences,
 *                                 // supplied by Simon or the social
 *                                 // worker who reads what the kid wrote).
 *     bodyOriginal?: string,      // OPTIONAL — the kid's actual
 *                                 // language transcription. Stored in
 *                                 // body_translated for audit.
 *     imageUrl?: string,          // OPTIONAL — public URL of the
 *                                 // scanned handwritten reply photo,
 *                                 // uploaded via
 *                                 // POST /api/admin/messages/[id]/reply-photo
 *                                 // right before this call. Required
 *                                 // by the admin UI policy from 2026-07-08
 *                                 // for new replies; kept optional at
 *                                 // the API layer so legacy typed-only
 *                                 // replies can still be recorded.
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
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { kidMessages, children, sponsorships } from '@/lib/db/schema';
import { getAdminRole } from '@/lib/admin-session';
import { sendEmail, sendKevinReplyAlert } from '@/lib/email';
import { sendPush, resolveMobileUserIdForEmail } from '@/lib/push/send';

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
    imageUrl?: string;
    notifySponsor?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const bodyEn = (body.bodyEn ?? '').trim();
  const rawImageUrl = (body.imageUrl ?? '').trim() || null;

  // If an image URL is supplied it must be a well-formed http(s) URL.
  // We don't require it to be a specific host — Supabase URLs come
  // back from our own upload endpoint and the caller is admin-gated —
  // but a broken URL now is a permanent broken image in the sponsor's
  // thread, so we reject obvious garbage. Cast to URL to validate;
  // any parse failure falls through as null with an error surface.
  let imageUrl: string | null = null;
  if (rawImageUrl) {
    try {
      const u = new URL(rawImageUrl);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        throw new Error('bad protocol');
      }
      imageUrl = u.toString();
    } catch {
      return NextResponse.json(
        {
          error:
            'The reply photo URL looks malformed. Re-upload the photo and try again.',
        },
        { status: 400 }
      );
    }
  }
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
      displayName: children.displayName,
      // childIdLegacy needed for the sponsorship channel-tag lookup
      // below — some legacy sponsorship rows are joined via the legacy
      // string id rather than the uuid. Matching the same OR pattern
      // /api/sponsor/notes uses avoids a bogus "Co-sponsor" tag for a
      // shirt-holder whose row only has childIdLegacy populated.
      childIdLegacy: children.childId,
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
  //
  // Belt-and-suspenders on the one-reply-per-parent invariant:
  //   1. Pre-check above rejects the obvious case (409).
  //   2. Partial unique index kid_messages_one_reply_per_parent_idx
  //      catches two-admins-clicking-simultaneously race conditions
  //      that slip past the pre-check. Postgres returns 23505 and
  //      we surface it as the same 409.
  let inserted;
  try {
    inserted = await db
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
        // Scanned handwritten reply photo (2026-07-08 workflow).
        // Null on typed-only replies.
        replyImageUrl: imageUrl,
        replyImageUploadedAt: imageUrl ? now : null,
      })
      .returning({ id: kidMessages.id });
  } catch (err: unknown) {
    const pgCode =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';
    if (pgCode === '23505') {
      return NextResponse.json(
        {
          error:
            'This note already has a reply on file. Edit it there instead of adding a second.',
        },
        { status: 409 }
      );
    }
    throw err;
  }

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
      // Teaser only — no body preview. The reply itself lives on the
      // site so sponsors have to click through to read it. Keeps the
      // emotional pull ("[Kid] wrote you back") without giving away
      // the moment in Gmail, and gets them back to /children/[N]
      // where the whole thread + kid page context sits.
      await sendEmail({
        to: { email: parent.sponsorEmail },
        from: { email: FROM_EMAIL, name: 'Kevin at Be A Number' },
        subject: `A penpal letter from ${firstNamePlain}.`,
        html: wrap(`
          <p>${greeting}</p>
          <p>Your penpal ${firstNameSafe} sat down at the campus this week and wrote you a reply. The team translated it and it&rsquo;s waiting for you on their page.</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${kidPageUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em;">
              Read ${firstNameSafe}&rsquo;s penpal letter
            </a>
          </p>
          <p>Write your penpal back whenever you want.</p>
          <p>Kevin</p>
        `),
      });
    } catch (err) {
      console.warn(
        '[messages/reply] sponsor notification failed (non-fatal):',
        err instanceof Error ? err.message : String(err)
      );
    }

    // Push notification — best-effort, mirrors the email. If the
    // sponsor has the app installed and permissions granted, they
    // get the "[Kid] wrote you back" tap-to-open card.
    try {
      const sponsorUserId = await resolveMobileUserIdForEmail(
        parent.sponsorEmail
      );
      if (sponsorUserId) {
        await sendPush({
          kind: 'kidReplied',
          kidId: parent.childId,
          sponsorUserId,
          notePreview: bodyEn,
        });
      }
    } catch (err) {
      console.warn(
        '[messages/reply] push notification failed (non-fatal):',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Kevin's copy — fires regardless of the sponsor notifyFlag because
  // Kevin's admin awareness of the reply is independent of whether
  // the sponsor was emailed. Fully non-fatal: any failure here just
  // gets logged and swallowed so a Gmail blip doesn't take down the
  // admin reply POST.
  try {
    // Look up whether the sponsor holds THIS kid's shirt so the alert
    // can render the same "Holds #N" vs "Co-sponsor" tag as the initial
    // note-alert email. childRevealedAt is set only when the sponsor
    // claimed via Hold-to-Meet. Non-fatal — if the lookup errors, we
    // treat it as "we don't know" and fall through as co-sponsor.
    let sponsorHoldsShirt = false;
    try {
      // Match either uuid childId OR legacy childIdLegacy so shirt-
      // holder sponsorships whose row uses only the legacy id
      // (a real historical shape) also resolve. Order by
      // childRevealedAt DESC nulls last so if the sponsor has both a
      // shirt-linked row AND a co-sponsor row for the same kid, the
      // shirt-linked one wins the tag.
      const spRows = await db
        .select({ childRevealedAt: sponsorships.childRevealedAt })
        .from(sponsorships)
        .where(
          and(
            sql`lower(${sponsorships.sponsorEmail}) = lower(${parent.sponsorEmail})`,
            or(
              eq(sponsorships.childId, parent.childId),
              parent.childIdLegacy
                ? eq(sponsorships.childIdLegacy, parent.childIdLegacy)
                : sql`false`
            )
          )
        )
        .orderBy(desc(sponsorships.childRevealedAt))
        .limit(1);
      sponsorHoldsShirt = !!spRows[0]?.childRevealedAt;
    } catch {
      // Fall through with sponsorHoldsShirt=false.
    }
    await sendKevinReplyAlert({
      replyId: inserted[0].id,
      parentMessageId: parent.id,
      sponsorEmail: parent.sponsorEmail,
      sponsorName: parent.sponsorName,
      kidFirstName: parent.firstName || 'the kid',
      kidDisplayName: parent.displayName || parent.firstName || 'the kid',
      shirtNumber: parent.shirtNumber ?? null,
      sponsorHoldsShirt,
      replyBodyEn: bodyEn,
    });
  } catch (err) {
    console.warn(
      '[messages/reply] Kevin alert failed (non-fatal):',
      err instanceof Error ? err.message : String(err)
    );
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
