/**
 * Admin · Student of the Month picker.
 *
 * Visual grid of every kid — photo + name. Click a kid to nominate
 * (Simon) or approve (Kevin). Designed to be the easy entry point
 * for the SOTM workflow without having to dive into a kid's editor.
 *
 * Server-rendered shell + a client-side picker that handles the
 * click-to-select interaction.
 */

import { AdminShell } from '../_components/AdminShell';
import { getRoster } from '@/lib/admin/queries';
import { getAdminRole } from '@/lib/admin-session';
import { SOTMPicker } from './SOTMPicker';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function currentMonthLabel(): string {
  const d = new Date();
  return `${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
}

export default async function SOTMPage() {
  const kids = await getRoster();
  const role = (await getAdminRole()) || 'admin';
  const month = currentMonthLabel();

  const published = kids.find(k => !!k.studentOfMonth);
  const pending = kids.find(k => !!k.pendingSOTMMonth);

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
            Pick a kid for {month}
          </h1>
          <p className="text-[#666]">
            {role === 'simon'
              ? "Tap the kid who deserves the award this month. Kevin will approve before it shows up publicly. You can change your pick anytime — only the last one stands."
              : 'Tap a kid to approve them as Student of the Month — the gold badge goes live on their public profile right away. Simon\'s pending pick (if any) is highlighted in red — click "Approve Simon\'s pick" or pick a different kid yourself.'}
          </p>
        </div>

        <SOTMPicker
          kids={kids.map(k => ({
            shirtNumber: k.shirtNumber,
            displayName: k.displayName,
            photoUrl: k.photoUrl,
            studentOfMonth: k.studentOfMonth,
            pendingSOTMMonth: k.pendingSOTMMonth,
          }))}
          role={role}
          month={month}
          publishedShirtNumber={published?.shirtNumber}
          pendingShirtNumber={pending?.shirtNumber}
        />
      </div>
    </AdminShell>
  );
}
