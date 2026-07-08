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
import { sendKevinNoteAlert, sendSimonNoteAlert } from '@/lib/email';
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
      { error: 'Sign in to write your penpal.' },
      { status: 401 }
    );
  }

  let body: {
    childRecordId?: string;
    childIdLegacy?: string;
    bodyEn?: string;
    sponsorName?: string;
    /**
     * Sponsor-attached photos (2026-07-08). Array of public URLs
     * previously returned from POST /api/sponsor/notes/photo. Hard
     * cap of 2 per note — sponsors can send more by writing another
     * note in the next cycle. Each URL must be http(s); malformed
     * entries reject the whole POST rather than silently drop, so
     * the sponsor isn't left wondering where their photo went.
     */
    attachments?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Attachment sanitization — cap at 2, validate URLs, drop empties.
  const MAX_ATTACHMENTS = 2;
  const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (rawAttachments.length > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `You can attach up to ${MAX_ATTACHMENTS} photos per note.` },
      { status: 400 }
    );
  }
  const attachmentEntries: Array<{ url: string; uploadedAt: string }> = [];
  const nowIso = new Date().toISOString();
  for (const raw of rawAttachments) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const u = new URL(trimmed);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        throw new Error('bad protocol');
      }
      // Reject URLs with embedded credentials
      // (http://user:pass@host/…). Browsers strip creds on <img>
      // fetches, but the raw string persists in jsonb and would
      // leak on any future admin export.
      if (u.username || u.password) {
        throw new Error('credentials in URL');
      }
      attachmentEntries.push({ url: u.toString(), uploadedAt: nowIso });
    } catch {
      return NextResponse.json(
        {
          error:
            'One of the attached photos has a malformed URL. Re-upload and try again.',
        },
        { status: 400 }
      );
    }
  }
  const attachments = attachmentEntries.length > 0 ? attachmentEntries : null;

  const rawBody = (body.bodyEn ?? '').trim();
  if (rawBody.length < MIN_BODY) {
    return NextResponse.json(
      {
        error: `Your penpal note is too short. Say a little more — the campus reads every one of these.`,
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

  // Writing notes requires an ACTIVE MONTHLY sponsorship of the target
  // kid. Rule change 2026-07-06: holders (shirt-only, no monthly) can
  // no longer write. The correspondence engine is a sponsor benefit,
  // and letting holders write while the composer promises "the campus
  // team will translate and deliver" reads wrong when the holder has
  // no monthly relationship to fund that work. Holders can still meet
  // the kid, hold the number, and convert to monthly to unlock notes.
  const relatedSponsorships = await db
    .select({
      id: sponsorships.id,
      status: sponsorships.status,
      monthlyAmount: sponsorships.monthlyAmount,
      // childRevealedAt is set only when the sponsor claimed this kid
      // via Hold-to-Meet (they physically hold the shirt with this
      // kid's number). Null when they added the sponsorship without
      // owning the shirt — an "add-on" sponsorship. Used downstream to
      // color the Kevin alert email so add-on notes aren't described
      // as coming from the shirt-holder.
      childRevealedAt: sponsorships.childRevealedAt,
    })
    .from(sponsorships)
    .where(
      and(
        sql`lower(${sponsorships.sponsorEmail}) = ${email}`,
        or(
          eq(sponsorships.childId, childRow.id),
          // Only include the legacy branch when we actually have a
          // legacy id to match. eq(childIdLegacy, '') would otherwise
          // match sponsorships whose legacy field is literally the
          // empty string — probably nothing in prod, but a real
          // false-positive surface if a bad row ever slipped in.
          childRow.childId
            ? eq(sponsorships.childIdLegacy, childRow.childId)
            : sql`false`
        ),
        eq(sponsorships.status, 'Active')
      )
    )
    .limit(1);
  // Also require monthlyAmount > 0 — an 'Active' status with $0/mo is
  // still a holder in the spirit of the rule.
  const monthlyRow = relatedSponsorships.find(
    r => Number(r.monthlyAmount ?? 0) > 0
  );
  if (!monthlyRow) {
    return NextResponse.json(
      {
        error: `You need to be sponsoring ${childRow.firstName ?? 'this kid'} monthly before you can write a penpal note. If you're the holder, add a monthly sponsorship to unlock writing.`,
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
          'You already have a penpal note in the queue. Once it reaches the campus and gets delivered, you can write another.',
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
        // Sponsor-attached photos (2026-07-08). Null when the sponsor
        // sent a text-only note, which is still the common case.
        attachments,
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
        kidFirstName: childRow.firstName || 'the kid',
        kidDisplayName:
          childRow.displayName || childRow.firstName || 'the kid',
        shirtNumber: childRow.shirtNumber ?? null,
        // True only when the sponsor claimed THIS kid's number via
        // Hold-to-Meet (owns the shirt). False for add-on sponsorships
        // — same sponsor writing to a kid they don't hold the shirt
        // for. The alert renders a small tag so Kevin knows which
        // channel he's looking at (matters for retention analysis
        // and for how he might frame a personal follow-up).
        sponsorHoldsShirt: !!monthlyRow.childRevealedAt,
        bodyEn: rawBody,
      });
    } catch (err) {
      console.warn(
        '[sponsor/notes] Kevin alert send failed (non-fatal):',
        err instanceof Error ? err.message : String(err)
      );
    }

    // Simon (campus-side reviewer) also gets the ping so a note that
    // came in mid-Kampala-morning doesn't wait for him to happen to
    // open the queue. Same non-fatal posture as the Kevin alert.
    try {
      await sendSimonNoteAlert({
        noteId: inserted[0].id,
        sponsorEmail: email,
        sponsorName,
        kidFirstName: childRow.firstName || 'the kid',
        kidDisplayName:
          childRow.displayName || childRow.firstName || 'the kid',
        shirtNumber: childRow.shirtNumber ?? null,
        bodyEn: rawBody,
      });
    } catch (err) {
      console.warn(
        '[sponsor/notes] Simon alert send failed (non-fatal):',
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
