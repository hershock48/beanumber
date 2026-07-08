'use client';

/**
 * ClaimGate — NEUTRALIZED 2026-07-08.
 *
 * Previously: soft conversion gate that blurred the bio section and
 * overlaid a "You bought #N. Claim it." card for buyers who hadn't
 * signed in yet. Removed per Kevin because the sign-in strip at the
 * top of the page ("Sponsoring monthly or hold a Be A Number shirt?
 * Sign in →") covers the same ask cleanly and doesn't interrupt the
 * reveal.
 *
 * Kept as a passthrough wrapper so the existing call-sites on
 * page.tsx don't need to change. All prior state / effect / render
 * code was deleted 2026-07-09 after the vestigial code caused a
 * production TypeScript build failure (dead-code references to the
 * un-underscored prop names post-neutralization).
 *
 * To reintroduce a claim gate later: replace this passthrough with a
 * proper implementation. The prop contract is unchanged so page.tsx
 * doesn't need updating.
 */

interface ClaimGateProps {
  shirtNumber: number;
  firstName: string;
  viewerLooksLikeBuyer: boolean;
  viewerIsRecognized: boolean;
  children: React.ReactNode;
}

export function ClaimGate({
  shirtNumber: _shirtNumber,
  firstName: _firstName,
  viewerLooksLikeBuyer: _viewerLooksLikeBuyer,
  viewerIsRecognized: _viewerIsRecognized,
  children,
}: ClaimGateProps) {
  return <>{children}</>;
}
