/**
 * Admin · Monthly campus update — Simon's dedicated page for
 * writing the current month's newsletter body + photo.
 *
 * Server-rendered shell. Pulls (or creates) the current month's
 * Newsletter draft on load via the API, then hands the body and
 * photo URL off to the client editor.
 *
 * Kevin polishes from /admin/newsletter (the full editor with
 * subject, teaser, schedule, send controls). This page is the
 * minimum surface Simon needs: write what happened, attach a photo.
 */

import { inArray } from 'drizzle-orm';
import { AdminShell } from '../_components/AdminShell';
import { getAdminRole } from '@/lib/admin-session';
import { CampusUpdateEditor } from './CampusUpdateEditor';
import { db } from '@/lib/db/client';
import { newsletters } from '@/lib/db/schema';
import {
  buildCampusUpdateTitle,
  candidateTitlesForMonth,
} from '@/lib/newsletter-title';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function loadThisMonth(): Promise<{
  exists: boolean;
  title: string;
  body: string;
  heroPhotoUrl: string | null;
  lastEditedBySimon: string | null;
}> {
  const title = buildCampusUpdateTitle(new Date());
  const empty = { exists: false, title, body: '', heroPhotoUrl: null, lastEditedBySimon: null };

  try {
    // Match either the new "{Month} at the campus" title or the legacy
    // "Campus update — <Month> <Year>" title so any draft already saved
    // under the old name still loads into the same editor.
    const rows = await db
      .select({
        title: newsletters.title,
        bodyHtml: newsletters.bodyHtml,
        heroPhotoUrl: newsletters.heroPhotoUrl,
      })
      .from(newsletters)
      .where(inArray(newsletters.title, candidateTitlesForMonth(new Date())))
      .limit(1);
    const row = rows[0];
    if (!row) return empty;
    return {
      exists: true,
      title: row.title || title,
      body: row.bodyHtml || '',
      heroPhotoUrl: row.heroPhotoUrl || null,
      // LastEditedBySimon is an Airtable-era field that hasn't been
      // mirrored into the Postgres newsletters schema. The page
      // doesn't surface this value directly today (the editor renders
      // off `body` + `heroPhotoUrl`), so leaving it null is safe.
      lastEditedBySimon: null,
    };
  } catch {
    return empty;
  }
}

export default async function CampusUpdatePage() {
  const role = (await getAdminRole()) || 'admin';
  const data = await loadThisMonth();

  return (
    <AdminShell activeTab="campus-update" role={role}>
      <div className="max-w-3xl mx-auto px-5 py-6 md:py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
            Monthly campus update
          </p>
          <h1
            className="text-3xl md:text-4xl text-[#0d0d0d] mb-2"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {data.title}
          </h1>
          <p className="text-[#666]">
            {role === 'simon'
              ? "Write what's been happening at the campus this month. Kevin will polish it and send to sponsors. You can save and come back any time — it's a draft until Kevin sends."
              : 'The current month\'s draft. Polish happens in the full Newsletter editor; this page mirrors what Simon sees.'}
          </p>
        </div>

        <CampusUpdateEditor
          initialBody={data.body}
          initialPhotoUrl={data.heroPhotoUrl}
          role={role}
        />
      </div>
    </AdminShell>
  );
}
