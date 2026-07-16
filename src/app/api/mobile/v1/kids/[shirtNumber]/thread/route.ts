/**
 * /api/mobile/v1/kids/[shirtNumber]/thread
 *
 * GET  — read the sponsor's note thread with THIS kid.
 * POST — send a new note. Body: { body: string, photoUrl?: string }.
 *
 * Access gate: viewer must have an ACTIVE MONTHLY sponsorship of this
 * kid (holders don't get notes — same rule as /api/sponsor/notes on
 * the web). When the viewer is not eligible, the endpoint returns
 * 403 with `{ locked: true, unlockCopy: "..." }` so the RN client can
 * render the "warm locked card" without a separate role fetch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import {
  createSuccessResponse,
  withErrorHandling,
  NotFoundError,
  ValidationError,
  createErrorResponse,
} from '@/lib/errors';
import { requireMobileAuth } from '@/lib/auth';
import { getViewerEmails } from '@/lib/mobile-viewer';
import { db } from '@/lib/db/client';
import { kidMessages, sponsorships } from '@/lib/db/schema';
import { getNoteThreadForSponsorAndChild } from '@/lib/db/queries';
import { resolveShirtNumberForClaim } from '@/lib/claim-resolve';
import { sendKevinNoteAlert } from '@/lib/email';
import type { Child } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MIN_BODY = 10;
const MAX_BODY = 1000;

export type MobileThreadDirection = 'sponsorToKid' | 'kidToSponsor';

export interface MobileThreadMessage {
  id: string;
  direction: MobileThreadDirection;
  sentAt: string;
  body: string;
  statusText: string;
  /**
   * Public URL of the kid's scanned handwritten reply photo when
   * this message is a kidToSponsor row uploaded via the 2026-07-08
   * scanned-reply workflow. Null on:
   *   - sponsorToKid rows (always)
   *   - legacy typed-only replies
   * Mobile clients render this as the primary content and `body`
   * below as an italic translation caption.
   */
  imageUrl: string | null;
  /**
   * Sponsor-attached photos (2026-07-08). Only populated on
   * sponsorToKid rows. Array of public URLs, order-preserved. Mobile
   * clients render these below the sponsor's own text so the user
   * sees which photos they attached to that specific note.
   */
  attachments: string[];
}

export interface MobileThreadResponse {
  messages: MobileThreadMessage[];
  kidIsWritingBack: boolean;
}

export interface MobileThreadLockedResponse {
  locked: true;
  unlockCopy: string;
}

interface MonthlySponsorshipMatch {
  id: string;
  sponsorEmail: string;
  childRevealedAt: Date | null;
}

/**
 * Resolve the kid + verify the viewer has an ACTIVE MONTHLY
 * sponsorship of them, matching across the viewer's whole EMAIL SET
 * (provider + linked purchase email). The child match covers three
 * row shapes: UUID FK, real legacy ChildID (canonical numbers), and
 * the synthetic per-number legacy id + claimed_shirt_number pair
 * (cycle numbers — those rows never carry the canonical kid's ids).
 *
 * Returns the resolved child + the sponsorship match (with
 * `childRevealedAt` — colors the Kevin alert email — and
 * `sponsorEmail` — the identity the note is filed under, so web and
 * mobile see one thread). Returns `{ locked: true }` when the viewer
 * is not eligible; caller renders a 403 with the locked-card payload.
 */
async function resolveMonthlyOrLocked(args: {
  shirtNumber: number;
  viewerEmails: string[];
}): Promise<
  | { locked: true; kidFirstName: string | null }
  | { locked: false; child: Child; monthly: MonthlySponsorshipMatch }
