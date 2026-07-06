/**
 * Admin · Sponsor notes queue.
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

  const pendingCount = messages.filter(m => m.status === 'pending').length;
  const translatedCount = messages.filter(m => m.status === 'translated').length;

  return (
    <AdminShell activeTab="messages" role={role}>
      <div className="max-w-4xl mx-auto px-5 py-6 md:py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
            Sponsor notes
          </p>
          <h1
            className="text-3xl md:text-4xl text-[#0d0d0d] mb-3"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {role === 'simon'
              ? "Notes waiting to translate + deliver."
              : "Sponsor-to-kid notes."}
          </h1>
          <p className="text-[#666] leading-relaxed max-w-2xl">
            {role === 'simon'
              ? "Sponsors write short notes to their kids from the site. Translate each one, then mark delivered once you've handed it over at the campus. Decline if a note isn't right — Kevin will handle the explanation."
              : "Every sponsor-written note. Simon translates and delivers; you can eyeball any of them before or after."}
          </p>
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
