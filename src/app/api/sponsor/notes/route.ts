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
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { kidMessages, sponsorships, children } from '@/lib/db/schema';
import { sendKevinNoteAlert } from '@/lib/email';
import { SESSION } from '@/lib/constants';
import { CANONICAL_ROSTER_MAX } from '@/lib/roster-config';
import { resolveShirtNumberForClaim } from '@/lib/claim-resolve';

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
    /**
     * Sponsor's handwritten letter photo (2026-07-10). URL returned
     * from POST /api/sponsor/notes/photo. When present, this is
     * treated as the PRIMARY body of the note — Simon prints and
     * delivers the scan itself, no translation needed. body_en
     * becomes optional in this case. Buyers write on the physical
     * letter template we ship in the shirt bag and upload here.
     */
    letterImageUrl?: string;
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

  // Handwritten letter photo — same URL hygiene as attachments. When
  // supplied, this becomes the PRIMARY body of the note and body_en
  // becomes optional. Simon prints and delivers the scan directly.
  let letterImageUrl: string | null = null;
  const rawLetter = (body.letterImageUrl ?? '').trim();
  if (rawLetter) {
    try {
      const u = new URL(rawLetter);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        throw new Error('bad protocol');
      }
      if (u.username || u.password) {
        throw new Error('credentials in URL');
      }
      letterImageUrl = u.toString();
    } catch {
      return NextResponse.json(
        {
          error:
            'The letter photo URL looks malformed. Re-upload the photo and try again.',
        },
        { status: 400 }
      );
    }
  }

  const rawBody = (body.bodyEn ?? '').trim();

  // Body length rules — with the letter photo path, an empty body is
  // legal (the scan IS the letter). Without it we require the same
  // 10-1000 range as before. If a body IS typed with a letter present,
  // we still bound its length so a stray paste doesn't blow up.
  if (!letterImageUrl) {
    if (rawBody.length < MIN_BODY) {
      return NextResponse.json(
        {
          error: `Your penpal note is too short. Say a little more, or upload a handwritten letter instead.`,
        },
        { status: 400 }
      );
    }
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
  // Cycle-number fallback: a synthetic per-number legacy id
  // (HSP/BAN-0NN with NN past the canonical roster) has no children
  // row — the kid page synthesizes those identities from Batches
  // math. Resolve through the same math so a #70 holder's letter
  // lands on the real kid behind #70. Without this branch every
  // cycle-number holder got 404 "not on the campus roster" — while
  // the letter template shipped in the bag promises they can upload
  // a letter after signing in.
  const cycleNumberFromLegacy = (() => {
    const m = body.childIdLegacy?.match(/^HSP\/BAN-(\d{3,})$/);
    const n = m ? parseInt(m[1], 10) : null;
    return n && n > CANONICAL_ROSTER_MAX ? n : null;
  })();
  if (!childRow && cycleNumberFromLegacy) {
    const identity = await resolveShirtNumberForClaim(cycleNumberFromLegacy);
    if (identity) {
      const c = identity.canonicalRow;
      childRow = {
        id: c.id,
        firstName: c.firstName,
        displayName: c.displayName,
        shirtNumber: c.shirtNumber,
        childId: c.childId,
      };
    }
  }
  if (!childRow) {
    return NextResponse.json(
      { error: 'That kid is not on the campus roster.' },
      { status: 404 }
    );
  }

  // Writing notes: monthly sponsors write freely; shirt-holders get
  // ONE free letter ("included with the shirt" per the physical letter
  // template we ship). After that first note is on record (pending,
  // translated, or delivered — anything but declined), the cycle is
  // spent and subsequent writes 403 until they subscribe monthly.
  //
  // Non-holder non-monthly viewers get 403 — they haven't paid for
  // anything yet. Anon viewers were already rejected at the 401 check
  // above.
  //
  // The gate reads the kid_messages table directly as the source of
  // truth — not the sponsorships.included_letter_sent_at column. That
  // column is an audit trail (stamped on delivery) but is NOT the gate.
  // Why: stamping on delivery leaves a race window between "holder
  // POSTs letter A" and "Simon marks A delivered" during which a fast
  // second POST could slip past. Kevin's rule: no extra free letters.
  // See src/lib/penpal-cycle.ts for the full write-up.
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
            : sql`false`,
          // Cycle-number identities: the viewer's sponsorship row
          // carries the synthetic per-number legacy id (HSP/BAN-070)
          // and/or claimed_shirt_number — NOT the canonical kid's
          // ids. Without these branches a cycle-number holder or
          // sponsor 403'd on the letter the shirt insert promised
          // them.
          cycleNumberFromLegacy && body.childIdLegacy
            ? eq(sponsorships.childIdLegacy, body.childIdLegacy)
            : sql`false`,
          cycleNumberFromLegacy
            ? eq(sponsorships.claimedShirtNumber, cycleNumberFromLegacy)
            : sql`false`
        ),
        // Include both 'Active' and 'Holder' statuses. Fresh shirt
        // buyers get status='Holder' from webhook-bridge.ts (no
        // monthly = 'Holder'; monthly = 'Active'). Missing 'Holder'
        // here meant the included-letter path 403'd for the exact
        // audience it was built for. Fixed after audit 2026-07-10.
        inArray(sponsorships.status, ['Active', 'Holder'])
      )
    );

  const monthlyRow = relatedSponsorships.find(
    r => Number(r.monthlyAmount ?? 0) > 0
  );
  const holderRow = relatedSponsorships.find(r => !!r.childRevealedAt);

  if (!monthlyRow) {
    // No monthly. Check for holder-with-available-cycle.
    if (!holderRow) {
      return NextResponse.json(
        {
          error: `You need to hold this shirt to write to ${childRow.firstName ?? 'this kid'}. If you already do, sign in with the email you used to buy it.`,
        },
        { status: 403 }
      );
    }
    // Holder — check the message log for a spent cycle. Any non-declined
    // sponsor_to_kid message from this email for this kid counts.
    //
    // Race coverage:
    //   - Concurrent first-letter POSTs (no prior row exists): partial
    //     unique index kid_messages_active_per_sponsor_kid_idx enforces
    //     uniqueness across status IN ('pending','translated'), so the
    //     second concurrent INSERT hits 23505 → the catch below returns
    //     409. Neither commits.
    //   - Sequential post-first-delivery: this pre-check reads the
    //     committed 'delivered' row and 403s. The partial index doesn't
    //     apply to 'delivered' rows but doesn't need to — the delivered
    //     status is already visible to every subsequent SELECT.
    //   - Concurrent DURING first delivery (Simon's PATCH racing this
    //     POST): the pre-check reads the row as either pending (before
    //     the PATCH commits) or delivered (after). Either way non-
    //     declined → 403.
    const prior = await db
      .select({ id: kidMessages.id })
      .from(kidMessages)
      .where(
        and(
          sql`lower(${kidMessages.sponsorEmail}) = ${email}`,
          eq(kidMessages.childId, childRow.id),
          eq(kidMessages.direction, 'sponsor_to_kid'),
          ne(kidMessages.status, 'declined')
        )
      )
      .limit(1);
    if (prior.length > 0) {
      return NextResponse.json(
        {
          error: `You've already sent the letter that came with your shirt. Sponsor ${childRow.firstName ?? 'this kid'} at $25/month to keep writing to them.`,
        },
        { status: 403 }
      );
    }
    // Fall through — holder with unused cycle, allow the write.
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
        // Includes 'awaiting_kevin' (2026-07-10) so the sponsor can't
        // queue a second note while the first is still waiting for
        // Kevin's approve/decline. The message-based cycle gate above
        // already rejects a second free letter for holders, but this
        // rate limit applies to monthly sponsors too.
        inArray(kidMessages.status, ['awaiting_kevin', 'pending', 'translated'])
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
        // Kevin approval layer (2026-07-10). Every new sponsor→kid
        // note comes in as 'awaiting_kevin' — the campus team does
        // NOT see it until Kevin approves. Kevin's admin actions
        // flip it to 'pending' (approved) or 'declined' (rejected).
        // Historical rows may still be seeded 'pending' by legacy
        // paths; the queue filter reads both.
        status: 'awaiting_kevin',
        // Sponsor-attached photos (2026-07-08). Null when the sponsor
        // sent a text-only note, which is still the common case.
        attachments,
        // Sponsor's handwritten letter photo (2026-07-10). Null when
        // the sponsor typed. When set, Simon prints the scan and
        // delivers it directly — no translation step needed.
        letterImageUrl,
        letterImageUploadedAt: letterImageUrl ? new Date() : null,
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
        // True when this sponsor holds the shirt (childRevealedAt set
        // on any of their rows for this kid). Reads either the monthly
        // row's flag OR the holder row's flag — under the 2026-07-10
        // included-letter rule a holder-first-letter writer has no
        // monthly row yet but is still the shirt-holder, and the tag
        // should still say "Holds #N" for Kevin's inbox context.
        sponsorHoldsShirt: !!(
          monthlyRow?.childRevealedAt || holderRow?.childRevealedAt
        ),
        // When the sponsor uploaded a handwritten scan and skipped
        // typing, the body is empty. Substitute a marker so the
        // Kevin alert email doesn't render a blank quote block —
        // and so Kevin knows to click through to see the scan.
        bodyEn:
          rawBody.length > 0
            ? rawBody
            : '(Handwritten letter — see the scan on the admin queue.)',
      });
    } catch (err) {
      console.warn(
        '[sponsor/notes] Kevin alert send failed (non-fatal):',
        err instanceof Error ? err.message : String(err)
      );
    }

    // Note: Simon alert was previously fired here on every POST.
    // Under the 2026-07-10 Kevin-approval layer, the campus team
    // should NOT be pinged until Kevin has approved — otherwise
    // Simon might translate a note Kevin later declines.
    // The alert is now sent from the admin PATCH action='kevin_approve'
    // handler (src/app/api/admin/messages/[id]/route.ts) so Simon
    // only hears about greenlit notes.

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
