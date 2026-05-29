/**
 * Admin · Donor directory.
 *
 * Quick searchable list of every donor in the system, sorted by
 * recency of last activity. Each row links to the full donor profile.
 *
 * This page exists primarily as the entry point until the Today view
 * surfaces donors directly. Once Today is live, this becomes a search
 * fallback ("I want to look at someone specific who isn't on today's
 * list").
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '../_components/AdminShell';
import { getAdminRole } from '@/lib/admin-session';
import { listDonors } from '@/lib/admin/donor';
import { DonorSearchClient } from './DonorSearchClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DonorsDirectoryPage() {
  const role = (await getAdminRole()) || 'admin';
  if (role === 'simon') redirect('/admin/roster');

  const donors = await listDonors();
  return (
    <AdminShell activeTab="home" role={role}>
      <div className="max-w-4xl mx-auto px-5 py-6 md:py-10">
        <Link
          href="/admin"
          className="inline-flex items-center text-sm text-[#888] hover:text-[#0d0d0d] mb-6"
        >
          ← Back to admin
        </Link>
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
            Donor directory
          </p>
          <h1
            className="text-3xl md:text-4xl text-[#0d0d0d] mb-2"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {donors.length} donor{donors.length === 1 ? '' : 's'} on file
          </h1>
          <p className="text-[#666] text-sm">
            Click a row to open their profile. Sorted by most recent activity.
          </p>
        </div>
        <DonorSearchClient donors={donors} />
      </div>
    </AdminShell>
  );
}
