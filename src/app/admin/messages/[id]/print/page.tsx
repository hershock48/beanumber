/**
 * Print view for a single penpal note.
 *
 * Simon (or Kevin) clicks the Print button on the admin queue card
 * and lands here. The page renders one printable sheet — kid name +
 * shirt number as the header, the sponsor's English body in the
 * center, small footer. Auto-triggers the browser print dialog on
 * load so Simon just hits ⌘P worth of clicks and gets the paper.
 *
 * Not linked from the public site. Behind admin cookie.
 */

import { redirect, notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getAdminRole } from '@/lib/admin-session';
import { db } from '@/lib/db/client';
import { kidMessages, children } from '@/lib/db/schema';
import { PrintTrigger } from './PrintTrigger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PrintNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getAdminRole();
  if (!role) {
    redirect('/admin/login?next=/admin/messages');
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const rows = await db
    .select({
      id: kidMessages.id,
      sponsorEmail: kidMessages.sponsorEmail,
      sponsorName: kidMessages.sponsorName,
      direction: kidMessages.direction,
      bodyEn: kidMessages.bodyEn,
      bodyTranslated: kidMessages.bodyTranslated,
      status: kidMessages.status,
      createdAt: kidMessages.createdAt,
      kidFirstName: children.firstName,
      kidDisplayName: children.displayName,
      kidShirtNumber: children.shirtNumber,
    })
    .from(kidMessages)
    .leftJoin(children, eq(children.id, kidMessages.childId))
    .where(eq(kidMessages.id, id))
    .limit(1);
  const note = rows[0];
  if (!note) notFound();

  const kidName = note.kidDisplayName || note.kidFirstName || 'the kid';
  const shirtLabel =
    typeof note.kidShirtNumber === 'number'
      ? `#${note.kidShirtNumber}`
      : '';
  const sponsorFirst = note.sponsorName?.trim().split(/\s+/)[0] || 'Your penpal';
  const noteDate = note.createdAt
    ? new Date(note.createdAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <div
      style={{
        fontFamily: 'Georgia, "Times New Roman", serif',
        color: '#1a1208',
        maxWidth: '640px',
        margin: '0 auto',
        padding: '48px 40px',
        lineHeight: 1.6,
      }}
    >
      <PrintTrigger />
      {/* Header — Be A Number wordmark + kid name */}
      <div
        style={{
          borderBottom: '1px solid #1a1208',
          paddingBottom: '20px',
          marginBottom: '32px',
        }}
      >
        <p
          style={{
            fontSize: '11px',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontWeight: 700,
            margin: '0 0 6px 0',
            color: '#666',
          }}
        >
          # Be A Number &middot; A note from your penpal
        </p>
        <p
          style={{
            fontSize: '32px',
            fontWeight: 600,
            margin: '0',
          }}
        >
          For {kidName} {shirtLabel && <span style={{ color: '#D4A843' }}>{shirtLabel}</span>}
        </p>
        <p
          style={{
            fontSize: '13px',
            color: '#666',
            margin: '6px 0 0 0',
            fontStyle: 'italic',
          }}
        >
          From {sponsorFirst}
          {noteDate && ` · ${noteDate}`}
        </p>
      </div>

      {/* Body */}
      <div
        style={{
          fontSize: '17px',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
        }}
      >
        {note.bodyEn}
      </div>

      {/* Optional translation Simon typed */}
      {note.bodyTranslated && (
        <div
          style={{
            marginTop: '36px',
            paddingTop: '20px',
            borderTop: '1px dashed #999',
          }}
        >
          <p
            style={{
              fontSize: '10px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              fontFamily: 'Helvetica, Arial, sans-serif',
              fontWeight: 700,
              margin: '0 0 8px 0',
              color: '#888',
            }}
          >
            Translation
          </p>
          <div
            style={{
              fontSize: '16px',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              fontStyle: 'italic',
              color: '#333',
            }}
          >
            {note.bodyTranslated}
          </div>
        </div>
      )}

      {/* Footer */}
      <p
        style={{
          marginTop: '48px',
          fontSize: '10px',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          fontFamily: 'Helvetica, Arial, sans-serif',
          color: '#999',
          textAlign: 'center',
        }}
      >
        beanumber.org &middot; Youth Development Organization Uganda
      </p>

      {/* Print styles — hide anything not part of the sheet, force
          single-page white background, remove margin nav padding. */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          html, body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}
