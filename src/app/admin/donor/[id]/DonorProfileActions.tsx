/**
 * Interactive bits of the donor profile:
 *   - Free-form Notes textarea persists to Donors.Notes
 *   - "Email <name>" — opens an inline compose section, sends the
 *     email via Gmail API on submit, and auto-logs an outbound
 *     interaction in the same request
 *   - "Other channel" — inline form for inbound, phone, text, event
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
  donorEmail,
  initialNotes,
}: {
  donorRecordId: string;
  donorFirstName: string;
  donorEmail: string | null;
  initialNotes: string;
}) {
  const router = useRouter();

  // Notes
  const [notes, setNotes] = useState(initialNotes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesStatus, setNotesStatus] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const notesDirty = notes !== initialNotes;

  // Inline compose
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Other-channel form
  const [addOpen, setAddOpen] = useState(false);
  const [addSubject, setAddSubject] = useState('');
  const [addDirection, setAddDirection] = useState<'outbound' | 'inbound'>('inbound');
  const [addChannel, setAddChannel] = useState<'email' | 'phone' | 'text' | 'event' | 'other'>('phone');
  const [addNotes, setAddNotes] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setSendStatus(null);
    setSendError(null);
    try {
      const res = await fetch(
        `/api/admin/donor/${donorRecordId}/send-email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, body: emailBody }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Send failed: ${res.status}`);
      setSendStatus(`Sent to ${data.toEmail}.`);
      setSubject('');
      setEmailBody('');
      setComposeOpen(false);
      router.refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Send failed.');
    } finally {
      setSending(false);
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
            {savingNotes ? 'Saving…' : notesDirty ? 'Save notes' : 'Saved'}
          </button>
          {notesStatus && <span className="text-sm text-[#888]">{notesStatus}</span>}
          {notesError && <span className="text-sm text-red-600">{notesError}</span>}
        </div>
      </section>

      {/* Compose email */}
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-2">
          Reach out
        </p>
        {donorEmail ? (
          <>
            {!composeOpen && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setComposeOpen(true);
                    setSendStatus(null);
                    setSendError(null);
                  }}
                  className="bg-[#D4A843] text-[#0d0d0d] hover:bg-[#c49a3a] font-bold text-xs uppercase tracking-wider px-4 py-2 transition-colors"
                >
                  Email {donorFirstName}
                </button>
                <button
                  type="button"
                  onClick={() => setAddOpen(o => !o)}
                  className="text-xs text-[#888] hover:text-[#0d0d0d] underline"
                >
                  {addOpen ? 'Cancel' : 'Log a phone / text / in-person interaction instead'}
                </button>
                {sendStatus && (
                  <span className="text-sm text-green-700">{sendStatus}</span>
                )}
              </div>
            )}

            {composeOpen && (
              <form onSubmit={sendEmail} className="border border-[#D4A843] bg-white p-4 space-y-3">
                <p className="text-xs text-[#888]">
                  Sending to{' '}
                  <span className="text-[#0d0d0d] font-semibold">{donorEmail}</span>
                  . Your signature will be appended automatically.
                </p>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider text-[#888] mb-1">
                    Subject
                  </span>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Subject line"
                    className="w-full px-3 py-2 text-sm bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843]"
                    disabled={sending}
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider text-[#888] mb-1">
                    Body
                  </span>
                  <textarea
                    value={emailBody}
                    onChange={e => setEmailBody(e.target.value)}
                    rows={10}
                    placeholder={`Hey ${donorFirstName},\n\n`}
                    className="w-full px-3 py-2 text-sm leading-relaxed bg-white border border-[#e8e0d4] focus:outline-none focus:border-[#D4A843] font-mono"
                    disabled={sending}
                  />
                </label>
                {sendError && (
                  <p className="text-sm text-red-600">{sendError}</p>
                )}
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={sending || !subject.trim() || !emailBody.trim()}
                    className="bg-[#D4A843] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider px-5 py-3 hover:bg-[#c49a3a] transition-colors disabled:opacity-50"
                  >
                    {sending ? 'Sending…' : `Send to ${donorFirstName}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setComposeOpen(false);
                      setSubject('');
                      setEmailBody('');
                      setSendError(null);
                    }}
                    disabled={sending}
                    className="text-xs text-[#888] hover:text-[#0d0d0d] underline"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <p className="text-sm text-[#888]">
            No email on file for {donorFirstName}. Add one in Airtable and
            reload to email from here.
          </p>
        )}

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
                  <option value="phone">Phone</option>
                  <option value="text">Text</option>
                  <option value="event">In person / event</option>
                  <option value="email">Email (sent outside the admin)</option>
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
