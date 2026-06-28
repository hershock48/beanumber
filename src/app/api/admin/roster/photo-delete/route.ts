/**
 * POST /api/admin/roster/photo-delete
 *   Body: { shirtNumber: number, photoUrl: string }
 *
 * Removes one photo from a kid. The URL is matched against
 * profilePhotoUrl + every entry in photoUrls. If it's the primary
 * profile photo and there are extras, the next one in photoUrls is
 * promoted. If photos remain in the array, the primary stays as-is.
 *
 * Body still accepts `attachmentId` for client compat — it's treated
 * as a URL substring match against the stored URLs.
 *
 * Auth: cookie or X-Admin-Token. Both Kevin and Simon can delete a
 * single photo (low-risk relative to deleting a kid).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { getAdminRole } from '@/lib/admin-session';
import { db } from '@/lib/db/client';
import { children } from '@/lib/db/schema';
import { audit } from '@/lib/db/mutations';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Admin only — Simon should not be able to delete a public photo.
  // If he wants a swap, he uploads (which goes through pending) and
  // Kevin approves the replacement.
  const role = await getAdminRole();
  if (role !== 'admin') {
    return NextResponse.json(
      { error: 'Admin role required' },
      { status: 403 }
    );
  }

  let body: { shirtNumber?: number; photoUrl?: string; attachmentId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const shirtNumber = body.shirtNumber;
  // Accept either photoUrl (new) or attachmentId (old caller). Both
  // are matched as substrings against the stored URLs since the
  // editor's `id` is now derived from the URL.
  const target = (body.photoUrl || body.attachmentId || '').trim();
  if (typeof shirtNumber !== 'number' || !Number.isInteger(shirtNumber)) {
    return NextResponse.json({ error: 'shirtNumber required' }, { status: 400 });
  }
  if (!target) {
    return NextResponse.json({ error: 'photoUrl or attachmentId required' }, { status: 400 });
  }

  try {
    const kid = (
      await db
        .select()
        .from(children)
        .where(eq(children.shirtNumber, shirtNumber))
        .limit(1)
    )[0];
    if (!kid) {
      return NextResponse.json(
        { error: `No kid for shirt #${shirtNumber}` },
        { status: 404 }
      );
    }

    const photos = (kid.photoUrls || []) as string[];
    const primary = kid.profilePhotoUrl || null;

    const matchesPrimary = primary && (primary === target || primary.includes(target));
    const photosFiltered = photos.filter(u => !(u === target || u.includes(target)));
    const removedFromArray = photosFiltered.length !== photos.length;

    if (!matchesPrimary && !removedFromArray) {
      return NextResponse.json(
        { error: "That photo isn't on this kid (already deleted?)." },
        { status: 404 }
      );
    }

    const patch: Record<string, unknown> = {
      photoUrls: photosFiltered,
      updatedAt: new Date(),
    };
    if (matchesPrimary) {
      // Promote the next available photo to primary, or null out if
      // none remain.
      patch.profilePhotoUrl = photosFiltered[0] ?? null;
    }

    await db.update(children).set(patch).where(eq(children.id, kid.id));

    const role = await getAdminRole();
    await audit({
      table: 'children',
      recordId: kid.id,
      action: 'UPDATE',
      actorType: 'admin',
      actorId: role || 'admin',
      before: kid as unknown as Record<string, unknown>,
      after: { ...(kid as unknown as Record<string, unknown>), ...patch },
    });

    return NextResponse.json({
      ok: true,
      remaining: photosFiltered.length + (matchesPrimary ? 0 : primary ? 1 : 0),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
