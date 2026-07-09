'use client';

/**
 * PenpalBoxSponsorCta — the gold CTA button on the frosted PenpalBox
 * for holders + signed-in visitors who don't yet sponsor this kid.
 *
 * Kicks off the same /api/create-sponsor-checkout flow SponsorButton
 * uses. Returns a Stripe Checkout URL on success; we redirect. On
 * failure we surface the error inline instead of leaving the button
 * looking dead — Kevin's audit caught the previous version linking
 * to /children/N?intent=sponsor which nothing read.
 *
 * Two variants of the same call:
 *   - holder            → "Sponsor {firstName} — $25/month"
 *   - signed_in_visitor → "Sponsor {firstName} too — $25/month"
 *
 * The distinction is only copy — the API request is identical.
 * Anon visitors use a plain <Link href="/signin?n=N"> upstream; this
 * component doesn't render for them.
 */

import { useState, useEffect } from 'react';

export interface PenpalBoxSponsorCtaProps {
  firstName: string;
  childRecordId: string;
  childId: string;
  childDisplayName: string;
  /** Copy variant. Determines the "too" suffix on the button label. */
  variant: 'holder' | 'signed_in_visitor';
}

export function PenpalBoxSponsorCta({
  firstName,
  childRecordId,
  childId,
  childDisplayName,
  variant,
}: PenpalBoxSponsorCtaProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // bfcache restore — Safari + Firefox restore the page with prior
  // React state intact after a Stripe hop, so the button would look
  // stuck at "Redirecting…". Reset on pageshow.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setLoading(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  // Both signed-in variants now use the same CTA copy. Kevin dropped
  // the "too" qualifier 2026-07-09 — sponsors on the signed_in_visitor
  // path don't need to be told they're adding on; the "Add [Kid] to
  // your campus" header already frames it, and "Sponsor Joan — $25/month"
  // reads cleaner than "Sponsor Joan too — $25/month" in the button.
  const label = loading
    ? 'Redirecting…'
    : `Sponsor ${firstName} — $25/month`;

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/create-sponsor-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          childRecordId,
          childId,
          childDisplayName,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // The API returns 401 with a shirt-first redirect target when
        // the caller isn't already a sponsor + doesn't have a shirt
        // buyer cookie — CLAUDE.md non-negotiable #4. Surface the API's
        // message when present, otherwise a generic retry line.
        setError(
          data?.error || 'Could not start checkout. Try again in a moment.'
        );
        setLoading(false);
        return;
      }
      if (data?.url) {
        // Hand off to Stripe. Keep loading=true so the button doesn't
        // look interactable during the hop.
        window.location.href = data.url as string;
        return;
      }
      setError('Checkout returned no redirect URL. Try again.');
      setLoading(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Network hiccup. Try again.'
      );
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-8 hover:bg-[#c49a3a] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {label}
      </button>
      {error && (
        <p className="text-sm text-[#c0392b] mt-3 leading-relaxed">
          {error}
        </p>
      )}
    </>
  );
}