> {
  const identity = await resolveShirtNumberForClaim(args.shirtNumber);
  if (!identity) {
    // Caller turns the null path into a NotFoundError; we short-circuit
    // here by throwing so the shape stays clean.
    throw new NotFoundError('Kid not found');
  }
  const child = identity.canonicalRow;

  const emails = args.viewerEmails
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) {
    return { locked: true, kidFirstName: child.firstName ?? null };
  }

  const childMatches = [
    eq(sponsorships.claimedShirtNumber, args.shirtNumber),
    ...(child.id ? [eq(sponsorships.childId, child.id)] : []),
    ...(child.childId
      ? [eq(sponsorships.childIdLegacy, child.childId)]
      : []),
    // Cycle numbers: the synthetic per-number legacy id.
    ...(identity.childUuid === null
      ? [eq(sponsorships.childIdLegacy, identity.childIdLegacy)]
      : []),
  ];

  const rows = await db
    .select({
      id: sponsorships.id,
      sponsorEmail: sponsorships.sponsorEmail,
      status: sponsorships.status,
      monthlyAmount: sponsorships.monthlyAmount,
      childRevealedAt: sponsorships.childRevealedAt,
    })
    .from(sponsorships)
    .where(
      and(
        inArray(sql`lower(${sponsorships.sponsorEmail})`, emails),
        or(...childMatches),
        eq(sponsorships.status, 'Active')
      )
    )
    .limit(5);
  const monthly = rows.find(r => Number(r.monthlyAmount ?? 0) > 0);
  if (!monthly) {
    return { locked: true, kidFirstName: child.firstName ?? null };
  }
  return {
    locked: false,
    child,
    monthly: {
      id: monthly.id,
      sponsorEmail: monthly.sponsorEmail,
      childRevealedAt: monthly.childRevealedAt,
    },
  };
}

/**
 * Copy the sponsor sees on the locked thread card. Kept warm — this
 * is where the "become a sponsor" pitch hits sponsors who bought a
 * shirt but haven't converted to monthly yet.
 */
function lockedCopyFor(kidFirstName: string | null): string {
  const name = kidFirstName ?? 'this kid';
  return `Writing to ${name} unlocks when you're sponsoring monthly. Notes go to the campus team, get translated, and land in ${name}'s hands the next Sunday batch.`;
}

/**
 * The sponsor-facing status verb for one row. Mirrors the phrasing on
 * the web NotesThread so the same message reads the same in both
 * places.
 */
function statusTextFor(row: {
  direction: 'sponsor_to_kid' | 'kid_to_sponsor';
  status: string;
  deliveredAt: string | null;
}): string {
  if (row.direction === 'kid_to_sponsor') {
    return 'Reply from the campus';
  }
  switch (row.status) {
    case 'delivered':
      return 'Delivered at the campus';
    case 'translated':
      return 'On its way — translated';
    case 'declined':
      return 'Not delivered';
    case 'pending':
    default:
      return 'With the campus team';
  }
}

// ── GET ─────────────────────────────────────────────────────────────

