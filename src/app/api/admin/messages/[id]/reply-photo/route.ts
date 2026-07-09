/**
 * POST /api/admin/messages/[id]/reply-photo
 *
 * Simon uploads the scanned photograph of a kid's handwritten reply.
 * This endpoint ONLY handles the upload — the actual reply row is
 * created by POST /api/admin/messages/[id]/reply, which takes the
 * publicUrl returned here plus Simon's translation text.
 *
 * Split from the reply POST so:
 *   1. Simon can pick a photo, see it uploaded + preview, and only
 *      then type the translation and hit Send. If we handled the
 *      photo inside the reply POST body, a slow multipart upload
 *      would block the whole submit and the whole reply retries
 *      whenever the network flakes.
 *   2. Kevin can re-attach a photo to an already-recorded reply
 *      later (e.g. if a legacy typed-only reply ever gets a scan
 *      added retroactively) by calling this then PATCH-ing the row.
 *
 * Body: JSON
 *   {
 *     filename: string,       // e.g. "reply-naume.jpg" or "reply-naume.pdf"
 *     contentType: string,    // image/jpeg | image/png | image/heic | image/webp |
 *                             //   application/pdf | application/msword |
 *                             //   application/vnd.openxmlformats-officedocument.wordprocessingml.document
 *     dataBase64: string,     // raw base64, no "data:" prefix
 *   }
 *
 * Auth: admin cookie required (Simon or Kevin).
 *
 * Size cap: ~20 MB base64 (~15 MB raw). A single phone photo of an A4
 * sheet is well under 10; a multi-page PDF scan of a longer letter
 * comfortably fits under 20. Larger and we reject to protect the
 * function's memory + the Supabase quota.
 *
 * 2026-07-09 update: name kept as reply-photo for URL stability, but
 * the endpoint now accepts PDF and Word docs in addition to images.
 * Simon requested this so multi-page scans (his scanner outputs PDF)
 * and typed letters (rare, but happens when a kid dictates to a
 * teacher) can also come through the same pipeline.
 *
 * Response:
 *   200 { ok: true, publicUrl, path }
 *   400 { error }
 *   401 { error }
 *   404 { error: 'Message not found.' }
 *   413 { error: 'Photo is too large.' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { kidMessages } from '@/lib/db/schema';
import { getAdminRole } from '@/lib/admin-session';
import { uploadAttachment } from '@/lib/storage';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_TYPES = new Set([
  // Images (phone photo of the letter).
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  // PDF (scanner output, multi-page scans).
  'application/pdf',
  // Word docs (legacy .doc + modern .docx). Rare but Simon asked
  // for it 2026-07-09 — occasional typed letter needs a home.
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// ~20 MB base64 → ~15 MB decoded. A single phone photo is well under
// 10 MB; a multi-page PDF scan of a longer letter fits comfortably
// under 20. Larger and we reject rather than eat the function memory.
const MAX_BASE64_BYTES = 20 * 1024 * 1024;

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
      { error: 'Message not found.' },
      { status: 404 }
    );
  }

  // Confirm the parent message exists — pointless to accept a photo
  // for a nonexistent message, and the storage key is scoped under
  // the message id so we should validate it.
  const parentRows = await db
    .select({ id: kidMessages.id })
    .from(kidMessages)
    .where(eq(kidMessages.id, id))
    .limit(1);
  if (parentRows.length === 0) {
    return NextResponse.json(
      { error: 'Message not found.' },
      { status: 404 }
    );
  }

  let body: {
    filename?: string;
    contentType?: string;
    dataBase64?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const filename = (body.filename ?? '').trim();
  const contentType = (body.contentType ?? '').trim().toLowerCase();
  const dataBase64 = (body.dataBase64 ?? '').trim();

  if (!filename) {
    return NextResponse.json(
      { error: 'Missing filename.' },
      { status: 400 }
    );
  }
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      {
        error:
          'Supported: JPEG / PNG / WEBP / HEIC photos, PDF, or Word (.doc / .docx). Convert and try again.',
      },
      { status: 400 }
    );
  }
  if (!dataBase64) {
    return NextResponse.json(
      { error: 'Missing photo data.' },
      { status: 400 }
    );
  }
  if (dataBase64.length > MAX_BASE64_BYTES) {
    return NextResponse.json(
      {
        error:
          'File is too large. Under ~15 MB after decoding, please — shrink or split it and re-upload.',
      },
      { status: 413 }
    );
  }

  try {
    const result = await uploadAttachment({
      kind: 'penpal-replies',
      scope: id,
      filename,
      contentType,
      data: dataBase64,
    });
    return NextResponse.json({
      ok: true,
      publicUrl: result.publicUrl,
      path: result.path,
    });
  } catch (err) {
    console.error(
      '[reply-photo] upload failed:',
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      { error: 'Upload failed. Try again in a moment.' },
      { status: 500 }
    );
  }
}
