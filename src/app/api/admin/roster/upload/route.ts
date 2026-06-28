/**
 * Admin · Roster file upload — attach a report card, letter, or
 * profile photo to a kid.
 *
 * POST /api/admin/roster/upload
 * Body: {
 *   shirtNumber: number,
 *   kind: 'report_card' | 'letter' | 'photo',
 *   filename: string,
 *   contentType: string,
 *   data: string (base64, no data: prefix),
 *   skipNotify?: boolean,
 * }
 *
 * Uploads the file to Supabase Storage, then appends the URL to the
 * appropriate jsonb column on the children row:
 *   - report_card → reportCardUrls
 *   - letter      → letterUrls
 *   - photo       → photoUrls (and promote to profilePhotoUrl if
 *                   there's no primary yet)
 *
 * For report_card and letter, fires a sponsor notification email to
 * every active sponsor of this child (unless skipNotify is true).
 * Photos never notify.
 *
 * Auth: cookie or X-Admin-Token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';
import { sendEmail } from '@/lib/email';
import { db } from '@/lib/db/client';
import { children, sponsorships } from '@/lib/db/schema';
import { audit } from '@/lib/db/mutations';
import { and, eq, or } from 'drizzle-orm';
import { uploadAttachment } from '@/lib/storage';

const MAX_BASE64_BYTES = 5 * 1024 * 1024;

interface AttachmentMeta {
  url: string;
  filename: string;
  size?: number;
  type?: string;
}

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Distinguish Simon&rsquo;s uploads from Kevin&rsquo;s. Simon&rsquo;s photo writes
  // land in pendingDraft for Kevin to approve; Simon must not be
  // able to swap the public-facing primary photo on his own. Reports
  // and letters are sponsor-only documents the public never sees,
  // so those still flow through immediately under Simon&rsquo;s session.
  const role = await getAdminRole();
  const isSimon = role === 'simon';

  let body: {
    shirtNumber?: number;
    kind?: 'report_card' | 'letter' | 'photo';
    filename?: string;
    contentType?: string;
    data?: string;
    skipNotify?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const shirtNumber = body.shirtNumber;
  const kind = body.kind;
  const filename = body.filename;
  const contentType = body.contentType;
  const data = body.data;

  if (typeof shirtNumber !== 'number' || !Number.isInteger(shirtNumber)) {
    return NextResponse.json({ error: 'shirtNumber required' }, { status: 400 });
  }
  if (kind !== 'report_card' && kind !== 'letter' && kind !== 'photo') {
    return NextResponse.json(
      { error: 'kind must be report_card, letter, or photo' },
      { status: 400 }
    );
  }
  if (!filename || !contentType || !data) {
    return NextResponse.json(
      { error: 'filename, contentType, and data are required' },
      { status: 400 }
    );
  }
  if (data.length > MAX_BASE64_BYTES) {
    return NextResponse.json(
      { error: 'File too large (max ~3.7 MB). Compress and try again.' },
      { status: 413 }
    );
  }

  try {
    const kid = (
      await db
        .select()
        .from(children)
        .where(eq(children.shirtNumber, shirtNumber))
        .limit(1)
    )[0];
    if (!kid) {
      return NextResponse.json(
        { error: `No kid found for shirt #${shirtNumber}` },
        { status: 404 }
      );
    }

    const kindToStorageKind: Record<typeof kind, string> = {
      report_card: 'report-cards',
      letter: 'letters',
      photo: 'profile-photos',
    };
    const uploadResult = await uploadAttachment({
      kind: kindToStorageKind[kind],
      scope: kid.id,
      filename,
      contentType,
      data,
    });

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const newSize = Buffer.byteLength(data, 'base64');
    const attachment: AttachmentMeta = {
      url: uploadResult.publicUrl,
      filename,
      size: newSize,
      type: contentType,
    };

    if (kind === 'report_card') {
      const existing = (kid.reportCardUrls || []) as AttachmentMeta[];
      patch.reportCardUrls = [...existing, attachment];
    } else if (kind === 'letter') {
      const existing = (kid.letterUrls || []) as AttachmentMeta[];
      patch.letterUrls = [...existing, attachment];
    } else {
      // photo upload behavior depends on role.
      //
      //   role=admin (Kevin): append to photoUrls; promote to
      //     profilePhotoUrl if no primary exists. Goes live
      //     immediately.
      //
      //   role=simon: park in pendingDraft.profilePhotoUrl. Kevin
      //     promotes via the review queue. Photos never go live
      //     under Simon&rsquo;s session — same gate as text fields. The
      //     `pendingFields` array gets `profilePhotoUrl` added so
      //     the review page surfaces the change.
      if (isSimon) {
        const draft = (kid.pendingDraft || {}) as Record<string, unknown>;
        const existingFields = (kid.pendingFields || []) as string[];
        patch.pendingDraft = {
          ...draft,
          profilePhotoUrl: uploadResult.publicUrl,
        };
        patch.pendingFields = existingFields.includes('profilePhotoUrl')
          ? existingFields
          : [...existingFields, 'profilePhotoUrl'];
        patch.lastEditedBySimon = new Date();
      } else {
        const existing = (kid.photoUrls || []) as string[];
        patch.photoUrls = [...existing, uploadResult.publicUrl];
        if (!kid.profilePhotoUrl) {
          patch.profilePhotoUrl = uploadResult.publicUrl;
        }
      }
    }

    await db.update(children).set(patch).where(eq(children.id, kid.id));

    await audit({
      table: 'children',
      recordId: kid.id,
      action: 'UPDATE',
      actorType: 'admin',
      actorId: role || 'admin',
      before: kid as unknown as Record<string, unknown>,
      after: { ...(kid as unknown as Record<string, unknown>), ...patch },
    });

    // Sponsor notification.
    let notifyResult: { sent: number; failed: number; skipped?: boolean } = {
      sent: 0,
      failed: 0,
    };
    if (body.skipNotify || kind === 'photo') {
      notifyResult = { sent: 0, failed: 0, skipped: true };
    } else {
      try {
        notifyResult = await notifySponsorsOfDocument({
          kid,
          shirtNumber,
          kind,
        });
      } catch (err) {
        console.warn('[roster/upload] notification failed (non-fatal):', err);
      }
    }

    return NextResponse.json({
      ok: true,
      kind,
      url: uploadResult.publicUrl,
      notify: notifyResult,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}

async function notifySponsorsOfDocument(opts: {
  kid: typeof children.$inferSelect;
  shirtNumber: number;
  kind: 'report_card' | 'letter';
}): Promise<{ sent: number; failed: number }> {
  const { kid, shirtNumber, kind } = opts;
  const sponsors = await db
    .select({
      sponsorEmail: sponsorships.sponsorEmail,
      sponsorName: sponsorships.sponsorName,
    })
    .from(sponsorships)
    .where(
      and(
        eq(sponsorships.status, 'Active'),
        or(
          eq(sponsorships.childId, kid.id),
          eq(sponsorships.childIdLegacy, kid.childId)
        )
      )
    );

  if (sponsors.length === 0) return { sent: 0, failed: 0 };

  const childFirstName =
    kid.firstName ||
    (kid.displayName ? kid.displayName.split(' ')[0] : null) ||
    `kid #${shirtNumber}`;
  const childUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'}/children/${shirtNumber}`;
  const childUrlLabel = `beanumber.org/${shirtNumber}`;

  const subject =
    kind === 'report_card'
      ? `${childFirstName}'s report card is up`
      : `A letter from ${childFirstName}`;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';

  let sent = 0;
  let failed = 0;
  for (const sponsor of sponsors) {
    const email = sponsor.sponsorEmail;
    const name = sponsor.sponsorName || 'Friend';
    if (!email) continue;
    const firstName = name.split(/\s+/)[0] || 'Friend';

    const bodyLine =
      kind === 'report_card'
        ? `${childFirstName}'s year-end report card just came in from the campus. It's on their page now — log in with your usual link or visit <a href="${childUrl}" style="color: #D4A843;">${childUrlLabel}</a> to take a look.`
        : `A handwritten letter from ${childFirstName} just came over from Omoro and is on their page. Visit <a href="${childUrl}" style="color: #D4A843;">${childUrlLabel}</a> to read it.`;

    try {
      const result = await sendEmail({
        to: { email, name },
        from: { email: fromEmail, name: 'Kevin at Be A Number' },
        subject,
        html: `
          <p style="margin-top: 0;">Hey ${firstName},</p>
          <p>${bodyLine}</p>
          <p>Kevin</p>
        `,
      });
      if (result.success) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
