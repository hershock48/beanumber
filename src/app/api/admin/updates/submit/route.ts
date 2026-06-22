/**
 * Admin · Submit a child update (Simon's intake form).
 *
 * POST /api/admin/updates/submit (multipart/form-data)
 *   Fields:
 *     - sponsorCode: string
 *     - updateType: string
 *     - title: string
 *     - content: string
 *     - submittedBy: string
 *     - photos[]: File (any number, optional)
 *     - adminPassword: string (alternative auth path)
 *
 * Writes a child_updates row with status='Pending Review'. Photos
 * are uploaded to Supabase Storage; their URLs are persisted in the
 * `photo_urls` jsonb column.
 *
 * The Airtable era stored photos on the record as attachments; under
 * Postgres they live in Supabase Storage and the row carries a URL
 * array. That's a behavior change worth noting: the old route
 * silently dropped photos (TODO comment in the code); the new one
 * actually persists them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { childUpdates, sponsorships, children } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { uploadAttachment } from '@/lib/storage';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// FormData typing collision between @types/node (undici) and lib.dom.
// At runtime everything's fine — at type-check the .get/.getAll shape
// vanishes. Coerce to `any` once at parse time and we're done.
type FormDataLike = {
  get(name: string): string | File | null;
  getAll(name: string): Array<string | File>;
};

export async function POST(request: NextRequest) {
  try {
    const formData = (await request.formData()) as unknown as FormDataLike;

    // Auth — accepts admin password in either header or form body.
    const adminPassword = formData.get('adminPassword') as string | null;
    const adminToken =
      request.headers.get('Authorization')?.replace('Bearer ', '') ||
      request.headers.get('X-Admin-Token') ||
      adminPassword ||
      null;
    const expectedToken = process.env.ADMIN_API_TOKEN;
    const expectedPassword = process.env.ADMIN_PASSWORD;

    if (!expectedToken && !expectedPassword) {
      console.error('[Admin Submit] ADMIN_API_TOKEN and ADMIN_PASSWORD not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    if (!adminToken || (adminToken !== expectedToken && adminToken !== expectedPassword)) {
      console.warn('[Admin Submit] Unauthorized access attempt');
      return NextResponse.json(
        { error: 'Unauthorized - Invalid admin password' },
        { status: 401 }
      );
    }

    const sponsorCode = String(formData.get('sponsorCode') || '');
    const updateType = String(formData.get('updateType') || '');
    const title = String(formData.get('title') || '');
    const content = String(formData.get('content') || '');
    const submittedBy = String(formData.get('submittedBy') || '');
    const photos = formData.getAll('photos').filter(
      (v): v is File => typeof v !== 'string'
    );

    if (!sponsorCode || !title || !content || !submittedBy) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Resolve the kid for this sponsor (UUID + legacy ChildID) so the
    // child_updates row carries the dual-key kid match.
    const sponsorship = (
      await db
        .select({
          childRecordId: sql<string | null>`coalesce(${children.id}, child_legacy.id)`,
          childIdLegacy: sql<string | null>`coalesce(${children.childId}, child_legacy.child_id)`,
        })
        .from(sponsorships)
        .leftJoin(children, eq(children.id, sponsorships.childId))
        .leftJoin(
          sql`children as child_legacy`,
          sql`child_legacy.child_id = ${sponsorships.childIdLegacy}`
        )
        .where(eq(sponsorships.sponsorCode, sponsorCode))
        .limit(1)
    )[0];

    if (!sponsorship?.childRecordId && !sponsorship?.childIdLegacy) {
      return NextResponse.json(
        { error: 'Child not found for this sponsor code' },
        { status: 404 }
      );
    }

    // Insert the row first so we have a stable id for photo storage scope.
    const now = new Date();
    const inserted = await db
      .insert(childUpdates)
      .values({
        sponsorCode,
        childId: sponsorship.childRecordId,
        childIdLegacy: sponsorship.childIdLegacy,
        updateType,
        title,
        content,
        status: 'Pending Review',
        visibleToSponsor: false,
        requestedBySponsor: false,
        requestedAt: now,
        submittedBy,
        submittedAt: now,
      })
      .returning({ id: childUpdates.id });
    const updateId = inserted[0].id;

    // Upload photos (best-effort). Any failure is logged but doesn't
    // unwind the row — Kevin can re-upload manually from /admin.
    const photoUrls: string[] = [];
    for (const file of photos) {
      if (!file || typeof file === 'string') continue;
      if (file.size === 0) continue;
      if (file.size > MAX_PHOTO_BYTES) {
        console.warn('[Admin Submit] photo too large, skipped:', file.name);
        continue;
      }
      try {
        const buf = Buffer.from(await file.arrayBuffer()).toString('base64');
        const result = await uploadAttachment({
          kind: 'child-updates',
          scope: updateId,
          filename: file.name || 'photo.jpg',
          contentType: file.type || 'image/jpeg',
          data: buf,
        });
        photoUrls.push(result.publicUrl);
      } catch (err) {
        console.warn('[Admin Submit] photo upload failed:', err);
      }
    }
    if (photoUrls.length > 0) {
      await db
        .update(childUpdates)
        .set({ photoUrls, updatedAt: new Date() })
        .where(eq(childUpdates.id, updateId));
    }

    return NextResponse.json({
      success: true,
      updateId,
      photosUploaded: photoUrls.length,
      message: 'Update submitted successfully.',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Submit Update] Error:', error);
    return NextResponse.json(
      { error: msg || 'Failed to submit update' },
      { status: 500 }
    );
  }
}
