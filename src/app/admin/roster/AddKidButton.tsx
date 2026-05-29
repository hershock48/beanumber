/**
 * "+ Add new kid" tile for the roster grid. Same dimensions as a
 * RosterCard so it slots cleanly at the end of the grid. Click
 * opens an inline form (first name + optional notes from the campus).
 *
 * Shirt number is auto-assigned by the server (next available),
 * so neither Kevin nor Simon has to track or pick one. On save,
 * bounces to the new kid's editor page where the photo and the
 * rest of the record gets filled in.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AddKidButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [intake, setIntake] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/roster/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          intakeFromCampus: intake.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed: ${res.status}`);
      const n = data?.shirtNumber;
      if (!n) throw new Error('Server did not return a shirt number.');
      router.push(`/admin/roster/${n}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block bg-white border-2 border-dashed border-[#e8e0d4] hover:border-[#D4A843] transition-colors overflow-hidden text-left"
      >
        <div className="aspect-[4/5] flex items-center justify-center text-[#aaa]">
          <div className="text-center">
            <div className="text-5xl mb-2 opacity-50">+</div>
            <p className="text-xs uppercase tracking-wider">Add new kid</p>
          </div>
        </div>
        <div className="p-3">
          <p
            className="text-base text-[#888] leading-snug"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            New child
          </p>
          <p className="text-xs text-[#aaa] mt-1">
            For when YDO enrolls another kid.
          </p>
        </div>
      </button>
    );
  }

  return (
    <form
      onSubmit={onSave}
      className="block bg-white border-2 border-[#D4A843] overflow-hidden p-3 col-span-2 md:col-span-1"
    >
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
        New kid
      </p>

      <label className="block text-xs text-[#888] mb-1">First name</label>
      <input
        type="text"
        value={firstName}
        onChange={e => setFirstName(e.target.value)}
        placeholder="e.g. Sarah"
        className="w-full mb-3 px-2 py-1.5 text-sm bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843]"
        disabled={busy}
        autoFocus
      />

      <label className="block text-xs text-[#888] mb-1">
        Notes about this child (optional)
      </label>
      <textarea
        value={intake}
        onChange={e => setIntake(e.target.value)}
        placeholder="Anything you can say — family, what they’re like, what they love. You can also add this on the next screen."
        rows={3}
        className="w-full mb-3 px-2 py-1.5 text-sm bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843]"
        disabled={busy}
      />

      <p className="text-xs text-[#aaa] mb-3 leading-relaxed">
        We&apos;ll assign a shirt number automatically. On the next screen you can
        add a photo and more details.
      </p>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !firstName.trim()}
          className="flex-1 bg-[#D4A843] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider py-2 hover:bg-[#c49a3a] transition-colors disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="px-3 text-xs text-[#888] hover:text-[#0d0d0d]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
