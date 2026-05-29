/**
 * Admin · Roster editor for a single kid.
 *
 * Server-rendered shell pulls the kid's full record from Airtable,
 * then hands off to the client-side <RosterEditor> for the form.
 * Save writes back to Airtable via /api/admin/roster/save.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AdminShell } from '../../_components/AdminShell';
import { getRosterKidByNumber } from '@/lib/admin/queries';
import { getAdminRole } from '@/lib/admin-session';
import { RosterEditor } from './RosterEditor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Props {
  params: Promise<{ number: string }>;
}

export default async function AdminRosterEditPage({ params }: Props) {
  const { number } = await params;
  const shirtNumber = Number(number);
  if (!Number.isInteger(shirtNumber) || shirtNumber < 1) notFound();

  const kid = await getRosterKidByNumber(shirtNumber);
  if (!kid) notFound();
  const role = (await getAdminRole()) || 'admin';

  return (
    <AdminShell activeTab="roster" role={role}>
      <div className="max-w-4xl mx-auto px-5 py-6 md:py-10">
        <Link
          href="/admin/roster"
          className="inline-flex items-center text-sm text-[#888] hover:text-[#0d0d0d] mb-6"
        >
          ← Back to roster
        </Link>

        <div className="flex items-start gap-4 md:gap-6 mb-8">
          {kid.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={kid.photoUrl}
              alt={kid.displayName}
              className="w-20 h-24 md:w-28 md:h-36 object-cover bg-[#f5f0e8] border border-[#e8e0d4]"
            />
          ) : (
            <div className="w-20 h-24 md:w-28 md:h-36 bg-[#f5f0e8] border border-[#e8e0d4] flex items-center justify-center">
              <span className="text-2xl opacity-30">👤</span>
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#D4A843] mb-1">
              #{kid.shirtNumber}{kid.age ? ` · age ${kid.age}` : ''}{kid.gradeClass ? ` · ${kid.gradeClass}` : ''}
            </p>
            <h1
              className="text-2xl md:text-3xl text-[#0d0d0d]"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {kid.displayName}
            </h1>
            <p className="text-sm text-[#888] mt-1">{kid.childId}</p>
            <Link
              href={`/children/${kid.shirtNumber}`}
              target="_blank"
              className="inline-block mt-2 text-xs text-[#D4A843] hover:underline"
            >
              View public page ↗
            </Link>
          </div>
        </div>

        <RosterEditor
          shirtNumber={kid.shirtNumber}
          firstName={kid.firstName}
          role={role}
          initial={{
            nameMeaning: kid.nameMeaning,
            familyContext: kid.familyContext,
            loves: kid.loves,
            childQuote: kid.childQuote,
            notes: kid.notes,
            intakeFromCampus: kid.intakeFromCampus,
            studentOfMonth: kid.studentOfMonth,
          }}
          reportCards={kid.reportCards}
          letters={kid.letters}
          lastEditedBySimon={kid.lastEditedBySimon}
          pendingFields={kid.pendingFields}
          deletionRequestedAt={kid.deletionRequestedAt}
        />
      </div>
    </AdminShell>
  );
}
