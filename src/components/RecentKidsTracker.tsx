'use client';

import { useEffect } from 'react';

/**
 * Push a kid visit onto the client's localStorage "Kids you've met"
 * history. Renders nothing — pure side effect on mount.
 *
 * Layer 2 of the multi-kid identity work: clients track who they've
 * met across the campus, regardless of whether they own those numbers.
 * For signed-in users we may later sync this server-side to power
 * the "/me" dashboard's history view; for v1 this is purely
 * browser-local.
 *
 * History capped at 12 entries (most-recent first) to keep storage
 * lightweight and the recency strip meaningful.
 */
export function RecentKidsTracker({
  shirtNumber,
  displayName,
  firstName,
  photoUrl,
}: {
  shirtNumber: number;
  displayName: string;
  firstName: string;
  photoUrl?: string;
}) {
  useEffect(() => {
    try {
      const STORAGE_KEY = 'ban-recent-kids';
      const raw = localStorage.getItem(STORAGE_KEY);
      let list: Array<{
        shirtNumber: number;
        displayName: string;
        firstName: string;
        photoUrl?: string;
        visitedAt: number;
      }> = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      const filtered = list.filter(k => k.shirtNumber !== shirtNumber);
      filtered.unshift({
        shirtNumber,
        displayName,
        firstName,
        photoUrl,
        visitedAt: Date.now(),
      });
      const trimmed = filtered.slice(0, 12);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {}
  }, [shirtNumber, displayName, firstName, photoUrl]);
  return null;
}
