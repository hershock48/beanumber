/**
 * Roster editor form. Client component. Shared between Kevin (admin)
 * and Simon (campus). Both roles see and can edit the same fields —
 * photo, name meaning, family, loves, child quote, bio, intake notes
 * — plus the report-card and letter upload sections at the bottom.
 *
 * The only thing the role gates: when Simon saves anything, the
 * server stamps LastEditedBySimon=now on the record. That drives the
 * red review dot on Kevin's roster grid, and shows him a banner at
 * the top of this editor with a "Mark as reviewed" button. Kevin's
 * normal saves never trigger the flag.
 *
 * Saves write to Airtable via /api/admin/roster/save. Cookie auth
 * carries through.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { RosterKidAttachment } from '@/lib/admin/queries';
import { compressImageIfNeeded } from '@/lib/client/compress-image';
import { ReassignBlock } from './ReassignBlock';

interface Fields {
  nameMeaning: string;
  familyContext: string;
  loves: string;
  childQuote: string;
  notes: string;
  intakeFromCampus: string;
  studentOfMonth: string;
  homeVillage: string;
  teacherName: string;
  teacherQuote: string;
}

export function RosterEditor({
  shirtNumber,
  firstName,
  role,
  initial,
  reportCards,
  letters,
  photos,
  lastEditedBySimon,
  pendingFields,
  deletionRequestedAt,
  studentOfMonthReason,
  departedAt,
  departureNote,
  departureRequestedAt,
  departureRequestedNote,
}: {
  shirtNumber: number;
  firstName: string;
  role: 'admin' | 'simon';
  initial: Fields;
  reportCards: RosterKidAttachment[];
  letters: RosterKidAttachment[];
  /** Every ProfilePhoto attached to this kid, oldest first. Rendered
   *  as a thumbnail grid with per-photo delete buttons. */
  photos: RosterKidAttachment[];
  /** ISO timestamp; null means no pending edits from Simon. */
  lastEditedBySimon: string | null;
  /** Subset of NameMeaning | FamilyContext | Loves | ChildQuote | Notes
   *  that Simon has touched and Kevin hasn't reviewed. Drives the red
   *  field borders shown only to admin. */
  pendingFields: string[];
  /** ISO timestamp set when someone requested this kid be deleted.
   *  Null = no pending request. */
  deletionRequestedAt: string | null;
  /** Citation text shown alongside the SOTM badge in the inline
   *  card. Empty when no award is active. */
  studentOfMonthReason: string;
  /** Departure state. departedAt set = official; requestedAt set =
   *  Simon's nomination pending Kevin's review. */
  departedAt: string | null;
  departureNote: string;
  departureRequestedAt: string | null;
  departureRequestedNote: string;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearingReview, setClearingReview] = useState(false);

  const dirty =
    fields.nameMeaning !== initial.nameMeaning ||
    fields.familyContext !== initial.familyContext ||
    fields.loves !== initial.loves ||
    fields.childQuote !== initial.childQuote ||
    fields.notes !== initial.notes ||
    fields.intakeFromCampus !== initial.intakeFromCampus ||
    fields.studentOfMonth !== initial.studentOfMonth ||
    fields.homeVillage !== initial.homeVillage ||
    fields.teacherName !== initial.teacherName ||
    fields.teacherQuote !== initial.teacherQuote;

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
      // Different status message by role so Simon understands his
      // structured-field edits aren&rsquo;t live yet &mdash; they&rsquo;re queued for
      // Kevin&rsquo;s review. Without this, Simon would think his changes
      // went out to sponsors immediately.
      setStatus(role === 'simon'
        ? 'Saved. Your edits are queued for Kevin to review.'
        : 'Saved.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function markReviewed() {
    if (clearingReview) return;
    setClearingReview(true);
    try {
      const res = await fetch('/api/admin/roster/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shirtNumber, fields: {}, clearSimonFlag: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Failed: ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear review flag.');
    } finally {
      setClearingReview(false);
    }
  }

  const simonEditedAt = lastEditedBySimon ? new Date(lastEditedBySimon) : null;
  const simonEditedAtLabel = simonEditedAt
    ? simonEditedAt.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        save();
      }}
      className="space-y-6"
    >
      {/* Review banner — admin only. Shows when Simon edited fields
          here since the last review. Lists the specific fields that
          need attention so Kevin knows where to look. */}
      {role === 'admin' && lastEditedBySimon && (
        <div className="border-2 border-red-300 bg-red-50/50 p-5 rounded-sm">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">
                Edits from Simon
              </p>
              <p className="text-sm text-[#444] mt-1">
                Simon updated this kid on {simonEditedAtLabel}.{' '}
                {pendingFields.length > 0 ? (
                  <>
                    Unpublished fields:{' '}
                    <span className="font-semibold">
                      {pendingFields
                        .map(f =>
                          ({
                            NameMeaning: 'Name meaning',
                            FamilyContext: 'Family',
                            Loves: 'About them',
                            ChildQuote: 'Their quote',
                            Notes: 'Bio',
                          })[f] || f
                        )
                        .join(', ')}
                    </span>
                    . Polish copy into your voice — saving a field
                    automatically publishes it. Or hit "Mark all
                    reviewed" if his copy is already good.
                  </>
                ) : (
                  'Review the fields below — polish copy into your voice, then mark reviewed.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={markReviewed}
              disabled={clearingReview}
              className="flex-shrink-0 bg-white border border-red-300 text-red-700 hover:bg-red-100 text-xs font-bold uppercase tracking-wider px-3 py-2 transition-colors disabled:opacity-50"
            >
              {clearingReview ? 'Clearing…' : 'Mark all reviewed'}
            </button>
          </div>
        </div>
      )}

      {/* Intake banner — separate from the review flag. Shows raw
          campus notes that don't fit a structured field. Same "Mark
          as polished" button (admin only) since the simplest way to
          clear it is to wipe the text. */}
      {role === 'admin' && initial.intakeFromCampus && (
        <div className="border-2 border-amber-300 bg-amber-50/50 p-5 rounded-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-800">
              Raw notes from the campus
            </p>
            <button
              type="button"
              onClick={() => update('intakeFromCampus', '')}
              className="text-xs text-amber-800 hover:text-amber-900 underline"
              title="Clear the intake once you've incorporated it into the polished fields below"
            >
              Mark as polished
            </button>
          </div>
          <div className="text-[#444] leading-relaxed whitespace-pre-wrap text-sm">
            {fields.intakeFromCampus}
          </div>
        </div>
      )}

      {/* Photo — appears first so it anchors the editor. Both roles
          can replace it; uploads are immediate and don't go through
          the form save. */}
      <PhotoUploadSection
        shirtNumber={shirtNumber}
        firstName={firstName}
        photos={photos}
        onUploaded={() => router.refresh()}
      />

      {/* Student of the month — one-click award for the current
          month. Saves with the rest of the form, but the toggle is
          visually distinct so it doesn't get lost. */}
      <StudentOfMonthControl
        value={initial.studentOfMonth}
        firstName={firstName}
        reason={studentOfMonthReason}
      />

      <Field
        label="Name meaning"
        helper="Cultural meaning of the kid's Acholi/Luo name. Renders as a small italic line right under their name on /[number]. E.g. 'Lagum is a Luo name meaning blessing or favor.'"
        pending={role === 'admin' && pendingFields.includes('NameMeaning')}
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
        pending={role === 'admin' && pendingFields.includes('FamilyContext')}
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
        pending={role === 'admin' && pendingFields.includes('Loves')}
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
        pending={role === 'admin' && pendingFields.includes('ChildQuote')}
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
        label="Home village"
        helper="Where they live. Short — village or area name."
        pending={role === 'admin' && pendingFields.includes('HomeVillage')}
      >
        <input
          type="text"
          value={fields.homeVillage}
          onChange={e => update('homeVillage', e.target.value)}
          className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base"
          placeholder="e.g. Lakwana"
        />
      </Field>

      <Field
        label="Teacher's name"
        helper="The teacher whose classroom they sit in this term."
        pending={role === 'admin' && pendingFields.includes('TeacherName')}
      >
        <input
          type="text"
          value={fields.teacherName}
          onChange={e => update('teacherName', e.target.value)}
          className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base"
          placeholder="e.g. Teacher Susan"
        />
      </Field>

      <Field
        label="Teacher's quote about them"
        helper="One sentence the teacher wrote. Renders as a quote block on the page."
        pending={role === 'admin' && pendingFields.includes('TeacherQuote')}
      >
        <textarea
          value={fields.teacherQuote}
          onChange={e => update('teacherQuote', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base leading-relaxed"
          placeholder="e.g. Marvin is the kid the others go to when they're stuck."
        />
      </Field>

      <Field
        label="More about them (bio)"
        helper="The longer paragraph(s) that render under the structured fields. Texture the page doesn't already cover: walk to school, classroom moments, family story, what their day looks like."
        pending={role === 'admin' && pendingFields.includes('Notes')}
      >
        <textarea
          value={fields.notes}
          onChange={e => update('notes', e.target.value)}
          rows={12}
          className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base leading-relaxed font-mono"
          placeholder="Two or three short paragraphs. Specific over vague."
        />
      </Field>

      <Field
        label="Extra notes from the campus"
        helper={
          role === 'simon'
            ? `Anything you want Kevin to know that doesn't fit the fields above. Family context, recent struggles, things you want to flag.`
            : `Free-form notes Simon or the YDO team have added. Not public — Kevin polishes the content above; this is loose context that informs the polish.`
        }
      >
        <textarea
          value={fields.intakeFromCampus}
          onChange={e => update('intakeFromCampus', e.target.value)}
          rows={6}
          className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-base leading-relaxed"
          placeholder={
            role === 'simon'
              ? 'Anything you can tell Kevin.'
              : 'Loose context from the campus.'
          }
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

      {/* Departure (kid left the campus) — Simon nominates, Kevin
          approves. Reversible. The kid stays in Airtable. */}
      <DepartureSection
        shirtNumber={shirtNumber}
        firstName={firstName}
        role={role}
        departedAt={departedAt}
        departureNote={departureNote}
        departureRequestedAt={departureRequestedAt}
        departureRequestedNote={departureRequestedNote}
      />

      {/* Delete control — bottom of form. Two-step flow: Simon
          requests, Kevin approves. Admin can also delete directly. */}
      <DeleteSection
        shirtNumber={shirtNumber}
        firstName={firstName}
        role={role}
        deletionRequestedAt={deletionRequestedAt}
      />

      <div className="pt-8 border-t border-[#e8e0d4] space-y-8">
        <UploadSection
          label="Report cards"
          helper={`Upload report cards from the campus each term. PDF, JPG, or PNG. ${firstName}'s sponsors get an email the moment you upload, and the file shows up on their page.`}
          kind="report_card"
          shirtNumber={shirtNumber}
          existing={reportCards}
          deadline={nextReportCardDeadline()}
          onUploaded={() => router.refresh()}
        />

        <UploadSection
          label="Letters from the kid"
          helper={`Upload handwritten letters from ${firstName}. PDF, JPG, or PNG of the scan/photo. Sponsors get an email the moment you upload, and the file shows up on their page.`}
          kind="letter"
          shirtNumber={shirtNumber}
          existing={letters}
          deadline={nextLetterDeadline()}
          onUploaded={() => router.refresh()}
        />
      </div>
    </form>
  );
}

// ─── Photo upload (multi-attachment, 5-photo gallery) ────────────

const MAX_PHOTOS = 5;

function PhotoUploadSection({
  shirtNumber,
  firstName,
  photos,
  onUploaded,
}: {
  shirtNumber: number;
  firstName: string;
  photos: RosterKidAttachment[];
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const atCapacity = photos.length >= MAX_PHOTOS;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;
    setError(null);
    setStatus(null);
    if (atCapacity) {
      setError(
        `${firstName} already has ${MAX_PHOTOS} photos. Remove one before adding another.`
      );
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const file = await compressImageIfNeeded(rawFile);
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/admin/roster/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shirtNumber,
          kind: 'photo',
          filename: file.name,
          contentType: file.type || 'image/jpeg',
          data: base64,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Upload failed: ${res.status}`);
      setStatus('Photo added.');
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function deletePhoto(attachmentId: string) {
    if (deletingId) return;
    if (!confirm('Remove this photo?')) return;
    setDeletingId(attachmentId);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/roster/photo-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shirtNumber, attachmentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Delete failed: ${res.status}`);
      setStatus('Photo removed.');
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
        Photos
      </p>
      <p className="text-xs text-[#888] mb-3 leading-relaxed">
        Up to {MAX_PHOTOS} photos of {firstName || 'this kid'}. JPG or PNG,
        any size — big phone photos get shrunk in your browser before
        upload. Sponsors see them as a carousel on the public profile.
      </p>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
          {photos.map(p => (
            <div key={p.id} className="relative bg-[#f5f0e8] border border-[#e8e0d4] aspect-[4/5]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.thumbnailUrl || p.url}
                alt=""
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => deletePhoto(p.id)}
                disabled={!!deletingId || uploading}
                className="absolute top-1 right-1 inline-flex items-center justify-center w-6 h-6 bg-white/95 text-red-700 hover:bg-red-50 border border-red-200 text-sm leading-none disabled:opacity-50"
                title="Remove this photo"
              >
                {deletingId === p.id ? '…' : '×'}
              </button>
            </div>
          ))}
        </div>
      )}

      <label
        className={`inline-flex items-center justify-center font-bold text-xs uppercase tracking-wider px-5 py-3 transition-colors ${
          atCapacity
            ? 'bg-[#f5f0e8] border border-[#e8e0d4] text-[#aaa] cursor-not-allowed'
            : 'bg-white border border-[#e8e0d4] text-[#0d0d0d] hover:border-[#D4A843] cursor-pointer'
        }`}
      >
        <input
          type="file"
          className="sr-only"
          accept="image/*"
          onChange={onFile}
          disabled={uploading || atCapacity}
        />
        {uploading
          ? 'Uploading…'
          : atCapacity
            ? `Max ${MAX_PHOTOS} reached — remove one to add another`
            : photos.length === 0
              ? 'Upload first photo'
              : 'Add another photo'}
      </label>
      <p className="text-xs text-[#aaa] mt-1">
        {photos.length} of {MAX_PHOTOS} photos
      </p>
      {status && <p className="mt-2 text-sm text-[#888]">{status}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ─── Deadline helpers ────────────────────────────────────────────

/** Next quarter-end (Mar 31, Jun 30, Sep 30, Dec 31) on/after today. */
function nextReportCardDeadline(): Date {
  const today = new Date();
  const y = today.getFullYear();
  const quarterEnds = [
    new Date(y, 2, 31),  // Mar 31
    new Date(y, 5, 30),  // Jun 30
    new Date(y, 8, 30),  // Sep 30
    new Date(y, 11, 31), // Dec 31
  ];
  for (const d of quarterEnds) {
    if (d.getTime() >= today.setHours(0, 0, 0, 0)) return d;
  }
  // Past Dec 31 — wrap to Mar 31 next year.
  return new Date(y + 1, 2, 31);
}

/** Next Dec 1 (this year or next). */
function nextLetterDeadline(): Date {
  const today = new Date();
  const y = today.getFullYear();
  const dec1 = new Date(y, 11, 1);
  if (dec1.getTime() >= today.setHours(0, 0, 0, 0)) return dec1;
  return new Date(y + 1, 11, 1);
}

function DeadlineBadge({ deadline }: { deadline: Date }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(deadline);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const dateLabel = deadline.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: due.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });

  let tone: 'gray' | 'amber' | 'red';
  let copy: string;
  if (days < 0) {
    tone = 'red';
    copy = `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} (was due ${dateLabel})`;
  } else if (days === 0) {
    tone = 'red';
    copy = `Due today (${dateLabel})`;
  } else if (days <= 7) {
    tone = 'red';
    copy = `Due in ${days} day${days === 1 ? '' : 's'} (${dateLabel})`;
  } else if (days <= 30) {
    tone = 'amber';
    copy = `Due in ${days} days (${dateLabel})`;
  } else {
    tone = 'gray';
    copy = `Next due ${dateLabel} · ${days} days out`;
  }

  const cls =
    tone === 'red'
      ? 'bg-red-50 border-red-200 text-red-700'
      : tone === 'amber'
        ? 'bg-amber-50 border-amber-200 text-amber-800'
        : 'bg-[#f5f0e8] border-[#e8e0d4] text-[#666]';

  return (
    <p className={`inline-block text-xs font-semibold uppercase tracking-wider px-2 py-1 border ${cls} mb-3`}>
      {copy}
    </p>
  );
}

