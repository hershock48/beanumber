/**
 * POST /api/admin/donor/<id>/send-email
 *   Body: { subject: string, body: string, appendSignature?: boolean }
 *
 * Sends a real email via the Gmail API using the stored refresh token,
 * from Kevin's authorized Gmail account, to the donor's email. Logs
 * the send as a communications row (EmailType="Interaction · email"
 * outbound) so the donor profile timeline stays in sync.
 *
 * Errors:
 *   401  not signed into the admin
 *   400  bad request (no donor email, blank subject/body)
 *   404  donor not found
 *   502  Gmail send failed
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { sendEmailViaGmail } from '@/lib/gmail/send';
import { db } from '@/lib/db/client';
import { donors, communications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Invalid donor id' }, { status: 400 });
  }

  let body: {
    subject?: string;
    body?: string;
    appendSignature?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const subject = (body.subject || '').trim();
  const text = (body.body || '').trim();
  const appendSignature = body.appendSignature !== false;

  if (!subject) {
    return NextResponse.json({ error: 'Subject is required.' }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: 'Email body is required.' }, { status: 400 });
  }

  const donor = (
    await db
      .select({ id: donors.id, email: donors.email })
      .from(donors)
      .where(eq(donors.id, id))
      .limit(1)
  )[0];
  if (!donor) {
    return NextResponse.json({ error: 'Donor not found.' }, { status: 404 });
  }
  const toEmail = donor.email?.trim();
  if (!toEmail) {
    return NextResponse.json(
      { error: 'This donor has no email on file.' },
      { status: 400 }
    );
  }

  try {
    const result = await sendEmailViaGmail({
      to: toEmail,
      subject,
      body: text,
      appendSignature,
    });
    // Best-effort interaction log. Doesn't unwind on failure.
    try {
      const preview = text.length > 240 ? text.slice(0, 240) + '...' : text;
      await db.insert(communications).values({
        subject: `[outbound] ${subject} — ${preview}`,
        emailType: 'Interaction · email',
        status: 'Sent',
        sendDate: new Date().toISOString().slice(0, 10),
        recipientEmail: toEmail,
        relatedDonorId: donor.id,
      });
    } catch (err) {
      console.warn('[donor/send-email] interaction log failed (non-fatal):', err);
    }

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      fromEmail: result.fromEmail,
      toEmail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
