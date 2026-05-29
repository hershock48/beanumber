/**
 * Logout button — clears the admin session cookie and bounces to login.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // ignore — we redirect either way
    }
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={busy}
      className="text-xs uppercase tracking-wider text-[#888] hover:text-[#0d0d0d] transition-colors disabled:opacity-50"
    >
      {busy ? '…' : 'Sign out'}
    </button>
  );
}