// ─── Upload section (report cards / letters) ────────────────────

function UploadSection({
  label,
  helper,
  kind,
  shirtNumber,
  existing,
  deadline,
  onUploaded,
}: {
  label: string;
  helper: string;
  kind: 'report_card' | 'letter';
  shirtNumber: number;
  existing: RosterKidAttachment[];
  deadline?: Date;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;
    setError(null);
    setStatus(null);

    setUploading(true);
    try {
      // Auto-compress photos. PDFs (report cards) pass through
      // untouched — compressImageIfNeeded is a no-op for non-images.
      const file = await compressImageIfNeeded(rawFile);
      // Server still enforces a hard cap; this surfaces the error
      // nicely if a non-image PDF is somehow over 3.7 MB.
      if (file.size > 3.7 * 1024 * 1024) {
        throw new Error(
          `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Try a different file.`
        );
      }
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

      {deadline && <DeadlineBadge deadline={deadline} />}

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

// ─── Departure (request + approve flow, reversible) ─────────────

function DepartureSection({
  shirtNumber,
  firstName,
  role,
  departedAt,
  departureNote,
  departureRequestedAt,
  departureRequestedNote,
}: {
  shirtNumber: number;
  firstName: string;
  role: 'admin' | 'simon';
  departedAt: string | null;
  departureNote: string;
  departureRequestedAt: string | null;
  departureRequestedNote: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [noteInput, setNoteInput] = useState('');

  async function call(
    action: 'request' | 'approve' | 'reject' | 'restore',
    note?: string
  ) {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch('/api/admin/roster/depart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shirtNumber,
          action,
          note: note ?? noteInput,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed: ${res.status}`);
      setFormOpen(false);
      setNoteInput('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(null);
    }
  }

  const requestedLabel = departureRequestedAt
    ? new Date(departureRequestedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;
  const departedLabel = departedAt
    ? new Date(departedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  // 1) Already departed — show the official state + reassign block
  //    (admin only) + restore option.
  if (departedAt) {
    return (
      <div>
        <div className="border-2 border-[#888] bg-[#f5f0e8] p-5 rounded-sm">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#666] mb-1">
            Departed · {departedLabel}
          </p>
          {departureNote && (
            <p className="text-sm text-[#444] mb-3 leading-relaxed whitespace-pre-wrap">
              {departureNote}
            </p>
          )}
          <p className="text-xs text-[#888] mb-3">
            {firstName}&apos;s record is preserved. Public profile shows a
            respectful &ldquo;no longer here&rdquo; message until you reassign
            the slot to another kid (if there are sponsors).
          </p>
          {role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    `Restore ${firstName}? They'll show as active on the roster again.`
                  )
                ) {
                  call('restore');
                }
              }}
              disabled={!!busy}
              className="text-xs text-[#888] hover:text-[#0d0d0d] underline disabled:opacity-50"
            >
              {busy === 'restore' ? 'Restoring…' : 'Restore (mark as active)'}
            </button>
          )}
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>

        {role === 'admin' && (
          <ReassignBlock shirtNumber={shirtNumber} firstName={firstName} />
        )}
      </div>
    );
  }

  // 2) Pending request — admin sees approve/reject; Simon sees status.
  if (departureRequestedAt) {
    if (role === 'admin') {
      return (
        <div className="border-2 border-red-300 bg-red-50/50 p-5 rounded-sm">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700 mb-1">
            Departure request · {requestedLabel}
          </p>
          {departureRequestedNote ? (
            <div className="bg-white border border-red-200 p-3 mb-3 text-sm text-[#444] whitespace-pre-wrap leading-relaxed">
              {departureRequestedNote}
            </div>
          ) : (
            <p className="text-sm text-[#666] italic mb-3">
              No reason provided by the requester.
            </p>
          )}
          <p className="text-xs text-[#666] mb-3">
            Approve to mark {firstName} as departed publicly. You can
            adjust the note before publishing.
          </p>
          {formOpen ? (
            <div className="space-y-2">
              <label className="block">
                <span className="block text-[10px] uppercase tracking-wider text-[#888] mb-1">
                  Public departure note (optional — uses the request
                  note if blank)
                </span>
                <textarea
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  rows={3}
                  placeholder={departureRequestedNote || 'Why this kid is no longer at the campus. Shown on the public profile.'}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843]"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => call('approve')}
                  disabled={!!busy}
                  className="bg-red-600 text-white hover:bg-red-700 font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors disabled:opacity-50"
                >
                  {busy === 'approve' ? 'Publishing…' : 'Approve & mark departed'}
                </button>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={!!busy}
                  className="text-xs text-[#888] hover:text-[#0d0d0d] underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                disabled={!!busy}
                className="bg-red-600 text-white hover:bg-red-700 font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors disabled:opacity-50"
              >
                Approve…
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      `Reject the departure request? ${firstName} stays on the active roster.`
                    )
                  ) {
                    call('reject');
                  }
                }}
                disabled={!!busy}
                className="bg-white border border-[#888] text-[#0d0d0d] hover:bg-[#f5f0e8] font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors disabled:opacity-50"
              >
                {busy === 'reject' ? 'Rejecting…' : 'Reject (keep active)'}
              </button>
            </div>
          )}
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
      );
    }
    // Simon's view of his own pending request.
    return (
      <div className="pt-6 mt-2 border-t border-[#e8e0d4]">
        <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
          Departure pending
        </p>
        <p className="text-sm text-[#666]">
          You&apos;ve flagged {firstName} as no longer at the campus.
          Kevin will review and approve.
        </p>
      </div>
    );
  }

  // 3) Active kid — show the action to flag departure.
  return (
    <div className="pt-6 mt-2 border-t border-[#e8e0d4]">
      <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
        Has this kid left the campus?
      </p>
      {formOpen ? (
        <div className="space-y-2">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-[#888] mb-1">
              {role === 'simon'
                ? `Tell Kevin what happened`
                : 'Note for the public profile (optional)'}
            </span>
            <textarea
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              rows={3}
              placeholder="When they left, why, what the family said. Keep it dignified."
              className="w-full px-3 py-2 text-sm bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843]"
            />
          </label>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => call(role === 'simon' ? 'request' : 'approve')}
              disabled={!!busy}
              className="bg-[#888] text-white hover:bg-[#666] font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors disabled:opacity-50"
            >
              {busy
                ? 'Sending…'
                : role === 'simon'
                  ? `Send to Kevin`
                  : `Mark ${firstName} as departed`}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setNoteInput('');
              }}
              disabled={!!busy}
              className="text-xs text-[#888] hover:text-[#0d0d0d] underline"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      ) : (
        <>
          <p className="text-xs text-[#888] mb-3 leading-relaxed">
            {role === 'simon'
              ? `If ${firstName} has left Hope Bridge — transferred, family moved, withdrew — tell Kevin so he can update the records and notify the sponsor.`
              : `Mark ${firstName} as departed. The record stays for sponsor history; the public profile reframes. Reversible.`}
          </p>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="bg-white border border-[#888] text-[#0d0d0d] hover:bg-[#f5f0e8] font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors"
          >
            {firstName} has left the campus
          </button>
        </>
      )}
    </div>
  );
}

