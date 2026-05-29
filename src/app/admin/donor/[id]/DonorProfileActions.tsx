/**
 * Interactive bits of the donor profile:
 *   - Free-form Notes textarea, save button persists to Donors.Notes
 *   - "Mark contacted" — one click logs an outbound email interaction
 *   - "Add interaction" — inline form for inbound, phone, text, etc.
 *
 * Stays on the same page; on save, calls router.refresh() so the
 * server-rendered Timeline / Last contact sections re-fetch.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DonorProfileActions({
  donorRecordId,
  donorFirstName,
  initialNotes,
}: {
  donorRecordId: string;
  donorFirstName: string;
  initialNotes: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesStatus, setNotesStatus] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);

  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [markStatus, setMarkStatus] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addSubject, setAddSubject] = useState('');
  const [addDirection, setAddDirection] = useState<'outbound' | 'inbound'>('inbound');
  const [addChannel, setAddChannel] = useState<'email' | 'phone' | 'text' | 'event' | 'other'>('email');
  const [addNotes, setAddNotes] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const notesDirty = notes !== initialNotes;

  async function saveNotes() {
    if (savingNotes) return;
    setSavingNotes(true);
    setNotesStatus(null);
    setNotesError(null);
    try {
      const res = await fetch(`/api/admin/donor/${donorRecordId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed: ${res.status}`);
      }
      setNotesStatus('Saved.');
      router.refresh();
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingNotes(false);
    }
  }

  async function markContacted() {
    if (marking) return;
    setMarking(true);
    setMarkError(null);
    setMarkStatus(null);
    try {
      const res = await fetch(
        `/api/admin/donor/${donorRecordId}/interaction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            direction: 'outbound',
            channel: 'email',
            subject: `Emailed ${donorFirstName}`,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Log failed: ${res.status}`);
      }
      setMarkStatus('Logged.');
      router.refresh();
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : 'Log failed.');
    } finally {
      setMarking(false);
    }
  }

  async function submitAddInteraction(e: React.FormEvent) {
    e.preventDefault();
    if (addBusy) return;
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await fetch(
        `/api/admin/donor/${donorRecordId}/interaction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: addSubject.trim() || undefined,
            direction: addDirection,
            channel: addChannel,
            notes: addNotes.trim() || undefined,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed: ${res.status}`);
      }
      setAddSubject('');
      setAddNotes('');
      setAddOpen(false);
      router.refresh();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Notes */}
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
          Notes
        </p>
        <textarea
          value={notes}
          onChange={e => {
            setNotes(e.target.value);
            setNotesStatus(null);
            setNotesError(null);
          }}
          rows={5}
          placeholder={`Internal relationship notes for ${donorFirstName} — how you met, what they care about, family context, talking points.`}
          className="w-full px-3 py-2 bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] focus:ring-1 focus:ring-[#D4A843] text-sm leading-relaxed"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={saveNotes}
            disabled={savingNotes || !notesDirty}
            className="bg-[#D4A843] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider px-4 py-2 hover:bg-[#c49a3a] transition-colors disabled:opacity-50"
          >
            {savingNotes
              ? 'Saving…'
              : notesDirty
                ? 'Save notes'
                : 'Saved'}
          </button>
          {notesStatus && <span className="text-sm text-[#888]">{notesStatus}</span>}
          {notesError && <span className="text-sm text-red-600">{notesError}</span>}
        </div>
      </section>

      {/* Mark contacted + Add interaction */}
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
          Log an interaction
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={markContacted}
            disabled={marking}
            className="bg-white border border-[#D4A843] text-[#D4A843] hover:bg-[#D4A843] hover:text-[#0d0d0d] font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors disabled:opacity-50"
          >
            {marking ? 'Logging…' : `I emailed ${donorFirstName}`}
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(o => !o)}
            className="text-xs text-[#888] hover:text-[#0d0d0d] underline"
          >
            {addOpen ? 'Cancel' : 'Other channel (phone / text / event)'}
          </button>
          {markStatus && <span className="text-sm text-[#888]">{markStatus}</span>}
          {markError && <span className="text-sm text-red-600">{markError}</span>}
        </div>

        {addOpen && (
          <form
            onSubmit={submitAddInteraction}
            className="mt-3 border border-[#e8e0d4] bg-white p-4 space-y-3"
          >
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[10px] uppercase tracking-wider text-[#888] mb-1">
                  Direction
                </span>
                <select
                  value={addDirection}
                  onChange={e =>
                    setAddDirection(e.target.value as 'outbound' | 'inbound')
                  }
                  className="w-full px-2 py-1.5 text-sm bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843]"
                >
                  <option value="inbound">Inbound (they reached out)</option>
                  <option value="outbound">Outbound (I reached out)</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-[10px] uppercase tracking-wider text-[#888] mb-1">
                  Channel
                </span>
                <select
                  value={addChannel}
                  onChange={e =>
                    setAddChannel(
                      e.target.value as
                        | 'email'
                        | 'phone'
                        | 'text'
                        | 'event'
                        | 'other'
                    )
                  }
                  className="w-full px-2 py-1.5 text-sm bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843]"
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="text">Text</option>
                  <option value="event">In person / event</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-[#888] mb-1">
                Subject (one line)
              </span>
              <input
                type="text"
                value={addSubject}
                onChange={e => setAddSubject(e.target.value)}
                placeholder="What happened, in a few words"
                className="w-full px-2 py-1.5 text-sm bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843]"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-[#888] mb-1">
                Notes (optional)
              </span>
              <textarea
                value={addNotes}
                onChange={e => setAddNotes(e.target.value)}
                rows={3}
                placeholder="What was said, what to follow up on"
                className="w-full px-2 py-1.5 text-sm bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843]"
              />
            </label>
            {addError && <p className="text-sm text-red-600">{addError}</p>}
            <button
              type="submit"
              disabled={addBusy}
              className="bg-[#D4A843] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider px-4 py-2 hover:bg-[#c49a3a] transition-colors disabled:opacity-50"
            >
              {addBusy ? 'Saving…' : 'Log interaction'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
