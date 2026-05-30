'use client';

/**
 * Admin · Newsletters
 *
 * One-screen editor for the monthly campus newsletter.
 *
 * Workflow (for Kevin):
 *   1. Click "New newsletter" — fills the editor with a starter template.
 *   2. Edit Title (internal label), Subject (what sponsors see),
 *      BodyHTML (the email content with {{sponsorFirstName}} merge tags).
 *   3. Click "Preview" to see the rendered HTML with a fake first name.
 *   4. Click "Dry run send" to validate — counts recipients, sends nothing.
 *   5. Click "Send now" to actually mail every active sponsor.
 *
 * The list on the left shows everything in the Newsletters table. Clicking
 * a row loads it into the editor. Sent and Sending newsletters are
 * read-only (the API enforces this too).
 */

import { useEffect, useState } from 'react';
import { AdminShell } from '../_components/AdminShell';

interface Newsletter {
  id: string;
  createdTime: string;
  title: string;
  subject: string;
  bodyHtml: string;
  status: 'Draft' | 'Scheduled' | 'Sending' | 'Sent' | 'Failed';
  sendDate: string | null;
  publishedAt: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  sendNotes: string;
  author: string;
  heroPhoto: string | null;
  teaser: string;
}

interface SendResult {
  newsletterId: string;
  status: string;
  recipientCount?: number;
  nonSponsorRecipientCount?: number;
  shirtBuyerRecipientCount?: number;
  legacyDonorRecipientCount?: number;
  sentCount?: number;
  failedCount?: number;
  dryRun?: boolean;
  testSend?: boolean;
  recipients?: string[];
  errors?: string[];
}

const STARTER_BODY = `<p>Friend,</p>

<p>This month at the YDO campus in Gulu — [a story or two from the field, kept campus-wide so it doesn't spoil anyone's reveal].</p>

<p>The numbers from last month: [share something concrete — kids enrolled, meals served, classes started].</p>

<p>Thanks for being part of this.</p>

<p>— The BAN team</p>`;

const STATUS_BADGE_CLASSES: Record<Newsletter['status'], string> = {
  Draft: 'bg-gray-100 text-gray-700 border-gray-300',
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  Sending: 'bg-amber-50 text-amber-800 border-amber-200',
  Sent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Failed: 'bg-red-50 text-red-700 border-red-200',
};