async function getHandler(
  request: NextRequest,
  context: { params: Promise<{ shirtNumber: string }> }
): Promise<NextResponse> {
  const method = 'GET';
  const { shirtNumber: raw } = await context.params;
  const shirtNumber = parseInt(raw, 10);
  const path = `/api/mobile/v1/kids/${raw}/thread`;
  logger.apiRequest(method, path);

  if (isNaN(shirtNumber) || shirtNumber <= 0) {
    throw new ValidationError('Invalid shirt number');
  }

  const viewer = await requireMobileAuth(request);
  const viewerEmails = await getViewerEmails(viewer);
  const resolved = await resolveMonthlyOrLocked({
    shirtNumber,
    viewerEmails,
  });
  if (resolved.locked) {
    const locked: MobileThreadLockedResponse = {
      locked: true,
      unlockCopy: lockedCopyFor(resolved.kidFirstName),
    };
    logger.apiResponse(method, path, 403);
    return NextResponse.json(locked, { status: 403 });
  }

  // The thread lives under whichever email(s) wrote the notes. Merge
  // across the viewer's set — after an email link, notes written on
  // the web under the purchase email and in-app under the provider
  // email are ONE conversation with the kid.
  const perEmail = await Promise.all(
    viewerEmails.map(email =>
      getNoteThreadForSponsorAndChild({
        sponsorEmail: email,
        childRecordId: resolved.child.id,
      }).catch(() => [])
    )
  );
  const seenIds = new Set<string>();
  const rows = perEmail
    .flat()
    .filter(r => (seenIds.has(r.id) ? false : (seenIds.add(r.id), true)))
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  const messages: MobileThreadMessage[] = rows.map(r => ({
    id: r.id,
    direction:
      r.direction === 'sponsor_to_kid' ? 'sponsorToKid' : 'kidToSponsor',
    sentAt:
      r.direction === 'kid_to_sponsor'
        ? r.deliveredAt ?? r.createdAt
        : r.createdAt,
    body: r.bodyEn,
    statusText: statusTextFor({
      direction: r.direction,
      status: r.status,
      deliveredAt: r.deliveredAt,
    }),
    // Scanned reply photo — null except on kid_to_sponsor rows that
    // came in through the new upload flow. Client renders the photo
    // large and `body` as translation caption below.
    imageUrl: r.replyImageUrl,
    // Sponsor-attached photos on sponsor_to_kid rows. queries.ts
    // normalizes the jsonb into string[] | null; unwrap null to []
    // so mobile clients can always iterate without a nil check.
    attachments: r.attachments ?? [],
  }));

  // "Kid is writing back" — the campus has a delivered outbound with
  // no reply yet AND we know from a previous cycle that a reply is on
  // its way. Without a "kid is drafting" signal in the schema, we
  // approximate: true when there's a delivered outbound within the
  // last 14 days that has no matching reply. The mobile UI uses this
  // to render a soft "someone's writing back" ambient state.
  const now = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const outboundDeliveredRecently = rows.filter(
    r =>
      r.direction === 'sponsor_to_kid' &&
      r.status === 'delivered' &&
      r.deliveredAt &&
      now - new Date(r.deliveredAt).getTime() < fourteenDaysMs
  );
  const kidReplyIds = new Set(
    rows.filter(r => r.direction === 'kid_to_sponsor').map(r => r.parentMessageId)
  );
  const kidIsWritingBack = outboundDeliveredRecently.some(
    r => !kidReplyIds.has(r.id)
  );

  logger.apiResponse(method, path, 200);
  const body: MobileThreadResponse = { messages, kidIsWritingBack };
  return createSuccessResponse(body);
}

// ── POST ────────────────────────────────────────────────────────────

