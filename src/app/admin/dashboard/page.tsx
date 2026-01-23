'use client';

import { useState, useEffect } from 'react';
import { Logo } from '@/components/Logo';
import Link from 'next/link';

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

interface OverdueChild {
  sponsorCode: string;
  childName: string;
  childId: string;
  sponsorEmail: string;
  sponsorName?: string;
  lastUpdateDate: string | null;
  daysSinceUpdate: number;
  lastUpdateTitle?: string;
}

export default function AdminDashboard() {
  const [adminToken, setAdminToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [updates, setUpdates] = useState<PendingUpdate[]>([]);
  const [overdueChildren, setOverdueChildren] = useState<OverdueChild[]>([]);
  const [overdueStats, setOverdueStats] = useState<{ totalActive: number; overdueCount: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOverdue, setIsLoadingOverdue] = useState(false);
  const [error, setError] = useState('');
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'overdue'>('pending');

  const loadOverdueData = async (token: string) => {
    setIsLoadingOverdue(true);
    try {
      const response = await fetch('/api/admin/updates/overdue?threshold=90', {
        headers: {
          'X-Admin-Token': token,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setOverdueChildren(data.data.overdueChildren);
        setOverdueStats({
          totalActive: data.data.totalActive,
          overdueCount: data.data.overdueCount,
        });
      }
    } catch (err) {
      console.error('Failed to load overdue data:', err);
    } finally {
      setIsLoadingOverdue(false);
    }
  };

  const handleAuthenticate = async () => {
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/updates/list', {
        headers: {
          'X-Admin-Token': adminToken,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Authentication failed');
      }

      const data = await response.json();
      setUpdates(data.data.updates);
      setIsAuthenticated(true);

      // Also load overdue data
      loadOverdueData(adminToken);
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate');
    } finally {
      setIsLoading(false);
    }
  };

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
          'X-Admin-Token': adminToken,
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
              'X-Admin-Token': adminToken,
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Navigation */}
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <Link href="/" className="flex items-center gap-3">
              <Logo className="h-8 w-8 text-gray-900" />
              <span className="text-xl font-semibold text-gray-900">Be A Number</span>
            </Link>
          </div>
        </nav>

        <div className="max-w-md mx-auto px-6 py-16">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
            <p className="text-gray-600 mb-6">Enter your admin token to continue</p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-4 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="adminToken" className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Token
                </label>
                <input
                  type="password"
                  id="adminToken"
                  value={adminToken}
                  onChange={(e) => setAdminToken(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Enter admin token"
                  onKeyDown={(e) => e.key === 'Enter' && handleAuthenticate()}
                />
              </div>

              <button
                onClick={handleAuthenticate}
                disabled={isLoading || !adminToken}
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Authenticating...' : 'Access Dashboard'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <Logo className="h-8 w-8 text-gray-900" />
              <span className="text-xl font-semibold text-gray-900">Be A Number</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/admin/updates/submit"
                className="text-gray-600 hover:text-gray-900 text-sm"
              >
                Submit Update
              </Link>
              <button
                onClick={() => {
                  setIsAuthenticated(false);
                  setAdminToken('');
                }}
                className="text-gray-600 hover:text-gray-900 text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
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

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('pending')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'pending'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Pending Updates ({updates.length})
          </button>
          <button
            onClick={() => setActiveTab('overdue')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'overdue'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Overdue Updates {overdueStats ? `(${overdueStats.overdueCount}/${overdueStats.totalActive})` : ''}
          </button>
        </div>

        {/* Pending Updates Tab */}
        {activeTab === 'pending' && (
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
        )}

        {/* Overdue Updates Tab */}
        {activeTab === 'overdue' && (
        <div className="bg-white rounded-lg shadow-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Children Needing Updates
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Children who haven't received an update in more than 90 days
            </p>
          </div>

          {isLoadingOverdue ? (
            <div className="px-6 py-12 text-center text-gray-500">
              Loading overdue data...
            </div>
          ) : overdueChildren.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              All children have recent updates
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {overdueChildren.map((child) => (
                <div key={child.sponsorCode} className="p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {child.childName}
                      </h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                          {child.sponsorCode}
                        </span>
                        <span>Sponsor: {child.sponsorName || child.sponsorEmail}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                        child.daysSinceUpdate === -1
                          ? 'bg-red-100 text-red-800'
                          : child.daysSinceUpdate > 180
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {child.daysSinceUpdate === -1
                          ? 'Never updated'
                          : `${child.daysSinceUpdate} days ago`}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-gray-600">
                    {child.lastUpdateDate ? (
                      <>
                        <span className="font-medium">Last update:</span>{' '}
                        {child.lastUpdateTitle} ({formatDate(child.lastUpdateDate)})
                      </>
                    ) : (
                      <span className="italic text-gray-400">No updates have been published for this child</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