export default function AdminNewsletterPage() {
  // Auth is handled by middleware.ts + the admin session cookie. No
  // password prompt here — if you reached this page, you're authed.
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState({
    title: '',
    subject: '',
    bodyHtml: '',
    author: '',
    teaser: '',
  });
  const [showPreview, setShowPreview] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  // ────────────────────────────────────────────────────────────────
  // Data load — cookie auth is sent automatically by the browser
  // ────────────────────────────────────────────────────────────────

  const reloadList = async () => {
    try {
      const res = await fetch('/api/admin/newsletter/list');
      const payload = await res.json();
      if (res.ok) {
        setNewsletters((payload.data?.newsletters ?? []) as Newsletter[]);
      }
    } catch {
      // Non-fatal. Errors surfaced by primary actions.
    }
  };

  // Auto-load on mount.
  useEffect(() => {
    reloadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ────────────────────────────────────────────────────────────────
  // Editor actions
  // ────────────────────────────────────────────────────────────────

  const isReadOnly = (() => {
    if (!selectedId) return false;
    const n = newsletters.find((x) => x.id === selectedId);
    return n?.status === 'Sent' || n?.status === 'Sending';
  })();

  const startNewDraft = () => {
    setSelectedId(null);
    setEditor({
      title: '',
      subject: '',
      bodyHtml: STARTER_BODY,
      author: 'Kevin',
      teaser: '',
    });
    setShowPreview(false);
    setStatusMessage('');
    setErrorMessage('');
    setSendResult(null);
  };

  const loadNewsletter = (n: Newsletter) => {
    setSelectedId(n.id);
    setEditor({
      title: n.title,
      subject: n.subject,
      bodyHtml: n.bodyHtml,
      author: n.author,
      teaser: n.teaser || '',
    });
    setShowPreview(false);
    setStatusMessage('');
    setErrorMessage('');
    setSendResult(null);
  };

  const saveDraft = async () => {
    setBusy(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      if (selectedId) {
        const res = await fetch('/api/admin/newsletter/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: selectedId,
            title: editor.title,
            subject: editor.subject,
            bodyHtml: editor.bodyHtml,
            author: editor.author,
            teaser: editor.teaser,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || `HTTP ${res.status}`);
        }
        setStatusMessage('Draft saved.');
      } else {
        const res = await fetch('/api/admin/newsletter/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: editor.title,
            subject: editor.subject,
            bodyHtml: editor.bodyHtml,
            author: editor.author,
            teaser: editor.teaser,
            status: 'Draft',
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || `HTTP ${res.status}`);
        }
        const payload = await res.json();
        setSelectedId(payload.data.id);
        setStatusMessage('Newsletter created.');
      }
      await reloadList();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const triggerSend = async (
    mode: 'dryRun' | 'test' | 'real'
  ) => {
    if (!selectedId) {
      setErrorMessage('Save the draft first before sending.');
      return;
    }
    if (mode === 'real') {
      const ok = window.confirm(
        'This will email every active sponsor + every shirt buyer / past donor who has not unsubscribed. Are you sure?'
      );
      if (!ok) return;
    }
    setBusy(true);
    setStatusMessage('');
    setErrorMessage('');
    setSendResult(null);
    try {
      const body: Record<string, unknown> = { newsletterId: selectedId };
      if (mode === 'dryRun') body.dryRun = true;
      if (mode === 'test') body.testTo = 'kevin@beanumber.org';
      const res = await fetch('/api/admin/newsletter/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.message || `HTTP ${res.status}`);
      }
      const data = payload.data as SendResult;
      setSendResult(data);
      if (mode === 'test') {
        setStatusMessage(
          `Tests sent to kevin@beanumber.org (sponsor view, shirt-buyer view, legacy-donor view). Real send: ${
            data.recipientCount ?? 0
          } sponsor(s) + ${data.shirtBuyerRecipientCount ?? 0} shirt buyer(s) + ${
            data.legacyDonorRecipientCount ?? 0
          } legacy donor(s) = ${(data.recipientCount ?? 0) + (data.nonSponsorRecipientCount ?? 0)} total.`
        );
      } else if (mode === 'dryRun') {
        setStatusMessage(
          `Counts ready: ${data.recipientCount ?? 0} sponsor(s) + ${
            data.shirtBuyerRecipientCount ?? 0
          } shirt buyer(s) + ${
            data.legacyDonorRecipientCount ?? 0
          } legacy donor(s).`
        );
      } else {
        setStatusMessage(
          `Sent to ${data.sentCount ?? 0} recipient(s) (${
            data.failedCount ?? 0
          } failed).`
        );
      }
      await reloadList();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Render — preview
  // ────────────────────────────────────────────────────────────────

  // Substitute {{sponsorFirstName}} and {{sponsorName}} for a fake person
  // so the user can see what real sponsors will get without leaking PII.
  const renderedPreview = (() => {
    const fakeFirstName = 'Sarah';
    const fakeName = 'Sarah Demo';
    return editor.bodyHtml
      .replace(/\{\{\s*sponsorFirstName\s*\}\}/g, fakeFirstName)
      .replace(/\{\{\s*sponsorName\s*\}\}/g, fakeName);
  })();

  // ────────────────────────────────────────────────────────────────
  // Render — main editor (auth is handled by middleware)
  // ────────────────────────────────────────────────────────────────

  return (
    <AdminShell activeTab="newsletter">
      <main className="max-w-7xl mx-auto px-6 py-8 bg-[#FFF8F0] min-h-[calc(100vh-64px)]">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Campus Newsletter</h1>
          <button
            onClick={startNewDraft}
            className="bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-gray-800"
          >
            + New newsletter
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <aside className="lg:col-span-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">
              All newsletters ({newsletters.length})
            </h2>
            {newsletters.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-300 rounded-lg p-6 text-sm text-gray-500">
                None yet. Click &ldquo;New newsletter&rdquo; to start the first draft.
              </div>
            ) : (
              <ul className="space-y-2">
                {newsletters.map((n) => {
                  const isSelected = n.id === selectedId;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => loadNewsletter(n)}
                        className={`w-full text-left px-4 py-3 rounded-md border transition-colors ${
                          isSelected
                            ? 'border-gray-900 bg-white shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-400'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-semibold text-gray-900 text-sm truncate">
                            {n.title || '(untitled)'}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_BADGE_CLASSES[n.status]}`}
                          >
                            {n.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 truncate">{n.subject}</div>
                        {n.publishedAt && (
                          <div className="text-[11px] text-gray-400 mt-1">
                            Sent {new Date(n.publishedAt).toLocaleDateString()} ·{' '}
                            {n.sentCount}/{n.recipientCount}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* Editor */}
          <section className="lg:col-span-2 bg-white border border-gray-200 rounded-lg p-6">
            {isReadOnly && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-md mb-4 text-sm">
                This newsletter has already been sent and is read-only. To send something similar,
                start a new draft.
              </div>
            )}
            {statusMessage && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-md mb-4 text-sm">
                {statusMessage}
              </div>
            )}
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-4 text-sm">
                {errorMessage}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Title (internal)
                  </label>
                  <input
                    type="text"
                    value={editor.title}
                    disabled={isReadOnly}
                    onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                    placeholder="e.g. April 2026 Campus News"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Author
                  </label>
                  <input
                    type="text"
                    value={editor.author}
                    disabled={isReadOnly}
                    onChange={(e) => setEditor({ ...editor, author: e.target.value })}
                    placeholder="Kevin"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Subject (sponsor sees this)
                </label>
                <input
                  type="text"
                  value={editor.subject}
                  disabled={isReadOnly}
                  onChange={(e) => setEditor({ ...editor, subject: e.target.value })}
                  placeholder="A note from the campus"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50"
                />
              </div>

              {/* Teaser — the short hook used in the notification email.
                  If left blank, the send pipeline falls back to the
                  first paragraph of the body. Best for pulling the
                  strongest moment from anywhere in the newsletter, not
                  just the chronological opening. */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Teaser (email hook)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  1–3 sentences. Renders as an italic blockquote in the notification email.
                  Pull the strongest moment from the body — doesn&rsquo;t have to be the first paragraph.
                  Leave blank to auto-extract from the body opening.
                </p>
                <textarea
                  value={editor.teaser}
                  disabled={isReadOnly}
                  onChange={(e) => setEditor({ ...editor, teaser: e.target.value })}
                  rows={3}
                  placeholder="The line that earns the click."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50"
                />
              </div>

              {/* Hero photo upload — single image at the top of the
                  newsletter (both email and on-page). Only available
                  once the newsletter has been saved (so we have an
                  Airtable record ID to attach to). Replacing uploads
                  a new image; clearing requires going to Airtable. */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Hero photo (optional)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  One image at the top of the newsletter. JPG or PNG, ideally ~1200px wide. Max ~3.7&nbsp;MB.
                </p>
                {selectedId ? (
                  <HeroPhotoUploader
                    newsletterId={selectedId}
                    currentUrl={newsletters.find(n => n.id === selectedId)?.heroPhoto || null}
                    disabled={isReadOnly}
                    onUploaded={reloadList}
                  />
                ) : (
                  <p className="text-xs text-gray-400 italic">
                    Save the draft first, then you can upload a hero photo.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Body (HTML)
                  </label>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="text-xs text-gray-600 hover:text-gray-900 underline"
                  >
                    {showPreview ? 'Edit' : 'Preview'}
                  </button>
                </div>
                {showPreview ? (
                  <div
                    className="ban-newsletter-body max-w-none border border-gray-200 rounded-md p-6 min-h-[300px] bg-white"
                    dangerouslySetInnerHTML={{ __html: renderedPreview }}
                  />
                ) : (
                  <textarea
                    value={editor.bodyHtml}
                    disabled={isReadOnly}
                    onChange={(e) => setEditor({ ...editor, bodyHtml: e.target.value })}
                    rows={16}
                    placeholder="Plain HTML. Use <p> for paragraphs and <h2> for section headers — no inline styles needed."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono disabled:bg-gray-50"
                  />
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Supports inline HTML. Merge tags:{' '}
                  <code className="text-gray-700 bg-gray-100 px-1 rounded">{`{{sponsorFirstName}}`}</code>{' '}
                  and{' '}
                  <code className="text-gray-700 bg-gray-100 px-1 rounded">{`{{sponsorName}}`}</code>
                  . Keep content campus-wide, not child-specific, to avoid spoiling the reveal.
                </p>
              </div>

              {!isReadOnly && (
                <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
                  <button
                    onClick={saveDraft}
                    disabled={busy || !editor.title || !editor.subject || !editor.bodyHtml}
                    className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
                  >
                    {selectedId ? 'Save changes' : 'Save as draft'}
                  </button>
                  <button
                    onClick={() => triggerSend('test')}
                    disabled={busy || !selectedId}
                    className="bg-[#D4A843] text-[#0d0d0d] px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wider hover:bg-[#c49a3a] disabled:opacity-50"
                    title={!selectedId ? 'Save the draft first' : 'Sends both variants (sponsor + non-sponsor) to your inbox'}
                  >
                    Send test to my inbox
                  </button>
                  <button
                    onClick={() => triggerSend('dryRun')}
                    disabled={busy || !selectedId}
                    className="bg-white border border-gray-300 text-gray-900 px-4 py-2 rounded-md text-sm font-semibold hover:border-gray-500 disabled:opacity-50"
                    title={!selectedId ? 'Save the draft first' : 'Counts recipients without sending'}
                  >
                    Just count
                  </button>
                  <button
                    onClick={() => triggerSend('real')}
                    disabled={busy || !selectedId}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                    title={!selectedId ? 'Save the draft first' : 'Sends to every active sponsor + every shirt buyer / past donor who has not unsubscribed'}
                  >
                    Send to all
                  </button>
                </div>
              )}

              {sendResult && (
                <div className="mt-4 border border-gray-200 rounded-md p-4 bg-gray-50 text-sm">
                  <div className="font-semibold text-gray-900 mb-1">
                    {sendResult.testSend
                      ? 'Test result'
                      : sendResult.dryRun
                        ? 'Counts'
                        : 'Send result'}
                  </div>
                  <div className="text-gray-700">
                    Active sponsors: {sendResult.recipientCount ?? 0}
                    {' · '}Opted-in non-sponsors:{' '}
                    {sendResult.nonSponsorRecipientCount ?? 0}
                    {sendResult.testSend && (
                      <>
                        {' · '}Test sent: {sendResult.sentCount ?? 0}/2{' '}
                        {sendResult.failedCount
                          ? `(${sendResult.failedCount} failed)`
                          : ''}
                      </>
                    )}
                    {!sendResult.dryRun && !sendResult.testSend && (
                      <>
                        {' · '}Sent: {sendResult.sentCount ?? 0}
                        {' · '}Failed: {sendResult.failedCount ?? 0}
                      </>
                    )}
                  </div>
                  {sendResult.errors && sendResult.errors.length > 0 && (
                    <details className="mt-2 text-xs text-red-700">
                      <summary className="cursor-pointer">
                        {sendResult.errors.length} error(s)
                      </summary>
                      <ul className="mt-1 list-disc pl-5 space-y-0.5">
                        {sendResult.errors.slice(0, 10).map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </AdminShell>
  );
}

// ─── Hero photo uploader ─────────────────────────────────────────

function HeroPhotoUploader({
  newsletterId,
  currentUrl,
  disabled,
  onUploaded,
}: {
  newsletterId: string;
  currentUrl: string | null;
  disabled?: boolean;
  onUploaded: () => void | Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setStatus(null);

    if (file.size > 3.7 * 1024 * 1024) {
      setError('Image too large (max 3.7 MB). Compress and try again.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/admin/newsletter/upload-hero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newsletterId,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          data: base64,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Upload failed: ${res.status}`);
      setStatus('Uploaded.');
      await onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div>
      {currentUrl ? (
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt="Hero"
            className="w-32 h-20 object-cover bg-gray-100 border border-gray-200 rounded"
          />
          <div>
            <p className="text-xs text-gray-500 mb-2">Current hero photo.</p>
            <label className="inline-flex items-center justify-center bg-white text-gray-900 font-semibold text-xs uppercase tracking-wider px-3 py-2 border border-gray-300 rounded hover:border-gray-900 cursor-pointer transition-colors">
              <input
                type="file"
                className="sr-only"
                accept="image/*"
                onChange={onFile}
                disabled={uploading || disabled}
              />
              {uploading ? 'Uploading…' : 'Replace'}
            </label>
          </div>
        </div>
      ) : (
        <label className="inline-flex items-center justify-center bg-white text-gray-900 font-semibold text-xs uppercase tracking-wider px-3 py-2 border border-gray-300 rounded hover:border-gray-900 cursor-pointer transition-colors">
          <input
            type="file"
            className="sr-only"
            accept="image/*"
            onChange={onFile}
            disabled={uploading || disabled}
          />
          {uploading ? 'Uploading…' : 'Upload hero photo'}
        </label>
      )}
      {status && <p className="mt-2 text-sm text-gray-500">{status}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
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
