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

import { AdminShell } from '../_components/AdminShell';
import { getAdminRole } from '@/lib/admin-session';
import { CampusUpdateEditor } from './CampusUpdateEditor';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const NEWSLETTERS_TABLE =
  process.env.AIRTABLE_NEWSLETTERS_TABLE || 'Newsletters';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function buildMonthTitle(d: Date): string {
  const month = d.toLocaleString('en-US', { month: 'long' });
  return `Campus update — ${month} ${d.getFullYear()}`;
}

async function loadThisMonth(): Promise<{
  exists: boolean;
  title: string;
  body: string;
  heroPhotoUrl: string | null;
  lastEditedBySimon: string | null;
}> {
  const title = buildMonthTitle(new Date());
  const empty = { exists: false, title, body: '', heroPhotoUrl: null, lastEditedBySimon: null };
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) return empty;

  const formula = encodeURIComponent(`{Title}="${title.replace(/"/g, '\\"')}"`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    NEWSLETTERS_TABLE
  )}?filterByFormula=${formula}&maxRecords=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    cache: 'no-store',
  });
  if (!res.ok) return empty;
  const data = await res.json();
  const rec = data.records?.[0];
  if (!rec) return empty;
  const f = rec.fields || {};
  const heroArr = (f.HeroPhoto as Array<{ url: string; thumbnails?: { large?: { url: string } } }>) || [];
  const heroUrl = heroArr[0]?.thumbnails?.large?.url || heroArr[0]?.url || null;
  return {
    exists: true,
    title: (f.Title as string) || title,
    body: (f.BodyHTML as string) || '',
    heroPhotoUrl: heroUrl,
    lastEditedBySimon: (f.LastEditedBySimon as string) || null,
  };
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
