/**
 * POST /api/admin/donor/<id>/send-email
 *   Body: { subject: string, body: string, appendSignature?: boolean }
 *
 * Sends a real email via the Gmail API using the stored refresh
 * token, from Kevin's authorized Gmail account, to the donor's
 * Email Address. The signature stored in AppSettings is appended
 * by default.
 *
 * Also logs an outbound interaction in the same call so the donor
 * profile timeline stays in sync.
 *
 * Errors fall into a few buckets:
 *   401  not signed into the admin
 *   400  bad request (missing donor email, blank subject/body)
 *   502  Gmail send failed (token revoked, rate limit, etc.) —
 *         Kevin sees the message and can reconnect via
 *         /admin/connect-gmail
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { sendEmailViaGmail } from '@/lib/gmail/send';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';
const INTERACTIONS_TABLE =
  process.env.AIRTABLE_INTERACTIONS_TABLE || 'Interactions';

const I_F = {
  subject: 'fldlqqv1NK1oTU6FV',
  donor: 'fldnII8EQzgZBUksB',
  direction: 'fldp59ikGDl16VtRN',
  channel: 'fldskE86vHE2dKPSL',
  notes: 'fldao80pSvvtzS5MF',
  at: 'fldN6i1VRSq1e9rRS',
  loggedBy: 'fldvuxp4H8PgnHY1Q',
};

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function getDonorEmail(donorId: string): Promise<string | null> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    DONORS_TABLE
  )}/${donorId}`;
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  const email = data.fields?.['Email Address'];
  return typeof email === 'string' && email.trim() ? email.trim() : null;
}

async function logInteraction(opts: {
  donorId: string;
  subject: string;
  bodyPreview: string;
}): Promise<void> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    INTERACTIONS_TABLE
  )}`;
  const fields: Record<string, unknown> = {
    [I_F.subject]: opts.subject,
    [I_F.donor]: [opts.donorId],
    [I_F.direction]: 'outbound',
    [I_F.channel]: 'email',
    [I_F.at]: new Date().toISOString(),
    [I_F.loggedBy]: 'Kevin',
    [I_F.notes]: opts.bodyPreview,
  };
  await fetch(url, {
    method: 'POST',
    headers: atHeaders(),
    body: JSON.stringify({ fields, typecast: true }),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id || !id.startsWith('rec')) {
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
    return NextResponse.json(
      { error: 'Subject is required.' },
      { status: 400 }
    );
  }
  if (!text) {
    return NextResponse.json(
      { error: 'Email body is required.' },
      { status: 400 }
    );
  }

  const toEmail = await getDonorEmail(id);
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
    // Best-effort: log the interaction. If this fails we don't
    // unwind the send — the email already went out.
    try {
      const preview = text.length > 300 ? text.slice(0, 300) + '…' : text;
      await logInteraction({ donorId: id, subject, bodyPreview: preview });
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
