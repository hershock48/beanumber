/**
 * POST /api/sponsor/notes/photo
 *
 * Sponsor uploads a photo to attach to a penpal note they're about
 * to send. This endpoint ONLY handles the upload — the note itself
 * is created by POST /api/sponsor/notes with an attachments array
 * of publicUrls returned from calls to this endpoint.
 *
 * Same split as the admin reply-photo endpoint: the sponsor picks
 * one photo, sees it uploaded + previewed, picks a second if they
 * want, and only THEN types their note and hits Send. Bundling
 * uploads into the note POST would block Send on a flaky camera
 * upload and cost the whole submit on retry.
 *
 * Body: JSON
 *   {
 *     filename: string,       // e.g. "IMG_1234.jpg"
 *     contentType: string,    // "image/jpeg" | "image/png" | "image/heic" | "image/webp"
 *     dataBase64: string,     // raw base64, no "data:" prefix
 *   }
 *
 * Auth: sponsor session cookie required. Same signal used by the
 * note POST — writers must be signed-in monthly sponsors of the
 * target kid, but that check happens at note-write time. Here we
 * just verify the caller has ANY sponsor session so an anon can't
 * flood our Supabase bucket with junk uploads.
 *
 * Size cap: ~10 MB base64 (~7.5 MB decoded). Modern phone photos
 * come in around 3-5 MB; this leaves headroom without letting a
 * stray full-res DSLR through.
 *
 * Response:
 *   200 { ok: true, publicUrl, path }
 *   400 { error }
 *   401 { error }
 *   413 { error: 'Photo is too large.' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { uploadAttachment } from '@/lib/storage';
import { SESSION } from '@/lib/constants';

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const MAX_BASE64_BYTES = 10 * 1024 * 1024;

async function getViewerEmail(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION.COOKIE_NAME);
    if (!raw) return null;
    const session = JSON.parse(raw.value);
    if (new Date(session.expires) < new Date()) return null;
    const email = (session.email as string | undefined)?.trim().toLowerCase();
    return email && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const email = await getViewerEmail();
  if (!email) {
    return NextResponse.json(
      { error: 'Sign in to attach a photo.' },
      { status: 401 }
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
          'Only JPEG, PNG, WEBP, or HEIC images work. Convert and try again.',
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

  // Scope by lower-cased email so a sponsor's uploads sit together
  // and can be cleaned up in bulk later if needed. Filenames get
  // sanitized inside uploadAttachment.
  try {
    const result = await uploadAttachment({
      kind: 'penpal-outbound',
      scope: email,
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
      '[sponsor/notes/photo] upload failed:',
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      { error: 'Upload failed. Try again in a moment.' },
      { status: 500 }
    );
  }
}
