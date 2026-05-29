/**
 * Roster editor form. Client component. Five fields:
 *   - NameMeaning  (one line)
 *   - FamilyContext (one line)
 *   - Loves (one line)
 *   - ChildQuote (one line)
 *   - Notes (multi-paragraph bio)
 *
 * Saves to /api/admin/roster/save which writes the changes to Airtable.
 * Cookie auth carries through.
 */
'use client';

import { useState } from 'react';

interface Fields {
  nameMeaning: string;
  familyContext: string;
  loves: string;
  childQuote: string;
  notes: string;
}

export function RosterEditor({
  shirtNumber,
  firstName,
  initial,
}: {
  shirtNumber: number;
  firstName: string;
  initial: Fields;
}) {
  const [fields, setFields] = useState<Fields>(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    fields.nameMeaning !== initial.nameMeaning ||
    fields.familyContext !== initial.familyContext ||
    fields.loves !== initial.loves ||
    fields.childQuote !== initial.childQuote ||
    fields.notes !== initial.notes;

  function update<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields(prev => ({ ...prev, [key]: value }));
    setStatus(null);
    setError(null);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/roster/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shirtNumber, fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed: ${res.status}`);
      setStatus('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        save();
      }}
      className="space-y-6"
    >
      <Field
        label="Name meaning"
        helper="Cultural meaning of the kid's Acholi/Luo name. Renders as a small italic line right under their name on /[number]. E.g. 'Lagum is a Luo name meaning blessing or favor.'"
      >
        <input
          type="text"
          value={fields.nameMeaning}
          onChange={e => update('nameMeaning', e.target.value)}
          className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base"
          placeholder="e.g. Lagum is a Luo name meaning blessing or favor."
        />
      </Field>

      <Field
        label="Family"
        helper="One specific sentence about who they live with and what the family does for a living. Avoid 'peasant farmer.'"
      >
        <input
          type="text"
          value={fields.familyContext}
          onChange={e => update('familyContext', e.target.value)}
          className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base"
          placeholder="e.g. Lives at home with both her parents, who farm."
        />
      </Field>

      <Field
        label={`About ${firstName || 'this kid'}`}
        helper="One specific thing they're into. Concrete, vivid. Not 'playing' — 'plays goalkeeper at break and argues with anyone who scores on her.'"
      >
        <input
          type="text"
          value={fields.loves}
          onChange={e => update('loves', e.target.value)}
          className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base"
          placeholder="e.g. Soccer at break, and storytelling in class."
        />
      </Field>

      <Field
        label="Their quote"
        helper="Their own words. 5–15 words. Renders as the big italic pull-quote at the top of the page."
      >
        <input
          type="text"
          value={fields.childQuote}
          onChange={e => update('childQuote', e.target.value)}
          className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base"
          placeholder="e.g. I want to become a doctor and treat Mama."
        />
      </Field>

      <Field
        label="More about them (bio)"
        helper="The longer paragraph(s) that render under the structured fields. Texture the page doesn't already cover: walk to school, classroom moments, family story, what their day looks like."
      >
        <textarea
          value={fields.notes}
          onChange={e => update('notes', e.target.value)}
          rows={12}
          className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base leading-relaxed font-mono"
          placeholder="Two or three short paragraphs. Specific over vague."
        />
      </Field>

      <div className="flex items-center gap-3 pt-2 border-t border-[#e8e0d4]">
        <button
          type="submit"
          disabled={saving || !dirty}
          className="bg-[#D4A843] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider px-5 py-3 hover:bg-[#c49a3a] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
        </button>
        {status && <span className="text-sm text-[#888]">{status}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
        {label}
      </label>
      {helper && (
        <p className="text-xs text-[#888] mb-2 leading-relaxed">{helper}</p>
      )}
      {children}
    </div>
  );
}
