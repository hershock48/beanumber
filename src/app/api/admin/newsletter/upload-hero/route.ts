/**
 * Admin · Newsletter hero photo upload.
 *
 * POST /api/admin/newsletter/upload-hero
 * Body: {
 *   newsletterId: string,
 *   filename: string,
 *   contentType: string,    // e.g. "image/jpeg"
 *   data: string,           // base64-encoded file (no data: prefix)
 * }
 *
 * Posts the image to Airtable's HeroPhoto field on the given newsletter
 * record via the content upload endpoint. Replaces any existing hero
 * (Newsletters.HeroPhoto is multipleAttachments but we treat it as
 * single — the editor only shows the first one).
 *
 * Auth: admin session cookie or X-Admin-Token header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';

const FIELD_ID_HERO_PHOTO = 'fld3pQyWeRgfCOoaJ';

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
    newsletterId?: string;
    filename?: string;
    contentType?: string;
    data?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { newsletterId, filename, contentType, data } = body;
  if (!newsletterId || !filename || !contentType || !data) {
    return NextResponse.json(
      { error: 'newsletterId, filename, contentType, and data are required' },
      { status: 400 }
    );
  }
  if (data.length > MAX_BASE64_BYTES) {
    return NextResponse.json(
      { error: 'Image too large (max ~3.7 MB). Compress and try again.' },
      { status: 413 }
    );
  }

  try {
    const uploadUrl = `https://content.airtable.com/v0/${AIRTABLE_BASE_ID}/${newsletterId}/${FIELD_ID_HERO_PHOTO}/uploadAttachment`;
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
    const result = await uploadRes.json();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
