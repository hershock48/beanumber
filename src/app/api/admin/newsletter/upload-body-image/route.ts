/**
 * Admin · Newsletter inline body image upload.
 *
 * POST /api/admin/newsletter/upload-body-image
 * Body: {
 *   newsletterId: string,   // scope key so images cluster in Storage
 *   filename: string,
 *   contentType: string,
 *   data: string (base64, no data: prefix)
 * }
 *
 * Uploads to Supabase Storage under kind='newsletter-body' and returns
 * the permanent public URL. Unlike upload-hero, this does NOT touch the
 * newsletters row — inline body images are referenced inside BodyHTML
 * via <img src="..."> and there's no dedicated column for them. The
 * caller (admin editor) copies the returned URL into the clipboard so
 * Kevin can paste it into an <img> tag.
 *
 * Auth: cookie or X-Admin-Token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { uploadAttachment } from '@/lib/storage';

const MAX_BASE64_BYTES = 5 * 1024 * 1024;

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
    const result = await uploadAttachment({
      kind: 'newsletter-body',
      scope: newsletterId,
      filename,
      contentType,
      data,
    });

    return NextResponse.json({
      ok: true,
      result: { url: result.publicUrl, path: result.path },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
