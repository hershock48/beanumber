/**
 * POST /api/sponsor/notes
 *
 * Sponsor writes a short note to their kid. Lands in the
 * kid_messages table with status='pending' for Simon to review and
 * translate before delivery.
 *
 * Auth
 * ────
 * Sponsor session cookie required. The sponsor must have an ACTIVE
 * or HOLDER sponsorship of the target kid — otherwise the note is
 * refused. Random anon POST requests get 401; signed-in users who
 * aren't sponsors of the specific kid get 403.
 *
 * Rate limit
 * ──────────
 * One PENDING note per (sponsor_email, child_id) at a time. Once
 * Simon delivers (or declines) the previous note, the sponsor can
 * queue a new one. Prevents a runaway sponsor from flooding the
 * queue and keeps Simon's Sunday batch manageable.
 *
 * Validation
 * ──────────
 *   - body_en: 10–1000 characters after trim.
 *   - No moderation at write time; Simon reviews before delivery.
 *
 * Response
 * ────────
 * 200 { ok: true, id, status }
 * 401 { error: 'Sign in to write to your kid.' }
 * 403 { error: 'You need to sponsor {kid} before you can write.' }
 * 409 { error: '...pending note already in queue...' }
 * 400 { error: '...too short / too long...' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { kidMessages, sponsorships, children } from '@/lib/db/schema';
import { sendKevinNoteAlert } from '@/lib/email';
import { SESSION } from '@/lib/constants';

const MIN_BODY = 10;
const MAX_BODY = 1000;

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
      { error: 'Sign in to write to your kid.' },
      { status: 401 }
    );
  }

  let body: {
    childRecordId?: string;
    childIdLegacy?: string;
    bodyEn?: string;
    sponsorName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawBody = (body.bodyEn ?? '').trim();
  if (rawBody.length < MIN_BODY) {
    return NextResponse.json(
      {
        error: `Your note is too short. Say a little more — the campus reads every one of these.`,
      },
      { status: 400 }
    );
  }
  if (rawBody.length > MAX_BODY) {
    return NextResponse.json(
      {
        error: `That's a long letter. Keep it under ${MAX_BODY} characters so the campus team can translate it quickly.`,
      },
      { status: 400 }
    );
  }

  // Resolve the kid — accept UUID or legacy id.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let childRow:
    | {
        id: string;
        firstName: string | null;
        displayName: string | null;
        shirtNumber: number | null;
        childId: string | null;
      }
    | undefined;
  if (body.childRecordId && UUID_RE.test(body.childRecordId)) {
    const r = await db
      .select({
        id: children.id,
        firstName: children.firstName,
        displayName: children.displayName,
        shirtNumber: children.shirtNumber,
        childId: children.childId,
      })
      .from(children)
      .where(eq(children.id, body.childRecordId))
      .limit(1);
    childRow = r[0];
  } else if (body.childIdLegacy) {
    const r = await db
      .select({
        id: children.id,
        firstName: children.firstName,
        displayName: children.displayName,
        shirtNumber: children.shirtNumber,
        childId: children.childId,
      })
      .from(children)
      .where(eq(children.childId, body.childIdLegacy))
      .limit(1);
    childRow = r[0];
  }
  if (!childRow) {
    return NextResponse.json(
      { error: 'That kid is not on the campus roster.' },
      { status: 404 }
    );
  }

  // Enforce sponsorship of the target kid — Active or Holder both
  // count (both statuses see sponsor-gated content elsewhere in the
  // app, so both can write notes).
  const relatedSponsorships = await db
    .select({ id: sponsorships.id, status: sponsorships.status })
    .from(sponsorships)
    .where(
      and(
        sql`lower(${sponsorships.sponsorEmail}) = ${email}`,
        or(
          eq(sponsorships.childId, childRow.id),
          eq(sponsorships.childIdLegacy, childRow.childId ?? '')
        ),
        inArray(sponsorships.status, ['Active', 'Holder'])
      )
    )
    .limit(1);
  if (relatedSponsorships.length === 0) {
    return NextResponse.json(
      {
        error: `You need to sponsor ${childRow.firstName ?? 'this kid'} before you can write a note.`,
      },
      { status: 403 }
    );
  }

  // Rate limit — one pending-or-translated note per (sponsor, kid).
  // Delivered / declined notes don't count against the cap.
  const existingActive = await db
    .select({ id: kidMessages.id, status: kidMessages.status })
    .from(kidMessages)
    .where(
      and(
        sql`lower(${kidMessages.sponsorEmail}) = ${email}`,
        eq(kidMessages.childId, childRow.id),
        inArray(kidMessages.status, ['pending', 'translated'])
      )
    )
    .limit(1);
  if (existingActive.length > 0) {
    return NextResponse.json(
      {
        error:
          'You already have a note in the queue. Once it reaches the campus and gets delivered, you can write another.',
      },
      { status: 409 }
    );
  }

  const sponsorName = (body.sponsorName ?? '').trim() || null;

  try {
    const inserted = await db
      .insert(kidMessages)
      .values({
        sponsorEmail: email,
        sponsorName,
        childId: childRow.id,
        direction: 'sponsor_to_kid',
        bodyEn: rawBody,
        status: 'pending',
      })
      .returning({ id: kidMessages.id, status: kidMessages.status });

    // Fire the admin alert to Kevin — fully non-fatal. A Gmail blip or
    // a slow SendGrid retry must NOT take down the composer POST; the
    // sponsor's write is what matters. Errors are logged and swallowed.
    // Await it inside the try so we don't leak an unhandled rejection
    // when the runtime is teared down between requests.
    try {
      await sendKevinNoteAlert({
        noteId: inserted[0].id,
        sponsorEmail: email,
        sponsorName,
        kidFirstName: childRow.firstName || 'your kid',
        kidDisplayName:
          childRow.displayName || childRow.firstName || 'the kid',
        shirtNumber: childRow.shirtNumber ?? null,
        bodyEn: rawBody,
      });
    } catch (err) {
      console.warn(
        '[sponsor/notes] Kevin alert send failed (non-fatal):',
        err instanceof Error ? err.message : String(err)
      );
    }

    return NextResponse.json({
      ok: true,
      id: inserted[0].id,
      status: inserted[0].status,
    });
  } catch (err: unknown) {
    // The partial unique index kid_messages_active_per_sponsor_kid_idx
    // (see schema.ts docstring) enforces the same "one active note per
    // sponsor+kid" invariant that the pre-check above enforces at the
    // app layer. Two concurrent POSTs from the same sponsor can slip
    // past the pre-check but the second insert violates the index and
    // Postgres returns 23505 (unique_violation). Surface it as the
    // same 409 the pre-check returns.
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
    throw err;
  }
}
