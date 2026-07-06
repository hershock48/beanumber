/**
 * Admin · Student of the Month picker (per-grade).
 *
 * Seven grade sections (Lower Kindergarten through P5, plus an
 * 'Unknown grade' catch-all if any kids have null grade_class).
 * Each section has its own current winner / pending nomination /
 * kid grid. Simon nominates one kid per grade per month; Kevin
 * approves each grade's winner independently.
 *
 * Server-rendered shell — pulls the roster once, splits by
 * canonical grade code, hands each grade's state to the client
 * picker with the Ugandan label Simon expects to see.
 */

import { AdminShell } from '../_components/AdminShell';
import { getRoster } from '@/lib/admin/queries';
import { getAdminRole } from '@/lib/admin-session';
import {
  ALL_GRADES,
  gradeLabelForSimon,
  gradeSortOrder,
  isGradeCode,
  type GradeCode,
} from '@/lib/grades';
import { SOTMPicker } from './SOTMPicker';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function currentMonthLabel(): string {
  const d = new Date();
  return `${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
}

export default async function SOTMPage() {
  const allKids = await getRoster();
  const role = (await getAdminRole()) || 'admin';
  const month = currentMonthLabel();

  // Group kids by canonical grade code. Kids whose gradeClass is
  // null or unrecognized fall into the 'unknown' bucket so Simon
  // still sees them (probably at the bottom of the page) instead of
  // having them silently disappear from the SOTM surface.
  const byGradeKey = new Map<
    string,
    { label: string; order: number; kids: typeof allKids }
  >();
  for (const kid of allKids) {
    if (kid.departedAt) continue;
    const code: GradeCode | 'unknown' = isGradeCode(kid.gradeClass)
      ? (kid.gradeClass as GradeCode)
      : 'unknown';
    const label =
      code === 'unknown' ? 'No grade set' : gradeLabelForSimon(code);
    const order =
      code === 'unknown' ? 99 : gradeSortOrder(code);
    const bucket = byGradeKey.get(code);
    if (bucket) bucket.kids.push(kid);
    else byGradeKey.set(code, { label, order, kids: [kid] });
  }

  // Render the 7 canonical grades in age order, then the unknown
  // bucket last if it has anything in it.
  const orderedKeys: string[] = [...ALL_GRADES, 'unknown'];
  const sections = orderedKeys
    .map(key => {
      const bucket = byGradeKey.get(key);
      if (!bucket || bucket.kids.length === 0) return null;
      return { key, ...bucket };
    })
    .filter(Boolean) as Array<{
      key: string;
      label: string;
      order: number;
      kids: typeof allKids;
    }>;

  return (
    <AdminShell activeTab="sotm" role={role}>
      <div className="max-w-6xl mx-auto px-5 py-6 md:py-10">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
            Student of the Month
          </p>
          <h1
            className="text-3xl md:text-4xl text-[#0d0d0d] mb-2"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {role === 'simon'
              ? `Nominate one kid per grade for ${month}`
              : `Student of the Month — ${month}`}
          </h1>
          <p className="text-[#666]">
            {role === 'simon'
              ? "One Student of the Month per grade — seven total winners. Tap a kid in their grade's section to nominate; you'll add a short reason, Kevin will approve before it shows up publicly."
              : "Seven winners, one per grade. Simon nominates from the campus; you approve each grade's winner here. Pending nominations show as red cards inside their grade section."}
          </p>
        </div>

        <div className="space-y-10">
          {sections.map(section => {
            const published = section.kids.find(k => !!k.studentOfMonth);
            const pending = section.kids.find(k => !!k.pendingSOTMMonth);
            return (
              <section key={section.key}>
                <header className="mb-3 pb-2 border-b border-[#e8e0d4] flex items-baseline justify-between gap-3">
                  <h2
                    className="text-xl md:text-2xl text-[#0d0d0d]"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    {section.label}
                  </h2>
                  <p className="text-xs text-[#aaa] tabular-nums flex-shrink-0">
                    {section.kids.length} kid{section.kids.length === 1 ? '' : 's'}
                  </p>
                </header>
                <SOTMPicker
                  kids={section.kids.map(k => ({
                    shirtNumber: k.shirtNumber,
                    displayName: k.displayName,
                    photoUrl: k.photoUrl,
                    studentOfMonth: k.studentOfMonth,
                    studentOfMonthReason: k.studentOfMonthReason,
                    pendingSOTMMonth: k.pendingSOTMMonth,
                    pendingSOTMReason: k.pendingSOTMReason,
                  }))}
                  role={role}
                  month={month}
                  gradeLabel={section.label}
                  publishedShirtNumber={published?.shirtNumber}
                  pendingShirtNumber={pending?.shirtNumber}
                />
              </section>
            );
          })}
          {sections.length === 0 && (
            <p className="text-sm text-[#888] italic">
              No active kids on the roster yet. Add some via the roster
              page first.
            </p>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
