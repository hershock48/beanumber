/**
 * Admin · Newsletter hero photo upload.
 *
 * POST /api/admin/newsletter/upload-hero
 * Body: {
 *   newsletterId: string,
 *   filename: string,
 *   contentType: string,
 *   data: string (base64, no data: prefix)
 * }
 *
 * Uploads the image to Supabase Storage and writes the permanent
 * public URL to newsletters.heroPhotoUrl.
 *
 * Auth: cookie or X-Admin-Token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { newsletters } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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
      kind: 'newsletter-hero',
      scope: newsletterId,
      filename,
      contentType,
      data,
    });

    await db
      .update(newsletters)
      .set({ heroPhotoUrl: result.publicUrl, updatedAt: new Date() })
      .where(eq(newsletters.id, newsletterId));

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
