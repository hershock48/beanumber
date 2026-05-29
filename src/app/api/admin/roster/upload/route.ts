/**
 * Admin · Roster file upload — attach a report card or letter to a kid.
 *
 * POST /api/admin/roster/upload
 * Body: {
 *   shirtNumber: number,
 *   kind: 'report_card' | 'letter',
 *   filename: string,
 *   contentType: string,   // e.g. "image/jpeg" | "application/pdf"
 *   data: string,          // base64-encoded file (raw, no data: prefix)
 *   skipNotify?: boolean,  // optional; defaults to false (notify on upload)
 * }
 *
 * Posts the file to Airtable via their Upload Attachment endpoint
 * (no separate file host required). On success, fires a sponsor
 * notification email to every active sponsor of this child (unless
 * skipNotify is true).
 *
 * Auth: admin session cookie or X-Admin-Token header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const SPONSORSHIPS_TABLE =
  process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';

const FIELD_ID_REPORT_CARDS = 'fldY4lyVVdeSmtjaY';
const FIELD_ID_LETTERS = 'fldJxNQd498dqknDj';

// Airtable's upload endpoint accepts up to 5MB per request when using
// the base64 inline upload. Anything bigger needs to be hosted
// externally first; we keep it simple and error early.
const MAX_BASE64_BYTES = 5 * 1024 * 1024;

function airtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    shirtNumber?: number;
    kind?: 'report_card' | 'letter';
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
  if (kind !== 'report_card' && kind !== 'letter') {
    return NextResponse.json({ error: 'kind must be report_card or letter' }, { status: 400 });
  }
  if (!filename || !contentType || !data) {
    return NextResponse.json({ error: 'filename, contentType, and data are required' }, { status: 400 });
  }
  if (data.length > MAX_BASE64_BYTES) {
    return NextResponse.json(
      { error: 'File too large (max ~3.7 MB). Compress and try again, or upload directly in Airtable.' },
      { status: 413 }
    );
  }

  const fieldId = kind === 'report_card' ? FIELD_ID_REPORT_CARDS : FIELD_ID_LETTERS;

  try {
    // 1. Look up the kid's Airtable record.
    const lookupUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      CHILDREN_TABLE
    )}?filterByFormula=${encodeURIComponent(`{ShirtNumber}=${shirtNumber}`)}&maxRecords=1`;
    const lookupRes = await fetch(lookupUrl, { headers: airtableHeaders(), cache: 'no-store' });
    if (!lookupRes.ok) {
      const t = await lookupRes.text();
      return NextResponse.json(
        { error: `Child lookup failed: ${lookupRes.status} ${t}` },
        { status: 502 }
      );
    }
    const lookupData = await lookupRes.json();
    const record = lookupData.records?.[0];
    if (!record) {
      return NextResponse.json({ error: `No kid found for shirt #${shirtNumber}` }, { status: 404 });
    }
    const recordId = record.id as string;
    const childDisplayName = (record.fields?.DisplayName as string)
      || (record.fields?.FirstName as string)
      || `kid #${shirtNumber}`;
    const childFirstName = (record.fields?.FirstName as string) || childDisplayName;

    // 2. POST the file to Airtable's content upload endpoint.
    const uploadUrl = `https://content.airtable.com/v0/${AIRTABLE_BASE_ID}/${recordId}/${fieldId}/uploadAttachment`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({
        contentType,
        filename,
        file: data,
      }),
    });
    if (!uploadRes.ok) {
      const t = await uploadRes.text();
      return NextResponse.json(
        { error: `Upload to Airtable failed: ${uploadRes.status} ${t}` },
        { status: 502 }
      );
    }

    // 3. Fire sponsor notification email(s). Best-effort: any failure
    //    here doesn't block the upload from succeeding.
    let notifyResult: { sent: number; failed: number; skipped?: boolean } = {
      sent: 0,
      failed: 0,
    };
    if (body.skipNotify) {
      notifyResult = { sent: 0, failed: 0, skipped: true };
    } else {
      try {
        notifyResult = await notifySponsorsOfDocument({
          childRecordId: recordId,
          childFirstName,
          childDisplayName,
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
      notify: notifyResult,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}

// ───────────────────────────────────────────────────────────────────────
// Sponsor notification

async function notifySponsorsOfDocument(opts: {
  childRecordId: string;
  childFirstName: string;
  childDisplayName: string;
  shirtNumber: number;
  kind: 'report_card' | 'letter';
}): Promise<{ sent: number; failed: number }> {
  // Find all active sponsorships linked to this child record.
  const formula = encodeURIComponent(
    `AND({Status}="Active", FIND("${opts.childRecordId}", ARRAYJOIN({Children})) > 0)`
  );
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    SPONSORSHIPS_TABLE
  )}?filterByFormula=${formula}&pageSize=100&fields%5B%5D=SponsorEmail&fields%5B%5D=SponsorName`;
  const res = await fetch(url, { headers: airtableHeaders(), cache: 'no-store' });
  if (!res.ok) {
    console.warn('[roster/upload] sponsorship lookup failed:', res.status);
    return { sent: 0, failed: 0 };
  }
  const data = await res.json();
  const sponsors = (data.records || []) as Array<{
    fields: { SponsorEmail?: string; SponsorName?: string };
  }>;

  if (sponsors.length === 0) return { sent: 0, failed: 0 };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
  const childUrl = `${siteUrl}/children/${opts.shirtNumber}`;
  const childUrlLabel = `beanumber.org/${opts.shirtNumber}`;

  const subject =
    opts.kind === 'report_card'
      ? `${opts.childFirstName}'s report card is up`
      : `A letter from ${opts.childFirstName}`;

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';

  let sent = 0;
  let failed = 0;

  for (const sponsor of sponsors) {
    const email = sponsor.fields.SponsorEmail;
    const name = sponsor.fields.SponsorName || 'Friend';
    if (!email) continue;
    const firstName = name.split(/\s+/)[0] || 'Friend';

    const bodyLine =
      opts.kind === 'report_card'
        ? `${opts.childFirstName}'s year-end report card just came in from the campus. It's on their page now — log in with your usual link or visit <a href="${childUrl}" style="color: #D4A843;">${childUrlLabel}</a> to take a look.`
        : `A handwritten letter from ${opts.childFirstName} just came over from Omoro and is on their page. Visit <a href="${childUrl}" style="color: #D4A843;">${childUrlLabel}</a> to read it.`;

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
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}