async function postHandler(
  request: NextRequest,
  context: { params: Promise<{ shirtNumber: string }> }
): Promise<NextResponse> {
  const method = 'POST';
  const { shirtNumber: raw } = await context.params;
  const shirtNumber = parseInt(raw, 10);
  const path = `/api/mobile/v1/kids/${raw}/thread`;
  logger.apiRequest(method, path);

  if (isNaN(shirtNumber) || shirtNumber <= 0) {
    throw new ValidationError('Invalid shirt number');
  }

  const viewer = await requireMobileAuth(request);

  let json: { body?: string; photoUrl?: string };
  try {
    json = await request.json();
  } catch {
    throw new ValidationError('Invalid JSON body');
  }
  const bodyText = (json.body ?? '').trim();
  if (bodyText.length < MIN_BODY) {
    throw new ValidationError(
      'Your note is too short. Say a little more — the campus reads every one of these.'
    );
  }
  if (bodyText.length > MAX_BODY) {
    throw new ValidationError(
      `That's a long letter. Keep it under ${MAX_BODY} characters so the campus team can translate it quickly.`
    );
  }

  const viewerEmails = await getViewerEmails(viewer);
  const resolved = await resolveMonthlyOrLocked({
    shirtNumber,
    viewerEmails,
  });
  if (resolved.locked) {
    const locked: MobileThreadLockedResponse = {
      locked: true,
      unlockCopy: lockedCopyFor(resolved.kidFirstName),
    };
    logger.apiResponse(method, path, 403);
    return NextResponse.json(locked, { status: 403 });
  }
  const { child, monthly } = resolved;
  // File the note under the email that OWNS the monthly sponsorship —
  // that's the identity the web thread reads, the admin queue shows,
  // and the reply push targets. Using the raw provider email here
  // would fork the conversation into two half-threads.
  const noteEmail = monthly.sponsorEmail.trim().toLowerCase();

  // Rate limit: one queued note per (sponsor, kid) across the whole
  // email set — two emails, one person, one slot in the queue.
  const existing = await db
    .select({ id: kidMessages.id })
    .from(kidMessages)
    .where(
      and(
        inArray(sql`lower(${kidMessages.sponsorEmail})`, viewerEmails),
        eq(kidMessages.childId, child.id),
        // Kevin approval layer (2026-07-10). Extending awaiting_kevin
        // into the rate-limit filter so a mobile writer can't queue
        // two notes while the first is still waiting for Kevin.
        // Mirrors src/app/api/sponsor/notes/route.ts.
        inArray(kidMessages.status, ['awaiting_kevin', 'pending', 'translated'])
      )
    )
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json(
      {
        error:
          'You already have a note in the queue. Once it reaches the campus and gets delivered, you can write another.',
      },
      { status: 409 }
    );
  }

  try {
    const inserted = await db
      .insert(kidMessages)
      .values({
        sponsorEmail: noteEmail,
        sponsorName: null,
        childId: child.id,
        direction: 'sponsor_to_kid',
        bodyEn: bodyText,
        // Kevin approval layer (2026-07-10). Same as the web POST at
        // /api/sponsor/notes — new mobile notes must go through
        // Kevin before Simon sees them.
        status: 'awaiting_kevin',
      })
      .returning({
        id: kidMessages.id,
        status: kidMessages.status,
        createdAt: kidMessages.createdAt,
      });

    // Kevin alert — non-fatal.
    try {
      await sendKevinNoteAlert({
        noteId: inserted[0].id,
        sponsorEmail: noteEmail,
        sponsorName: null,
        kidFirstName: child.firstName || 'the kid',
        kidDisplayName: child.displayName || child.firstName || 'the kid',
        // The number the sponsor holds — for cycle numbers the
        // canonical row's own number is a different shirt.
        shirtNumber,
        sponsorHoldsShirt: !!monthly.childRevealedAt,
        bodyEn: bodyText,
      });
    } catch (err) {
      logger.warn(
        `[mobile/thread] Kevin alert send failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Kevin approval layer (2026-07-10). Simon alert is no longer
    // fired on POST — it now fires from the admin PATCH kevin_approve
    // handler so Simon only hears about greenlit notes. Mirrors the
    // web sponsor notes route.

    const created: MobileThreadMessage = {
      id: inserted[0].id,
      direction: 'sponsorToKid',
      sentAt: inserted[0].createdAt
        ? new Date(inserted[0].createdAt).toISOString()
        : new Date().toISOString(),
      body: bodyText,
      statusText: statusTextFor({
        direction: 'sponsor_to_kid',
        status: inserted[0].status,
        deliveredAt: null,
      }),
      // A newly-sent sponsor note never carries a reply photo.
      imageUrl: null,
      // Mobile POST doesn't yet accept sponsor attachments (that
      // ships with the mobile compose flow). New notes come back
      // with an empty array so clients don't need to null-check.
      attachments: [],
    };

    logger.apiResponse(method, path, 200);
    return createSuccessResponse(created);
  } catch (err: unknown) {
    const pgCode =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';
    if (pgCode === '23505') {
      return NextResponse.json(
        {
          error:
            'You already have a note in the queue. Once it reaches the campus and gets delivered, you can write another.',
        },
        { status: 409 }
      );
    }
    return createErrorResponse(err, method, path);
  }
}

export const GET = withErrorHandling(
  getHandler as (request: NextRequest) => Promise<NextResponse>,
  'GET',
  '/api/mobile/v1/kids/[shirtNumber]/thread'
);

export const POST = withErrorHandling(
  postHandler as (request: NextRequest) => Promise<NextResponse>,
  'POST',
  '/api/mobile/v1/kids/[shirtNumber]/thread'
);
