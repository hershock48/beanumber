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
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { kidMessages, children, sponsorships } from '@/lib/db/schema';
import { getAdminRole } from '@/lib/admin-session';
import { sendEmail, sendKevinDeclineAlert } from '@/lib/email';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';

/**
 * HTML-escape a string before interpolating into an email template.
 * The email templates below build raw HTML with template literals,
 * so any interpolated value that came from user-editable data
 * (kid.firstName, sponsor.sponsorName) would inject if it contained
 * markup. In practice only admin roles can set those fields today,
 * but the escape is a cheap defensive layer and matches what a
 * modern template renderer would do automatically.
 */
function escapeHtml(input: string | null | undefined): string {
  if (input == null) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface PatchBody {
  action?: string;
  bodyTranslated?: string;
  simonNotes?: string;
  notifySponsor?: boolean;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getAdminRole();
  if (!role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  // Guard the URL param before the query hits Postgres. Without this,
  // any request to /api/admin/messages/not-a-uuid throws inside the
  // driver and returns a 500 instead of a proper 404. Cheap check,
  // cleaner surface.
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  }

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
      // Needed by the 'deliver' gate — deliver is refused when
      // there's no translation on file (either already stored here or
      // being submitted in this same PATCH).
      bodyTranslated: kidMessages.bodyTranslated,
      // Needed by the Kevin decline alert — falls back to the existing
      // simon_notes when this PATCH doesn't include a fresh one.
      simonNotes: kidMessages.simonNotes,
      childId: kidMessages.childId,
      firstName: children.firstName,
      displayName: children.displayName,
      // childIdLegacy for the channel-tag sponsorship lookup below.
      childIdLegacy: children.childId,
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

  // simonNotes: only overwrite when the client submitted a non-empty
  // string. An empty submission on decline used to blow away a prior
  // reason and made the Kevin decline alert read "No reason logged"
  // even when Simon had left notes earlier. Trimmed comparison so
  // whitespace-only submissions don't clobber either.
  if (typeof body.simonNotes === 'string' && body.simonNotes.trim().length > 0) {
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
      // Move to 'translated' — the note is now ready for the campus
      // delivery batch. Status stays there until Simon marks
      // delivered (or declines).
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
      // A note can't be marked delivered until a translation exists.
      // Previously the endpoint allowed pending -> delivered, which
      // meant Simon could accidentally deliver an untranslated note
      // (nobody at the campus could actually read it to the kid).
      // Accept an incoming translation in the same PATCH so Simon
      // can save+deliver in one click from the queue UI — the client
      // sends bodyTranslated when he has unsaved textarea edits.
      const incomingTranslation = (body.bodyTranslated ?? '').trim();
      const storedTranslation = (message.bodyTranslated ?? '').trim();
      const nextTranslation = incomingTranslation || storedTranslation;
      if (!nextTranslation) {
        return NextResponse.json(
          {
            error:
              'Translate this note before marking delivered — the kid needs the translated version.',
          },
          { status: 409 }
        );
      }
      // Persist the incoming translation if it differs from what's
      // stored. Also stamp translatedAt for the audit trail so we
      // have a real "when was this translated" timestamp even for
      // the save-and-deliver-in-one-click path.
      if (incomingTranslation && incomingTranslation !== storedTranslation) {
        patch.bodyTranslated = incomingTranslation;
        patch.translatedAt = now;
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
      const firstNameSafe = escapeHtml(message.firstName || 'your kid');
      const shirtNumber = message.shirtNumber;
      const kidPageUrl = shirtNumber
        ? `${SITE_URL}/children/${shirtNumber}`
        : `${SITE_URL}/me`;
      // Trim BEFORE splitting so a sponsor name of "  " doesn't
      // yield "Hey ," with the stray comma and space. Also escape
      // the fragment before it lands in the email HTML.
      const firstWordOfName = message.sponsorName?.trim().split(/\s+/)[0];
      const greeting = firstWordOfName
        ? `Hey ${escapeHtml(firstWordOfName)},`
        : 'Hey,';
      // Subject is plain text (no HTML), but the plain-text
      // rendering of the kid's name should still be the actual
      // name — so pass the unescaped version to the subject and
      // the escaped version to the HTML body.
      const firstNamePlain = message.firstName || 'your kid';
      const subject =
        action === 'deliver'
          ? `Your penpal note reached ${firstNamePlain}.`
          : 'A note about your recent penpal note';
      const html =
        action === 'deliver'
          ? deliveredEmailHtml({
              greeting,
              firstName: firstNameSafe,
              kidPageUrl,
            })
          : declinedEmailHtml({ greeting, firstName: firstNameSafe });
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

  // Kevin's decline alert — fires whenever Simon declines a note,
  // regardless of whether the sponsor was notified. Kevin sees Simon's
  // reason (from simon_notes) and can decide whether to reach out
  // manually. Non-fatal, same posture as the other alerts.
  if (action === 'decline') {
    try {
      // Use whatever simon_notes ended up on the row after this patch —
      // could be a fresh value from this PATCH or an older value left
      // alone. patch.simonNotes is set higher up when the client sends
      // it; fall back to whatever was on the message before.
      const declinedNotes =
        typeof patch.simonNotes === 'string'
          ? patch.simonNotes
          : message.simonNotes ?? null;
      // Same channel-tag lookup as the initial note-alert email. See
      // /api/sponsor/notes/route.ts for the rationale — childRevealedAt
      // tells us whether the sponsor holds this specific kid's shirt.
      // Non-fatal — falls through as co-sponsor on error.
      let sponsorHoldsShirt = false;
      try {
        // Match uuid childId OR legacy childIdLegacy — same OR pattern
        // as /api/sponsor/notes so shirt-holder sponsorships joined via
        // the legacy id still resolve. Order by childRevealedAt DESC
        // so a shirt-linked row beats a co-sponsor row when both exist.
        const spRows = await db
          .select({ childRevealedAt: sponsorships.childRevealedAt })
          .from(sponsorships)
          .where(
            and(
              sql`lower(${sponsorships.sponsorEmail}) = lower(${message.sponsorEmail})`,
              or(
                eq(sponsorships.childId, message.childId),
                message.childIdLegacy
                  ? eq(sponsorships.childIdLegacy, message.childIdLegacy)
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
      await sendKevinDeclineAlert({
        noteId: id,
        sponsorEmail: message.sponsorEmail,
        sponsorName: message.sponsorName,
        kidFirstName: message.firstName || 'the kid',
        kidDisplayName: message.displayName || message.firstName || 'the kid',
        shirtNumber: message.shirtNumber ?? null,
        sponsorHoldsShirt,
        bodyEn: message.bodyEn,
        simonNotes: declinedNotes,
        notifiedSponsor: shouldNotify,
      });
    } catch (err) {
      console.warn(
        '[messages] Kevin decline alert failed (non-fatal):',
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
    <p>Your penpal note reached ${firstName} at the campus today. The team read it out loud, translated it where it needed to be, and handed the paper over.</p>
    <p>You can write another penpal note whenever you want — the composer is on ${firstName}'s page.</p>
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
    <p>Wanted to give you a heads up — the last penpal note you wrote to ${firstName} didn't make it into this week's campus batch. If that's confusing, hit reply and I'll walk you through it.</p>
    <p>Nothing broken. You can write another penpal note whenever you want.</p>
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