// ─── Delete (request + approve flow) ─────────────────────────────

function DeleteSection({
  shirtNumber,
  firstName,
  role,
  deletionRequestedAt,
}: {
  shirtNumber: number;
  firstName: string;
  role: 'admin' | 'simon';
  deletionRequestedAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: 'request' | 'delete' | 'reject') {
    if (busy) return;
    const verb =
      action === 'delete'
        ? `Delete ${firstName} permanently? This can't be undone.`
        : action === 'reject'
          ? `Reject the deletion request? ${firstName} stays on the roster.`
          : `Request that Kevin delete ${firstName}? He'll review and approve.`;
    if (!confirm(verb)) return;

    setBusy(action);
    setError(null);
    try {
      const res = await fetch('/api/admin/roster/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shirtNumber, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed: ${res.status}`);
      if (action === 'delete') {
        // Hard delete — kid is gone, go back to the roster.
        router.push('/admin/roster');
        router.refresh();
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(null);
    }
  }

  const requestedLabel = deletionRequestedAt
    ? new Date(deletionRequestedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  // Admin sees the approve/reject banner when there's a pending request,
  // otherwise a direct delete button.
  if (role === 'admin') {
    if (deletionRequestedAt) {
      return (
        <div className="border-2 border-red-300 bg-red-50/50 p-5 rounded-sm">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700 mb-1">
            Deletion request
          </p>
          <p className="text-sm text-[#444] mb-3">
            Someone requested {firstName} be removed from the roster on{' '}
            {requestedLabel}. Approve only if this is a test entry or a
            duplicate. Sponsorships and shirt assignments will block
            the delete — those have to be cleared first.
          </p>
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => call('delete')}
              disabled={!!busy}
              className="bg-red-600 text-white hover:bg-red-700 font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors disabled:opacity-50"
            >
              {busy === 'delete' ? 'Deleting…' : `Approve & delete ${firstName}`}
            </button>
            <button
              type="button"
              onClick={() => call('reject')}
              disabled={!!busy}
              className="bg-white border border-[#888] text-[#0d0d0d] hover:bg-[#f5f0e8] font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors disabled:opacity-50"
            >
              {busy === 'reject' ? 'Rejecting…' : 'Reject (keep)'}
            </button>
          </div>
        </div>
      );
    }
    // No pending request — direct delete option.
    return (
      <div className="pt-6 mt-2 border-t border-[#e8e0d4]">
        <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
          Danger zone
        </p>
        <p className="text-xs text-[#888] mb-3 leading-relaxed">
          Permanently removes {firstName} from the roster. Blocked if
          they have any active sponsorships or shirt assignment.
        </p>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <button
          type="button"
          onClick={() => call('delete')}
          disabled={!!busy}
          className="bg-white border border-red-300 text-red-700 hover:bg-red-50 font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors disabled:opacity-50"
        >
          {busy === 'delete' ? 'Deleting…' : `Delete ${firstName}`}
        </button>
      </div>
    );
  }

  // Simon's view
  if (deletionRequestedAt) {
    return (
      <div className="pt-6 mt-2 border-t border-[#e8e0d4]">
        <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
          Deletion
        </p>
        <p className="text-sm text-[#666]">
          You&apos;ve requested {firstName} be removed. Kevin will review
          and approve. No action needed from you.
        </p>
      </div>
    );
  }
  return (
    <div className="pt-6 mt-2 border-t border-[#e8e0d4]">
      <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
        Wrong kid?
      </p>
      <p className="text-xs text-[#888] mb-3 leading-relaxed">
        If this was a test or duplicate, request that Kevin delete the
        record. He&apos;ll review before anything is removed.
      </p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <button
        type="button"
        onClick={() => call('request')}
        disabled={!!busy}
        className="bg-white border border-red-300 text-red-700 hover:bg-red-50 font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors disabled:opacity-50"
      >
        {busy === 'request' ? 'Sending…' : `Request to delete ${firstName}`}
      </button>
    </div>
  );
}

// ─── Student of the month ────────────────────────────────────────

function currentMonthLabel(): string {
  const d = new Date();
  return `${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
}

function StudentOfMonthControl({
  value,
  firstName,
  reason,
}: {
  value: string;
  firstName: string;
  reason: string;
  /** Kept for backward compat with parent — no longer used. */
  onChange?: (next: string) => void;
}) {
  const isAwarded = !!value;
  return (
    <div className="border border-[#e8e0d4] bg-[#FFF8F0] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
        Student of the month
      </p>
      {isAwarded ? (
        <div>
          <span className="inline-flex items-center gap-1.5 bg-[#D4A843] text-[#0d0d0d] text-sm font-bold px-3 py-1.5">
            <span aria-hidden>★</span>
            Student of the Month · {value}
          </span>
          {reason && (
            <p className="text-xs text-[#666] mt-2 italic leading-snug">
              &ldquo;{reason}&rdquo;
            </p>
          )}
          <p className="text-xs text-[#888] mt-3 leading-relaxed">
            Award nominated by Simon, approved by Kevin via{' '}
            <a href="/admin/sotm" className="underline hover:text-[#0d0d0d]">
              the SOTM picker
            </a>
            . Edit or clear it there.
          </p>
        </div>
      ) : (
        <p className="text-xs text-[#888] leading-relaxed">
          {firstName || 'This kid'} has no current Student of the Month
          award. Nominations live in{' '}
          <a href="/admin/sotm" className="underline hover:text-[#0d0d0d]">
            the SOTM picker
          </a>
          .
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  helper,
  children,
  pending = false,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
  /** When true, the field gets a red border + pending hint — used to
   *  flag fields with unreviewed Simon edits in the admin view. */
  pending?: boolean;
}) {
  return (
    <div
      className={
        pending
          ? 'border-2 border-red-300 bg-red-50/40 p-4 -mx-4 rounded-sm'
          : undefined
      }
    >
      <div className="flex items-center justify-between mb-1">
        <label
          className={`block text-xs font-bold uppercase tracking-[0.2em] ${
            pending ? 'text-red-700' : 'text-[#D4A843]'
          }`}
        >
          {label}
        </label>
        {pending && (
          <span className="text-[10px] uppercase tracking-wider text-red-700 font-bold">
            Unpublished · edited by Simon
          </span>
        )}
      </div>
      {helper && (
        <p className="text-xs text-[#888] mb-2 leading-relaxed">{helper}</p>
      )}
      {children}
    </div>
  );
}
