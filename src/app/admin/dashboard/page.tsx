'use client';

import { useState, useEffect } from 'react';
import { AdminShell } from '../_components/AdminShell';

interface PendingUpdate {
  id: string;
  childId: string;
  sponsorCode?: string;
  updateType: string;
  title: string;
  content: string;
  photos?: Array<{ url: string; filename: string }>;
  status: string;
  requestedBySponsor?: boolean;
  requestedAt?: string;
  submittedBy?: string;
  submittedAt?: string;
  createdTime: string;
}

// The "Overdue Updates" tab that used to sit beside Pending Updates read
// the Airtable child-update review tables. It was removed with the
// Airtable retirement on 2026-09-14. The roster deadlines banner on
// /admin/roster covers the same question from Postgres.

export default function AdminDashboard() {
  // Auth is handled by middleware.ts + the admin session cookie.
  // No password prompt here; the cookie ships automatically on every
  // fetch, so we drop the X-Admin-Token headers too.
  const [updates, setUpdates] = useState<PendingUpdate[]>([]);
  const [error, setError] = useState('');
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const loadUpdates = async () => {
    try {
      const response = await fetch('/api/admin/updates/list');
      if (response.ok) {
        const data = await response.json();
        setUpdates(data.data.updates);
      } else {
        const data = await response.json().catch(() => ({}));
        setError(`Couldn't load pending updates: ${data.message || response.statusText}. Dashboard still works. Check DATABASE_URL in Vercel env vars.`);
      }
    } catch (err) {
      setError('Couldn\'t reach the updates API. Dashboard still works.');
    }
  };

  // Auto-load on mount (cookie auth carries through).
  useEffect(() => {
    loadUpdates();
  }, []);

  const handlePublish = async (updateId: string, title: string, sendNotification: boolean = false) => {
    const action = sendNotification ? 'publish and notify sponsor about' : 'publish';
    if (!confirm(`Are you sure you want to ${action} "${title}"?`)) {
      return;
    }

    setPublishingId(updateId);
    setError('');
    setSuccessMessage('');

    try {
      // Step 1: Publish the update
      const publishResponse = await fetch('/api/admin/updates/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updateId }),
      });

      const publishData = await publishResponse.json();

      if (!publishResponse.ok) {
        throw new Error(publishData.message || 'Failed to publish update');
      }

      // Remove from list
      setUpdates(updates.filter((u) => u.id !== updateId));

      // Step 2: Optionally send notification
      if (sendNotification && publishData.data.sponsorNotificationReady) {
        try {
          const notifyResponse = await fetch('/api/admin/updates/notify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ updateId }),
          });

          const notifyData = await notifyResponse.json();

          if (notifyResponse.ok) {
            setSuccessMessage(`"${title}" published and notification sent to ${publishData.data.sponsor?.email}!`);
          } else {
            setSuccessMessage(`"${title}" published, but notification failed: ${notifyData.message}`);
          }
        } catch (notifyErr: any) {
          setSuccessMessage(`"${title}" published, but notification failed: ${notifyErr.message}`);
        }
      } else {
        setSuccessMessage(
          publishData.data.sponsorNotificationReady
            ? `"${title}" published! Sponsor notification available for ${publishData.data.sponsor?.email}`
            : `"${title}" published successfully!`
        );
      }
    } catch (err: any) {
      setError(err.message || 'Failed to publish update');
    } finally {
      setPublishingId(null);
    }
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <AdminShell activeTab="updates">
      <div className="max-w-6xl mx-auto px-6 py-8 bg-[#FFF8F0] min-h-[calc(100vh-64px)]">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">
            Review and publish pending updates
          </p>
        </div>

        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md mb-6">
            {successMessage}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
            {error}
          </div>
        )}

        {/* Pending Updates */}
        <div className="bg-white rounded-lg shadow-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Pending Updates ({updates.length})
            </h2>
          </div>

          {updates.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              No pending updates to review
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {updates.map((update) => (
                <div key={update.id} className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {update.title}
                      </h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                          {update.sponsorCode || 'No sponsor code'}
                        </span>
                        <span>{update.updateType}</span>
                        {update.requestedBySponsor && (
                          <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">
                            Sponsor Requested
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePublish(update.id, update.title, false)}
                        disabled={publishingId === update.id}
                        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {publishingId === update.id ? 'Publishing...' : 'Publish Only'}
                      </button>
                      {update.sponsorCode && (
                        <button
                          onClick={() => handlePublish(update.id, update.title, true)}
                          disabled={publishingId === update.id}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {publishingId === update.id ? 'Publishing...' : 'Publish & Notify'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-md p-4 mb-4">
                    <p className="text-gray-700 whitespace-pre-wrap">
                      {update.content}
                    </p>
                  </div>

                  {update.photos && update.photos.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Photos ({update.photos.length})
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {update.photos.map((photo, idx) => (
                          <a
                            key={idx}
                            href={photo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline"
                          >
                            {photo.filename}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-gray-500 flex gap-4">
                    {update.submittedBy && (
                      <span>Submitted by: {update.submittedBy}</span>
                    )}
                    <span>Submitted: {formatDate(update.submittedAt || update.createdTime)}</span>
                    {update.requestedAt && (
                      <span>Requested: {formatDate(update.requestedAt)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
