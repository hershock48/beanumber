/**
 * Client editor for the monthly campus update.
 *
 * Two inputs: a big textarea for the body, and a photo upload.
 * Save POSTs to /api/admin/campus-update which creates or updates
 * the current-month Newsletter draft.
 *
 * Same role-aware UX as the roster editor — Simon writes loose,
 * Kevin polishes. Save on this page only stamps the from-Simon
 * flag when role=simon (server-side decision).
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function CampusUpdateEditor({
  initialBody,
  initialPhotoUrl,
  role,
}: {
  initialBody: string;
  initialPhotoUrl: string | null;
  role: 'admin' | 'simon';
}) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialPhotoUrl);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = body !== initialBody || photoFile !== null;

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setStatus(null);
    if (file.size > 3.7 * 1024 * 1024) {
      setError('Photo too large (max 3.7 MB). Compress and try again.');
      e.target.value = '';
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      let photoPayload: {
        filename: string;
        contentType: string;
        data: string;
      } | undefined;
      if (photoFile) {
        const base64 = await fileToBase64(photoFile);
        photoPayload = {
          filename: photoFile.name,
          contentType: photoFile.type || 'image/jpeg',
          data: base64,
        };
      }

      const res = await fetch('/api/admin/campus-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, photo: photoPayload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed: ${res.status}`);
      setStatus('Saved.');
      setPhotoFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
          Photo for the newsletter
        </label>
        <p className="text-xs text-[#888] mb-3 leading-relaxed">
          {role === 'simon'
            ? "A photo from this month that captures something specific — a class moment, a celebration, the campus at work. JPG or PNG, up to 3.7 MB."
            : 'Hero photo at the top of the newsletter email. Same upload Kevin uses from /admin/newsletter.'}
        </p>
        {photoPreview ? (
          <div className="mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoPreview}
              alt=""
              className="max-w-md w-full object-cover bg-[#f5f0e8] border border-[#e8e0d4]"
            />
          </div>
        ) : (
          <p className="text-xs text-[#aaa] italic mb-3">No photo yet.</p>
        )}
        <label className="inline-flex items-center justify-center bg-white border border-[#e8e0d4] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider px-5 py-3 hover:border-[#D4A843] cursor-pointer transition-colors">
          <input
            type="file"
            className="sr-only"
            accept="image/*"
            onChange={onPhotoChange}
            disabled={saving}
          />
          {photoPreview ? 'Replace photo' : 'Upload photo'}
        </label>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
          What happened this month
        </label>
        <p className="text-xs text-[#888] mb-2 leading-relaxed">
          {role === 'simon'
            ? "Write what's been happening at the campus. Classroom moments, milestones, struggles, things sponsors should know. Specific over general — 'Teacher Susan's class learned to write their names this term' is better than 'the kids did great.' Kevin will polish before sending."
            : 'Body of the newsletter. Plain text or simple HTML. Kevin polishes in the full editor.'}
        </p>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={18}
          className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base leading-relaxed font-mono"
          placeholder="Write here. Be specific. Use short paragraphs."
          disabled={saving}
        />
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-[#e8e0d4]">
        <button
          type="submit"
          disabled={saving || !dirty}
          className="bg-[#D4A843] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider px-5 py-3 hover:bg-[#c49a3a] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
        {status && <span className="text-sm text-[#888]">{status}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
