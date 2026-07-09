/**
 * Admin · Penpal queue.
 *
 * Simon and Kevin both see this. Every sponsor-written note in the
 * system, ordered pending → translated → delivered → declined. Each
 * card shows the original English body, the translated body (once
 * entered), Simon's internal notes, and the buttons to move the
 * message forward.
 *
 * The actual workflow buttons are in the client MessageRow so state
 * can update in place after each PATCH. Server component just renders
 * the shell and the initial list.
 */

import { AdminShell } from '../_components/AdminShell';
import { getAdminRole } from '@/lib/admin-session';
import { db } from '@/lib/db/client';
import { kidMessages, children } from '@/lib/db/schema';
import { asc, eq, sql } from 'drizzle-orm';
import { MessagesQueue } from './MessagesQueue';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminMessagesPage() {
  const role = (await getAdminRole()) || 'admin';

  // Reconciler: any sponsor_to_kid parent that has a kid_to_sponsor
  // reply on it should be status='delivered'. The reply POST endpoint
  // auto-flips this at write time, but on 2026-07-09 James's parent
  // was found stuck at 'pending' despite the reply existing (silent
  // failure, no Kevin alert). Running this on every queue load is a
  // cheap belt-and-suspenders — it's a WHERE clause narrowed to only
  // the mismatched rows so it costs almost nothing in the healthy
  // case. Uses the reply's delivered_at as source of truth for when
  // the round-trip actually completed.
  await db.execute(sql`
    UPDATE kid_messages parent
    SET status = 'delivered',
        delivered_at = COALESCE(parent.delivered_at, reply.delivered_at, NOW()),
        translated_at = COALESCE(parent.translated_at, reply.delivered_at, NOW())
    FROM kid_messages reply
    WHERE reply.parent_message_id = parent.id
      AND reply.direction = 'kid_to_sponsor'
      AND parent.direction = 'sponsor_to_kid'
      AND parent.status IN ('pending', 'translated')
  `);

  // Fetch every sponsor->kid row (the queue) plus every kid->sponsor
  // row (replies). Attach replies to their parents in-memory so the
  // client renders each thread as a single card. Two queries beats
  // a self-join here because the queue and reply lists have their
  // own natural orderings.
  const [outboundRows, replyRows] = await Promise.all([
    db
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
        attachments: kidMessages.attachments,
        kidRecordId: children.id,
        kidFirstName: children.firstName,
        kidDisplayName: children.displayName,
        kidShirtNumber: children.shirtNumber,
        kidPhotoUrl: children.profilePhotoUrl,
      })
      .from(kidMessages)
      .leftJoin(children, eq(children.id, kidMessages.childId))
      .where(eq(kidMessages.direction, 'sponsor_to_kid'))
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
      ),
    db
      .select({
        id: kidMessages.id,
        parentMessageId: kidMessages.parentMessageId,
        bodyEn: kidMessages.bodyEn,
        bodyTranslated: kidMessages.bodyTranslated,
        deliveredAt: kidMessages.deliveredAt,
        createdAt: kidMessages.createdAt,
        replyImageUrl: kidMessages.replyImageUrl,
      })
      .from(kidMessages)
      .where(eq(kidMessages.direction, 'kid_to_sponsor'))
      // Ordered oldest-first so the Map .set() below leaves the
      // NEWEST reply as the winner if a duplicate somehow exists
      // (deterministic pick — belt-and-suspenders alongside the
      // partial unique index that prevents the duplicate at insert).
      .orderBy(asc(kidMessages.createdAt)),
  ]);

  const replyByParent = new Map<
    string,
    {
      id: string;
      bodyEn: string;
      bodyOriginal: string | null;
      imageUrl: string | null;
      deliveredAt: string | null;
      createdAt: string | null;
    }
  >();
  for (const r of replyRows) {
    if (!r.parentMessageId) continue;
    replyByParent.set(r.parentMessageId, {
      id: r.id,
      bodyEn: r.bodyEn,
      // body_translated on a kid->sponsor row holds the ORIGINAL
      // (untranslated) transcription of what the kid actually said,
      // which is helpful audit context but not the primary reader-
      // facing text.
      bodyOriginal: r.bodyTranslated,
      imageUrl: r.replyImageUrl,
      deliveredAt: r.deliveredAt ? new Date(r.deliveredAt).toISOString() : null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    });
  }

  // Normalize sponsor attachments from jsonb into a plain string[] of
  // URLs so the client doesn't have to know about the object shape.
  // Same shape/behavior as the NoteThreadEntry mapping in queries.ts.
  function normalizeAttachments(raw: unknown): string[] {
    if (!raw) return [];
    const arr =
      typeof raw === 'string'
        ? (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return null;
            }
          })()
        : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .map(a =>
        typeof a === 'string'
          ? a
          : a && typeof a === 'object' && typeof (a as { url?: unknown }).url === 'string'
          ? (a as { url: string }).url
          : null
      )
      .filter((u): u is string => !!u);
  }

  const messages = outboundRows.map(r => ({
    id: r.id,
    sponsorEmail: r.sponsorEmail,
    sponsorName: r.sponsorName,
    direction: r.direction,
    bodyEn: r.bodyEn,
    bodyTranslated: r.bodyTranslated,
    // Effective status: if a reply exists we treat the parent as
    // delivered regardless of the raw status column. Belt-and-
    // suspenders in case the reconciler above ever fails or the
    // write-side auto-flip silent-fails again. This is the value the
    // client sees.
    status: replyByParent.has(r.id) && r.status !== 'declined'
      ? 'delivered'
      : r.status,
    simonNotes: r.simonNotes,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    translatedAt: r.translatedAt ? new Date(r.translatedAt).toISOString() : null,
    deliveredAt: r.deliveredAt ? new Date(r.deliveredAt).toISOString() : null,
    declinedAt: r.declinedAt ? new Date(r.declinedAt).toISOString() : null,
    attachments: normalizeAttachments(r.attachments),
    kid: {
      recordId: r.kidRecordId,
      firstName: r.kidFirstName,
      displayName: r.kidDisplayName,
      shirtNumber: r.kidShirtNumber,
      photoUrl: r.kidPhotoUrl,
    },
    reply: replyByParent.get(r.id) ?? null,
  }));

  const pendingCount = messages.filter(m => m.status === 'pending').length;
  const translatedCount = messages.filter(m => m.status === 'translated').length;

  return (
    <AdminShell activeTab="messages" role={role}>
      <div className="max-w-4xl mx-auto px-5 py-6 md:py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
            Penpal
          </p>
          <h1
            className="text-3xl md:text-4xl text-[#0d0d0d] mb-3"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {role === 'simon'
              ? "Penpal notes waiting to translate + deliver."
              : "Penpal correspondence."}
          </h1>
          <p className="text-[#666] leading-relaxed max-w-2xl">
            {role === 'simon'
              ? "Sponsors write short penpal notes to their kids from the site. Print each note, take it to the kid at the campus, and hit Reply to upload their handwritten response."
              : "Every penpal note between sponsors and kids. Simon prints, delivers, and uploads the kid's scanned reply; you can eyeball any of them before or after."}
          </p>

          {/* Blank reply-template download — the printable A4 sheet
              with the BE A NUMBER wordmark, TO/FROM/DATE fill-in row,
              wide-ruled writing lines, and drawing area for kids to
              write their reply on before Simon scans + uploads. File
              lives at public/penpal-reply-template.pdf and is served
              at the top-level path. Kevin can freshen the PDF later
              without touching this link. */}
          <a
            href="/penpal-reply-template.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-4 text-sm font-bold text-[#D4A843] hover:underline"
            title="Download the blank template PDF (A4, print + hand to the kid)"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download blank reply template (PDF)
          </a>
          {(pendingCount > 0 || translatedCount > 0) && (
            <div className="mt-4 flex gap-4 text-xs text-[#666]">
              {pendingCount > 0 && (
                <span>
                  <strong className="text-[#c0392b]">{pendingCount}</strong>{' '}
                  pending
                </span>
              )}
              {translatedCount > 0 && (
                <span>
                  <strong className="text-[#0d0d0d]">{translatedCount}</strong>{' '}
                  ready to deliver
                </span>
              )}
            </div>
          )}
        </div>

        {messages.length === 0 ? (
          <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-8 md:p-12 text-center">
            <p className="text-[#666] leading-relaxed">
              No notes yet. Once sponsors start writing from their kid&rsquo;s
              page, they land here.
            </p>
          </div>
        ) : (
          <MessagesQueue initialMessages={messages} role={role} />
        )}
      </div>
    </AdminShell>
  );
}
