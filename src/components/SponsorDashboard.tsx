'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface Update {
  id: string;
  date: string;
  type: string;
  title: string;
  content: string;
  photos: string[];
}

interface ChildInfo {
  name: string;
  photo?: string;
  age?: string;
  location?: string;
  sponsorshipStartDate?: string;
}

interface SponsorDashboardProps {
  sponsorCode: string;
  email: string;
}

export function SponsorDashboard({ sponsorCode, email }: SponsorDashboardProps) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [childInfo, setChildInfo] = useState<ChildInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [nextRequestEligibleAt, setNextRequestEligibleAt] = useState<string | null>(null);
  const [canRequestUpdate, setCanRequestUpdate] = useState(false);

  useEffect(() => {
    loadSponsorData();
  }, [sponsorCode]);

  async function loadSponsorData() {
    try {
      const response = await fetch(`/api/sponsor/updates?sponsorCode=${sponsorCode}`);
      const data = await response.json();

      if (response.ok) {
        setUpdates(data.updates || []);
        setChildInfo(data.childInfo || null);
        setNextRequestEligibleAt(data.nextRequestEligibleAt);

        if (data.nextRequestEligibleAt) {
          const eligibleDate = new Date(data.nextRequestEligibleAt);
          setCanRequestUpdate(new Date() >= eligibleDate);
        } else {
          setCanRequestUpdate(true);
        }
      }
    } catch (error) {
      console.error('Failed to load sponsor data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRequestUpdate() {
    if (!canRequestUpdate) return;

    try {
      const response = await fetch('/api/sponsor/request-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorCode, email }),
      });

      if (response.ok) {
        alert('Update request submitted! Our field team will prepare an update for you.');
        await loadSponsorData();
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to submit request. Please try again.');
      }
    } catch (error) {
      alert('Failed to submit request. Please try again.');
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-gray-900 mx-auto"></div>
          <p className="mt-6 text-lg text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const daysUntilCanRequest = nextRequestEligibleAt
    ? Math.max(0, Math.ceil((new Date(nextRequestEligibleAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const sponsorshipDays = childInfo?.sponsorshipStartDate
    ? Math.floor((Date.now() - new Date(childInfo.sponsorshipStartDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const getUpdateTypeBadge = (type: string) => {
    const badges: Record<string, string> = {
      'Progress Report': 'bg-blue-100 text-blue-800 border-blue-200',
      'Photo Update': 'bg-purple-100 text-purple-800 border-purple-200',
      'Special Note': 'bg-pink-100 text-pink-800 border-pink-200',
      'Holiday Greeting': 'bg-green-100 text-green-800 border-green-200',
      'Milestone': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    };
    return badges[type] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Hero Header with Gradient */}
      {childInfo && (
        <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-2xl shadow-2xl overflow-hidden mb-8">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative px-6 sm:px-8 md:px-12 py-8 md:py-12">
            <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
              {/* Child Photo - Larger and more prominent */}
              {childInfo.photo ? (
                <div className="relative w-40 h-40 md:w-48 md:h-48 rounded-2xl overflow-hidden bg-white/10 backdrop-blur-sm flex-shrink-0 ring-4 ring-white/20 shadow-2xl">
                  <Image
                    src={childInfo.photo}
                    alt={childInfo.name}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="w-40 h-40 md:w-48 md:h-48 rounded-2xl bg-white/10 backdrop-blur-sm flex-shrink-0 ring-4 ring-white/20 flex items-center justify-center">
                  <svg className="w-24 h-24 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}

              {/* Child Info */}
              <div className="flex-1 text-center md:text-left">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3">
                  {childInfo.name}
                </h1>

                <div className="flex flex-wrap gap-3 justify-center md:justify-start mb-6">
                  {childInfo.age && (
                    <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full text-white">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="font-medium">{childInfo.age} years old</span>
                    </div>
                  )}
                  {childInfo.location && (
                    <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full text-white">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="font-medium">{childInfo.location}</span>
                    </div>
                  )}
                </div>

                {childInfo.sponsorshipStartDate && (
                  <p className="text-white/90 text-sm sm:text-base">
                    <span className="font-semibold">Your sponsorship journey:</span> {sponsorshipDays} days of making a difference
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">{updates.length}</p>
              <p className="text-sm text-gray-600">Total Updates</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">{sponsorshipDays}</p>
              <p className="text-sm text-gray-600">Days of Support</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">100%</p>
              <p className="text-sm text-gray-600">Impact</p>
            </div>
          </div>
        </div>
      </div>

      {/* Request Update Card - Improved Design */}
      <div className={`relative overflow-hidden rounded-xl shadow-lg mb-8 border-2 ${canRequestUpdate ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' : 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200'}`}>
        <div className="p-6 sm:p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <svg className={`w-6 h-6 ${canRequestUpdate ? 'text-green-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <h2 className="text-xl font-bold text-gray-900">
                  Request a New Update
                </h2>
              </div>
              <p className="text-gray-700">
                {canRequestUpdate
                  ? 'Get the latest news, photos, and progress reports about your sponsored child.'
                  : `Your next update will be available in ${daysUntilCanRequest} day${daysUntilCanRequest !== 1 ? 's' : ''}.`}
              </p>
              {!canRequestUpdate && nextRequestEligibleAt && (
                <p className="text-sm text-gray-500 mt-2">
                  Available on: {new Date(nextRequestEligibleAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>
            <button
              onClick={handleRequestUpdate}
              disabled={!canRequestUpdate}
              className={`px-8 py-4 rounded-lg font-semibold transition-all transform hover:scale-105 disabled:transform-none shadow-md ${
                canRequestUpdate
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 hover:shadow-lg'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {canRequestUpdate ? 'Request Update' : 'Not Available Yet'}
            </button>
          </div>
        </div>
      </div>

      {/* Updates Feed */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
          <svg className="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
          Recent Updates
        </h2>

        {updates.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 sm:p-16 text-center border border-gray-100">
            <div className="max-w-sm mx-auto">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Updates Yet</h3>
              <p className="text-gray-600 mb-6">
                Updates from our field team will appear here. Request your first update to stay connected!
              </p>
              {canRequestUpdate && (
                <button
                  onClick={handleRequestUpdate}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
                >
                  Request Your First Update
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {updates.map((update, index) => (
              <div
                key={update.id}
                className="bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow overflow-hidden border border-gray-100"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="p-6 sm:p-8">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border ${getUpdateTypeBadge(update.type)}`}>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        {update.type}
                      </span>
                    </div>
                    <time className="text-sm font-medium text-gray-500 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {new Date(update.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </time>
                  </div>

                  <h3 className="text-2xl font-bold text-gray-900 mb-4">{update.title}</h3>

                  <div className="prose prose-lg max-w-none mb-6">
                    <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                      {update.content}
                    </p>
                  </div>

                  {update.photos && update.photos.length > 0 && (
                    <div className={`grid gap-4 mt-6 ${update.photos.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                      {update.photos.map((photo, idx) => (
                        <div key={idx} className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow group">
                          <Image
                            src={photo}
                            alt={`Update photo ${idx + 1}`}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
