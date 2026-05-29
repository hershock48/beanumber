/**
 * Client-side form for editing the email signature. Posts to the
 * settings API which persists to AppSettings.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function GmailSettingsForm({
  initialSignature,
}: {
  initialSignature: string;
}) {
  const router = useRouter();
  const [signature, setSignature] = useState(initialSignature);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = signature !== initialSignature;

  async function save() {
    if (saving) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings/gmail-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed: ${res.status}`);
      }
      setStatus('Saved.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <textarea
        value={signature}
        onChange={e => {
          setSignature(e.target.value);
          setStatus(null);
          setError(null);
        }}
        rows={6}
        placeholder={'Kevin Hershock\nBe A Number, International\nkevin@beanumber.org'}
        className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-sm leading-relaxed font-mono"
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="bg-[#D4A843] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider px-4 py-2 hover:bg-[#c49a3a] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : dirty ? 'Save signature' : 'Saved'}
        </button>
        {status && <span className="text-sm text-[#888]">{status}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
