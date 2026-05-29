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
import Link from 'next/link';
import { Logo } from '@/components/Logo';

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
}

interface SendResult {
  newsletterId: string;
  status: string;
  recipientCount?: number;
  sentCount?: number;
  failedCount?: number;
  dryRun?: boolean;
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

  const triggerSend = async (dryRun: boolean) => {
    if (!selectedId) {
      setErrorMessage('Save the draft first before sending.');
      return;
    }
    if (!dryRun) {
      const ok = window.confirm(
        'This will email every active sponsor right now. Are you sure?'
      );
      if (!ok) return;
    }
    setBusy(true);
    setStatusMessage('');
    setErrorMessage('');
    setSendResult(null);
    try {
      const res = await fetch('/api/admin/newsletter/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newsletterId: selectedId, dryRun }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.message || `HTTP ${res.status}`);
      }
      setSendResult(payload.data as SendResult);
      setStatusMessage(
        dryRun
          ? `Dry run: would send to ${payload.data?.recipientCount ?? 0} sponsor(s).`
          : `Sent to ${payload.data?.sentCount ?? 0} sponsor(s) (${payload.data?.failedCount ?? 0} failed).`
      );
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
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Logo className="h-8 w-8 text-gray-900" />
            <span className="text-xl font-semibold text-gray-900">Be A Number</span>
          </Link>
          <div className="flex gap-4 text-sm">
            <Link href="/admin/dashboard" className="text-gray-600 hover:text-gray-900">
              Updates Dashboard
            </Link>
            <Link href="/admin/sponsors" className="text-gray-600 hover:text-gray-900">
              Sponsors
            </Link>
            <Link href="/admin/newsletter" className="text-gray-900 font-semibold">
              Newsletter
            </Link>
            <Link href="/admin/fulfillment" className="text-gray-600 hover:text-gray-900">
              Fulfillment
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
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
                    className="prose prose-sm max-w-none border border-gray-200 rounded-md p-4 min-h-[300px] bg-gray-50"
                    style={{ fontFamily: 'Georgia, serif' }}
                    dangerouslySetInnerHTML={{ __html: renderedPreview }}
                  />
                ) : (
                  <textarea
                    value={editor.bodyHtml}
                    disabled={isReadOnly}
                    onChange={(e) => setEditor({ ...editor, bodyHtml: e.target.value })}
                    rows={16}
                    placeholder="HTML body. Use {{sponsorFirstName}} for personalization."
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
                    onClick={() => triggerSend(true)}
                    disabled={busy || !selectedId}
                    className="bg-white border border-gray-300 text-gray-900 px-4 py-2 rounded-md text-sm font-semibold hover:border-gray-500 disabled:opacity-50"
                    title={!selectedId ? 'Save the draft first' : 'Counts recipients without sending'}
                  >
                    Dry run
                  </button>
                  <button
                    onClick={() => triggerSend(false)}
                    disabled={busy || !selectedId}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                    title={!selectedId ? 'Save the draft first' : 'Sends to every active sponsor'}
                  >
                    Send now
                  </button>
                </div>
              )}

              {sendResult && (
                <div className="mt-4 border border-gray-200 rounded-md p-4 bg-gray-50 text-sm">
                  <div className="font-semibold text-gray-900 mb-1">
                    {sendResult.dryRun ? 'Dry run result' : 'Send result'}
                  </div>
                  <div className="text-gray-700">
                    Recipients: {sendResult.recipientCount ?? 0}
                    {!sendResult.dryRun && (
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
    </div>
  );
}
