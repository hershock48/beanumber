/**
 * Shared admin shell — header with logo (links to /admin home), tab
 * nav across all admin surfaces, and a sign-out button.
 *
 * Every admin sub-page wraps its content in <AdminShell>. The shell
 * gives Kevin a consistent way to navigate between admin surfaces
 * without leaving the admin context — the logo no longer dumps him
 * back to the public site, and every page knows about every other
 * admin page.
 *
 * Pass `activeTab` to highlight which page is currently selected.
 */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';

export type AdminTab =
  | 'home'
  | 'newsletter'
  | 'roster'
  | 'review'
  | 'campus-update'
  | 'sotm'
  | 'messages'
  // Legacy tabs — kept in the type so existing pages compile, but no
  // longer rendered in the nav. Pages still exist on direct URLs.
  | 'updates'
  | 'fulfillment'
  | 'sponsors'
  | 'retention';

const ALL_TABS: Array<{ id: AdminTab; label: string; href: string; visibleTo: Array<'admin' | 'simon'> }> = [
  { id: 'newsletter', label: 'Newsletter', href: '/admin/newsletter', visibleTo: ['admin'] },
  { id: 'roster', label: 'Roster', href: '/admin/roster', visibleTo: ['admin', 'simon'] },
  { id: 'review', label: 'Review queue', href: '/admin/review', visibleTo: ['admin'] },
  { id: 'sotm', label: 'Student of the month', href: '/admin/sotm', visibleTo: ['admin', 'simon'] },
  { id: 'messages', label: 'Penpal', href: '/admin/messages', visibleTo: ['admin', 'simon'] },
  { id: 'campus-update', label: 'Monthly update', href: '/admin/campus-update', visibleTo: ['simon'] },
  { id: 'fulfillment', label: 'Fulfillment', href: '/admin/fulfillment', visibleTo: ['admin'] },
];

export function AdminShell({
  activeTab,
  role = 'admin',
  children,
}: {
  activeTab: AdminTab;
  role?: 'admin' | 'simon';
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const tabs = ALL_TABS.filter(t => t.visibleTo.includes(role));

  // Pending sponsor notes count for the red-dot indicator on the
  // "Penpal" tab. Fetched on mount + on window focus so that
  // when Kevin tabs back to the admin console from his inbox, the
  // count reflects reality. No aggressive polling — Kevin is one
  // user; this is the pragmatic amount of freshness.
  const [pendingNotes, setPendingNotes] = useState<number | null>(null);
  const refetchPendingNotes = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/messages/pending-count', {
        cache: 'no-store',
      });
      if (!r.ok) return;
      const j = (await r.json()) as { count?: number };
      if (typeof j.count === 'number') setPendingNotes(j.count);
    } catch {
      // Silent — the badge is decorative, DB blips shouldn't nag.
    }
  }, []);
  useEffect(() => {
    refetchPendingNotes();
    const onVis = () => {
      if (document.visibilityState === 'visible') refetchPendingNotes();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', refetchPendingNotes);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', refetchPendingNotes);
    };
  }, [refetchPendingNotes]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // ignore — we redirect either way
    }
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <header className="bg-white border-b border-[#e8e0d4] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
          {/* Logo → admin home (or roster for Simon) */}
          <Link href={role === 'simon' ? '/admin/roster' : '/admin'} className="flex items-center gap-3 shrink-0">
            <Logo />
            <span className="hidden sm:inline text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843]">
              {role === 'simon' ? 'Campus intake' : 'Admin'}
            </span>
          </Link>

          {/* Tab nav — horizontally scrollable on small screens */}
          <nav className="flex-1 overflow-x-auto">
            <ul className="flex items-center gap-1 md:gap-2 justify-end md:justify-center">
              {tabs.map(tab => {
                // Red dot on the "Penpal" tab when there are
                // pending or translated outbound notes waiting on
                // admin action. Positioned as an inline sup pill so
                // the tab layout doesn't jitter when the count flips.
                const showDot =
                  tab.id === 'messages' &&
                  pendingNotes != null &&
                  pendingNotes > 0;
                return (
                  <li key={tab.id}>
                    <Link
                      href={tab.href}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-wider whitespace-nowrap transition-colors ${
                        activeTab === tab.id
                          ? 'text-[#0d0d0d] font-bold border-b-2 border-[#D4A843]'
                          : 'text-[#888] hover:text-[#0d0d0d]'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {showDot && (
                        <span
                          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#c0392b] text-white text-[10px] font-bold"
                          aria-label={`${pendingNotes} note${
                            pendingNotes === 1 ? '' : 's'
                          } waiting`}
                        >
                          {pendingNotes}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Sign-out */}
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="text-xs uppercase tracking-wider text-[#888] hover:text-[#0d0d0d] transition-colors disabled:opacity-50 shrink-0"
          >
            {signingOut ? '…' : 'Sign out'}
          </button>
        </div>
      </header>

      {children}
    </div>
  );
}
