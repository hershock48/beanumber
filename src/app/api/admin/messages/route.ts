/**
 * GET /api/admin/messages
 *
 * Simon's + Kevin's queue of sponsor-written notes. Returns every
 * message row sorted by status (pending first, then translated),
 * then by created_at ascending so the oldest waiting message is at
 * the top.
 *
 * Auth: admin cookie required. Both Simon and Kevin can read.
 *
 * Response shape:
 *   {
 *     messages: [
 *       {
 *         id, sponsorEmail, sponsorName, direction, bodyEn,
 *         bodyTranslated, status, simonNotes, createdAt, translatedAt,
 *         deliveredAt, declinedAt,
 *         kid: { recordId, firstName, displayName, shirtNumber, photoUrl }
 *       },
 *       …
 *     ]
 *   }
 */

import { NextResponse } from 'next/server';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { kidMessages, children } from '@/lib/db/schema';
import { getAdminRole } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const role = await getAdminRole();
  if (!role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({
      id: kidMessages.id,
      sponsorEmail: kidMessages.sponsorEmail,
      sponsorName: kidMessages.sponsorName,
      direction: kidMessages.direction,
      bodyEn: kidMessages.bodyEn,
      bodyTranslated: kidMessages.bodyTranslated,
      status: kidMessages.status,
      simonNotes: kidMessages.simonNotes,
      createdAt: kidMessages.createdAt,
      translatedAt: kidMessages.translatedAt,
      deliveredAt: kidMessages.deliveredAt,
      declinedAt: kidMessages.declinedAt,
      kidRecordId: children.id,
      kidFirstName: children.firstName,
      kidDisplayName: children.displayName,
      kidShirtNumber: children.shirtNumber,
      kidPhotoUrl: children.profilePhotoUrl,
    })
    .from(kidMessages)
    .leftJoin(children, eq(children.id, kidMessages.childId))
    // Two-level ordering: status priority (pending < translated <
    // delivered < declined), then oldest first inside each bucket.
    // Drizzle doesn't have a case-when helper for select ordering,
    // so use raw SQL for the status priority.
    .orderBy(
      sql`
        case ${kidMessages.status}
          when 'pending'    then 0
          when 'translated' then 1
          when 'delivered'  then 2
          when 'declined'   then 3
          else 4
        end
      `,
      asc(kidMessages.createdAt)
    );

  const messages = rows.map(r => ({
    id: r.id,
    sponsorEmail: r.sponsorEmail,
    sponsorName: r.sponsorName,
    direction: r.direction,
    bodyEn: r.bodyEn,
    bodyTranslated: r.bodyTranslated,
    status: r.status,
    simonNotes: r.simonNotes,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    translatedAt: r.translatedAt ? new Date(r.translatedAt).toISOString() : null,
    deliveredAt: r.deliveredAt ? new Date(r.deliveredAt).toISOString() : null,
    declinedAt: r.declinedAt ? new Date(r.declinedAt).toISOString() : null,
    kid: {
      recordId: r.kidRecordId,
      firstName: r.kidFirstName,
      displayName: r.kidDisplayName,
      shirtNumber: r.kidShirtNumber,
      photoUrl: r.kidPhotoUrl,
    },
  }));

  return NextResponse.json({ messages });
}
