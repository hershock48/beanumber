'use client';

import { useEffect } from 'react';

// Silent, mount-only beacon. When a logged-in sponsor lands on their own
// child's page (e.g. after their shirt arrived and they typed the number
// into beanumber.org), this fires a POST to /api/sponsor/reveal to flip
// the ChildRevealedAt flag on their sponsorship record. The server
// validates that the visitor actually has a sponsor session AND that the
// number on the page matches their assignment; otherwise it no-ops.
//
// This component renders nothing and never surfaces UI. Any failure is
// silently swallowed — we don't want to alarm non-sponsor visitors
// browsing the child pages.

interface RevealBeaconProps {
  number: number;
}

export function RevealBeacon({ number }: RevealBeaconProps) {
  useEffect(() => {
    if (!Number.isFinite(number) || number <= 0) return;
    const controller = new AbortController();

    fetch('/api/sponsor/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number }),
      credentials: 'include',
      signal: controller.signal,
    }).catch(() => {
      // Intentionally swallow. A user without a sponsor cookie gets a
      // benign no-op response; transient network errors shouldn't
      // surface to non-sponsor visitors reading a child's profile.
    });

    return () => controller.abort();
  }, [number]);

  return null;
}
