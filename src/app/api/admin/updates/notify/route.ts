/**
 * Admin Send Update Notification API
 * Sends a notification email to the sponsor about a published update.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
  ValidationError,
} from '@/lib/errors';
import { requireAdminAuth } from '@/lib/auth';
import { parseRequestBody } from '@/lib/validation';
import { sendUpdateNotificationEmail } from '@/lib/email';
import { db } from '@/lib/db/client';
import { childUpdates, sponsorships, children } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'POST';
  const path = '/api/admin/updates/notify';
  logger.apiRequest(method, path);

  requireAdminAuth(request);

  const bodyResult = await parseRequestBody(request);
  if (!bodyResult.success) {
    throw new ValidationError(bodyResult.error!);
  }
  const { updateId } = bodyResult.data as { updateId: string };
  if (!updateId) throw new ValidationError('updateId is required');

  // Load the update row.
  const update = (
    await db.select().from(childUpdates).where(eq(childUpdates.id, updateId)).limit(1)
  )[0];
  if (!update) throw new ValidationError(`Update not found: ${updateId}`);

  if (update.status !== 'Published') {
    throw new ValidationError(`Update is not published (status: ${update.status})`);
  }
  if (!update.sponsorCode) {
    throw new ValidationError('Update has no sponsor code - cannot send notification');
  }

  // Load the sponsorship + kid for the notification.
  const sponsorship = (
    await db
      .select({
        sponsorEmail: sponsorships.sponsorEmail,
        sponsorName: sponsorships.sponsorName,
        childDisplayName: sponsorships.childDisplayName,
        shirtNumber: sql<number | null>`coalesce(${children.shirtNumber}, child_legacy.shirt_number)`,
        kidDisplayName: sql<string | null>`coalesce(${children.displayName}, child_legacy.display_name)`,
      })
      .from(sponsorships)
      .leftJoin(children, eq(children.id, sponsorships.childId))
      .leftJoin(
        sql`children as child_legacy`,
        sql`child_legacy.child_id = ${sponsorships.childIdLegacy}`
      )
      .where(eq(sponsorships.sponsorCode, update.sponsorCode))
      .limit(1)
  )[0];
  if (!sponsorship) {
    throw new ValidationError(`Sponsorship not found for code: ${update.sponsorCode}`);
  }
  if (!sponsorship.sponsorEmail) {
    throw new ValidationError('Sponsor has no email address');
  }

  const childName =
    sponsorship.kidDisplayName ||
    sponsorship.childDisplayName ||
    'your kid';
  const shirtNumber = sponsorship.shirtNumber ?? undefined;

  const result = await sendUpdateNotificationEmail(
    sponsorship.sponsorEmail,
    sponsorship.sponsorName || 'Valued Sponsor',
    childName,
    update.title || 'A new update',
    update.content || '',
    shirtNumber
  );

  if (!result.success) {
    throw new ValidationError(result.error || 'Failed to send update notification');
  }

  logger.info('Sponsor notification sent by admin', {
    updateId,
    sponsorEmail: logger.maskEmail(sponsorship.sponsorEmail),
    childName,
    provider: result.data?.provider,
  });
  logger.apiResponse(method, path, 200);

  return createSuccessResponse(
    {
      updateId,
      notificationSent: true,
      provider: result.data?.provider,
      recipientEmail: sponsorship.sponsorEmail,
    },
    'Notification sent successfully'
  );
}

export const POST = withErrorHandling(handler, 'POST', '/api/admin/updates/notify');
