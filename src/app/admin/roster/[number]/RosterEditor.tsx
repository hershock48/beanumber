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

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { RosterKidAttachment } from '@/lib/admin/queries';

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
  reportCards,
  letters,
}: {
  shirtNumber: number;
  firstName: string;
  initial: Fields;
  reportCards: RosterKidAttachment[];
  letters: RosterKidAttachment[];
}) {
  const router = useRouter();
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

      <div className="pt-8 border-t border-[#e8e0d4] space-y-8">
        <UploadSection
          label="Report cards"
          helper={`Upload year-end report cards from the campus. PDF, JPG, or PNG. ${firstName}'s sponsors get an email the moment you upload, and the file shows up on their page.`}
          kind="report_card"
          shirtNumber={shirtNumber}
          existing={reportCards}
          onUploaded={() => router.refresh()}
        />

        <UploadSection
          label="Letters from the kid"
          helper={`Upload handwritten letters from ${firstName}. PDF, JPG, or PNG of the scan/photo. Sponsors get an email the moment you upload, and the file shows up on their page.`}
          kind="letter"
          shirtNumber={shirtNumber}
          existing={letters}
          onUploaded={() => router.refresh()}
        />
      </div>
    </form>
  );
}

// ─── Upload section ──────────────────────────────────────────────

function UploadSection({
  label,
  helper,
  kind,
  shirtNumber,
  existing,
  onUploaded,
}: {
  label: string;
  helper: string;
  kind: 'report_card' | 'letter';
  shirtNumber: number;
  existing: RosterKidAttachment[];
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setStatus(null);

    // 3.7 MB cap matches the upload endpoint's base64 limit. Files
    // larger than this would inflate past Airtable's 5 MB request
    // body limit once base64-encoded.
    if (file.size > 3.7 * 1024 * 1024) {
      setError('File too large (max 3.7 MB). Compress it and try again.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/admin/roster/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shirtNumber,
          kind,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          data: base64,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Upload failed: ${res.status}`);
      const notice = data.notify?.skipped
        ? 'Uploaded.'
        : `Uploaded. Notified ${data.notify?.sent || 0} sponsor${data.notify?.sent === 1 ? '' : 's'}.`;
      setStatus(notice);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
        {label}
      </p>
      <p className="text-xs text-[#888] mb-3 leading-relaxed">{helper}</p>

      {/* Existing files */}
      {existing.length > 0 ? (
        <ul className="space-y-2 mb-3">
          {existing.map(att => (
            <li
              key={att.id}
              className="flex items-center justify-between bg-white border border-[#e8e0d4] px-3 py-2 text-sm"
            >
              <a
                href={att.url}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-3 truncate text-[#0d0d0d] hover:text-[#D4A843]"
              >
                {att.thumbnailUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={att.thumbnailUrl}
                    alt=""
                    className="w-10 h-10 object-cover bg-[#f5f0e8] flex-shrink-0"
                  />
                ) : (
                  <span className="w-10 h-10 flex items-center justify-center bg-[#f5f0e8] text-xs text-[#888] flex-shrink-0">
                    PDF
                  </span>
                )}
                <span className="truncate">{att.filename}</span>
              </a>
              {typeof att.size === 'number' && (
                <span className="text-xs text-[#aaa] tabular-nums ml-3 flex-shrink-0">
                  {(att.size / 1024).toFixed(0)} KB
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[#aaa] italic mb-3">None yet.</p>
      )}

      {/* Upload button */}
      <label className="inline-flex items-center justify-center bg-white border border-[#e8e0d4] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider px-5 py-3 hover:border-[#D4A843] cursor-pointer transition-colors">
        <input
          type="file"
          className="sr-only"
          accept="image/*,application/pdf"
          onChange={onFile}
          disabled={uploading}
        />
        {uploading ? 'Uploading…' : 'Upload new'}
      </label>

      {status && <p className="mt-2 text-sm text-[#888]">{status}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:<mime>;base64," prefix.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
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
