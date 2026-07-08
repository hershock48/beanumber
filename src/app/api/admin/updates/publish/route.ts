/**
 * Admin: publish a pending child update.
 *
 * Flips status='Published', visibleToSponsor=true, publishedAt=now in
 * Postgres so sponsors actually see the update on the kid page and
 * in /me. The previous version routed through publishUpdateTool which
 * wrote to Airtable only — leaving the Postgres row stuck at Pending
 * Review forever post-migration. That made the whole Simon→Kevin→
 * sponsor child-update pipeline end-to-end broken.
 *
 * Role gate: admin only. Simon (role='simon') cannot publish his own
 * submissions; that's the entire point of the review pattern.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
  ValidationError,
  AuthorizationError,
} from '@/lib/errors';
import { parseRequestBody } from '@/lib/validation';
import { getAdminRole } from '@/lib/admin-session';
import { db } from '@/lib/db/client';
import { childUpdates, children, sponsorships } from '@/lib/db/schema';
import { eq, and, or } from 'drizzle-orm';
import {
  sendPush,
  resolveKidRecipientMobileUserIds,
} from '@/lib/push/send';

async function handler(request: NextRequest): Promise<NextResponse> {
  const method = 'POST';
  const path = '/api/admin/updates/publish';
  logger.apiRequest(method, path);

  // Role gate: admin only (Simon cannot self-publish).
  const role = await getAdminRole();
  if (role !== 'admin') {
    throw new AuthorizationError('Admin role required to publish updates');
  }

  const bodyResult = await parseRequestBody(request);
  if (!bodyResult.success) throw new ValidationError(bodyResult.error!);
  const { updateId } = bodyResult.data as { updateId: string };
  if (!updateId) throw new ValidationError('updateId is required');

  // Look up the update row. Accept either Postgres UUID or the legacy
  // `update_id` text key Simon's intake form might still emit.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = UUID_RE.test(updateId);
  const found = await db
    .select()
    .from(childUpdates)
    .where(
      isUuid
        ? eq(childUpdates.id, updateId)
        : eq(childUpdates.updateId, updateId)
    )
    .limit(1);
  const update = found[0];
  if (!update) {
    throw new ValidationError(`Update not found: ${updateId}`);
  }
  if (update.status === 'Published') {
    // Idempotent: publishing an already-published row is a no-op.
    return createSuccessResponse(
      {
        updateId: update.id,
        childId: update.childIdLegacy ?? update.childId,
        title: update.title,
        publishedAt: update.publishedAt?.toISOString() ?? null,
        sponsorNotificationReady: false,
        sponsor: null,
      },
      'Update already published'
    );
  }

  // Resolve the linked child (UUID or legacy ChildID) for the response
  // payload + the notification side-effect.
  const childRows = update.childId
    ? await db.select().from(children).where(eq(children.id, update.childId)).limit(1)
    : update.childIdLegacy
    ? await db
        .select()
        .from(children)
        .where(eq(children.childId, update.childIdLegacy))
        .limit(1)
    : [];
  const child = childRows[0];

  // Flip status + visibility + publish timestamp.
  const publishedAt = new Date();
  const updated = await db
    .update(childUpdates)
    .set({
      status: 'Published',
      visibleToSponsor: true,
      publishedAt,
      reviewedBy: role,
      reviewedAt: publishedAt,
      updatedAt: publishedAt,
    })
    .where(eq(childUpdates.id, update.id))
    .returning();

  // Find any sponsor currently relating to this kid so the caller can
  // know whether to fire the notification email. Match the dual-key
  // child path used everywhere else.
  let sponsor: { email: string; name: string | null; code: string } | null = null;
  if (child) {
    const sponsorRows = await db
      .select({
        email: sponsorships.sponsorEmail,
        name: sponsorships.sponsorName,
        code: sponsorships.sponsorCode,
      })
      .from(sponsorships)
      .where(
        and(
          eq(sponsorships.status, 'Active'),
          or(
            eq(sponsorships.childId, child.id),
            eq(sponsorships.childIdLegacy, child.childId)
          )
        )
      )
      .limit(1);
    if (sponsorRows[0]) {
      sponsor = {
        email: sponsorRows[0].email,
        name: sponsorRows[0].name ?? null,
        code: sponsorRows[0].code,
      };
    }
  }

  logger.info('Update published by admin', {
    updateId: updated[0]?.id,
    childId: update.childIdLegacy ?? update.childId,
    title: updated[0]?.title,
  });

  // Fire push to every sponsor + holder of this kid. Best-effort —
  // a push failure must not block the publish response. Non-mobile
  // sponsors are resolved-away by resolveKidRecipientMobileUserIds
  // (it filters on "has a live push device"), so we don't queue
  // rows we can't ship.
  if (child) {
    try {
      const recipientUserIds = await resolveKidRecipientMobileUserIds(
        child.id,
        child.childId ?? null
      );
      if (recipientUserIds.length > 0) {
        const captionFirstLine =
          updated[0]?.title ||
          update.summary ||
          update.content ||
          `New update from ${child.firstName ?? 'them'}.`;
        await sendPush({
          kind: 'kidUpdate',
          kidId: child.id,
          recipientUserIds,
          captionFirstLine,
        });
      }
    } catch (err) {
      logger.warn('[updates/publish] push send failed (non-fatal)', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.apiResponse(method, path, 200);

  return createSuccessResponse(
    {
      updateId: updated[0]?.id,
      childId: update.childIdLegacy ?? update.childId,
      title: updated[0]?.title,
      publishedAt: updated[0]?.publishedAt?.toISOString() ?? null,
      sponsorNotificationReady: !!sponsor,
      sponsor,
    },
    'Update published successfully'
  );
}

export const POST = withErrorHandling(handler, 'POST', '/api/admin/updates/publish');
