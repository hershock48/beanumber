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
 *     filename: string,       // e.g. "reply-naume.jpg"
 *     contentType: string,    // "image/jpeg" | "image/png" | "image/heic" | "image/webp"
 *     dataBase64: string,     // raw base64, no "data:" prefix
 *   }
 *
 * Auth: admin cookie required (Simon or Kevin).
 *
 * Size cap: ~10 MB base64 (~7.5 MB raw). A phone photo of an A4 sheet
 * is comfortably under this. Larger and we reject to protect the
 * function's memory + the Supabase quota.
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
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

// ~10 MB base64 → ~7.5 MB decoded. Enough for a phone photo of the
// template at typical mid-range camera resolution; enough headroom
// for a decently-lit scan without letting a stray 20 MB DSLR shot
// slip through.
const MAX_BASE64_BYTES = 10 * 1024 * 1024;

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
          'Only JPEG, PNG, WEBP, or HEIC images are supported. Convert and try again.',
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
          'Photo is too large. Under ~7 MB after decoding, please — shrink it and re-upload.',
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
