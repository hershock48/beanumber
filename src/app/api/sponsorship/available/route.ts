/**
 * Available Children API
 * Lists children awaiting sponsors (PUBLIC - no auth required)
 *
 * Sources from Postgres: `sponsorships` rows with status='Awaiting
 * Sponsor', joined with their linked `children` row for profile
 * fields (Loves, ChildQuote, FamilyContext, ShirtNumber, photo).
 */

import { NextRequest, NextResponse } from 'next/server';
import { asc, eq, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
} from '@/lib/errors';
import { db } from '@/lib/db/client';
import {
  children as childrenTable,
  sponsorships as sponsorshipsTable,
} from '@/lib/db/schema';

interface AvailableChildOut {
  id: string;            // legacy ChildID (HSP/BAN-...) for back-compat
  recordId: string;      // Postgres UUID
  displayName: string;
  age?: string;
  location?: string;
  photo?: { url: string; filename: string };
  sponsorshipStartDate?: string;
  loves?: string;
  childQuote?: string;
  familyContext?: string;
  shirtNumber?: number;
}

function computeAge(dateOfBirth?: string | null): string | undefined {
  if (!dateOfBirth) return undefined;
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    years -= 1;
  }
  return years >= 0 ? String(years) : undefined;
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'GET';
  const path = '/api/sponsorship/available';

  logger.apiRequest(method, path);

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  // Pull every "Awaiting Sponsor" sponsorship in one shot, joined with
  // its linked child. LEFT JOIN on both new UUID FK and legacy ChildID
  // text so transition-state rows still resolve.
  const rows = await db
    .select({
      sponsorshipId: sponsorshipsTable.id,
      childDisplayName: sponsorshipsTable.childDisplayName,
      childAge: sponsorshipsTable.childAge,
      childLocation: sponsorshipsTable.childLocation,
      sponsorshipStartDate: sponsorshipsTable.sponsorshipStartDate,
      childIdLegacy: sponsorshipsTable.childIdLegacy,
      // Coalesced over both join variants.
      childRecordId: sql<string | null>`coalesce(${childrenTable.id}, child_legacy.id)`,
      childIdRow: sql<string | null>`coalesce(${childrenTable.childId}, child_legacy.child_id)`,
      displayNameRow: sql<string | null>`coalesce(${childrenTable.displayName}, child_legacy.display_name)`,
      firstNameRow: sql<string | null>`coalesce(${childrenTable.firstName}, child_legacy.first_name)`,
      lastInitialRow: sql<string | null>`coalesce(${childrenTable.lastInitial}, child_legacy.last_initial)`,
      photoUrlRow: sql<string | null>`coalesce(${childrenTable.profilePhotoUrl}, child_legacy.profile_photo_url)`,
      lovesRow: sql<string | null>`coalesce(${childrenTable.loves}, child_legacy.loves)`,
      childQuoteRow: sql<string | null>`coalesce(${childrenTable.childQuote}, child_legacy.child_quote)`,
      familyContextRow: sql<string | null>`coalesce(${childrenTable.familyContext}, child_legacy.family_context)`,
      shirtNumberRow: sql<number | null>`coalesce(${childrenTable.shirtNumber}, child_legacy.shirt_number)`,
      dateOfBirthRow: sql<string | null>`coalesce(${childrenTable.dateOfBirth}, child_legacy.date_of_birth)`,
    })
    .from(sponsorshipsTable)
    .leftJoin(childrenTable, eq(childrenTable.id, sponsorshipsTable.childId))
    .leftJoin(
      sql`children as child_legacy`,
      sql`child_legacy.child_id = ${sponsorshipsTable.childIdLegacy}`
    )
    .where(eq(sponsorshipsTable.status, 'Awaiting Sponsor'))
    .orderBy(asc(sponsorshipsTable.childDisplayName));

  let children: AvailableChildOut[] = rows.map(r => {
    const displayName =
      r.displayNameRow ||
      r.childDisplayName ||
      `${r.firstNameRow || 'Child'}${r.lastInitialRow ? ' ' + r.lastInitialRow : ''}`.trim();
    return {
      id: r.childIdRow || r.childIdLegacy || r.childRecordId || r.sponsorshipId,
      recordId: r.childRecordId || r.sponsorshipId,
      displayName,
      age: r.childAge || computeAge(r.dateOfBirthRow),
      location: r.childLocation || 'Gulu, Northern Uganda',
      photo: r.photoUrlRow
        ? { url: r.photoUrlRow, filename: '' }
        : undefined,
      sponsorshipStartDate: r.sponsorshipStartDate ?? undefined,
      loves: r.lovesRow ?? undefined,
      childQuote: r.childQuoteRow ?? undefined,
      familyContext: r.familyContextRow ?? undefined,
      shirtNumber: r.shirtNumberRow ?? undefined,
    };
  });

  const total = children.length;
  if (limit && limit < children.length) {
    children = children.slice(0, limit);
  }

  logger.info('Listed available children', {
    total,
    returned: children.length,
  });

  logger.apiResponse(method, path, 200);

  return createSuccessResponse({
    children,
    total,
  });
}

export const GET = withErrorHandling(handler, 'GET', '/api/sponsorship/available');
