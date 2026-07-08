/**
 * Deferred deep-link helpers.
 *
 * The QR code on a shirt encodes https://beanumber.org/meet/[N]?src=qr.
 * If the app IS installed, Universal Links intercept the URL and the
 * app opens on /meet/[N] directly. If the app is NOT installed, the
 * web page at /children/[N] (which serves as the mobile fallback for
 * that URL after the smart-open banner detects a mobile UA) stamps a
 * row into pending_deferred_links keyed to a fingerprint of the
 * requesting device. On first-open, the mobile app posts that same
 * fingerprint to /api/mobile/v1/deferred-link/resolve and gets the
 * path back — the reveal screen then lands on /meet/N without the
 * user typing anything.
 *
 * Fingerprint is sha256(ip + '|' + normalizedUserAgent). We
 * deliberately normalize (lowercase, strip version numbers) so the
 * "install the App Store app, launch the fresh app" path — where UA
 * changes from Safari to Expo Runtime — still matches. Precision is
 * traded for recall on purpose: the 10-minute window + single-use
 * flag mean a false match at the edge is bounded and self-healing.
 *
 * NOTE: This is a best-effort mechanism. Kevin's brief calls out that
 * Apple killed Branch-style deferred deep-linking; nothing works
 * 100%. The App Store campaign token (?ct=) is the belt-and-suspenders
 * fallback documented in the brief but not implemented here.
 */

import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * Extract the best-guess client IP from a NextRequest. Vercel puts
 * the client IP in x-forwarded-for; we take the FIRST entry (Vercel's
 * documented client-IP position).
 */
export function clientIpFrom(req: NextRequest | Request): string {
  const headers = 'headers' in req ? req.headers : new Headers();
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

/**
 * Normalize a user-agent string to something more stable across the
 * QR-scan → App Store → first-open transition. Strips version numbers
 * and lowercase everything. Not for security purposes — just for
 * matching two hits from the same device.
 */
export function normalizeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'unknown';
  return ua
    .toLowerCase()
    // Strip version numbers ("safari/604.1" → "safari").
    .replace(/\/[\d.]+/g, '')
    // Strip parenthesized OS build details ("(iphone; cpu ...)" → "").
    .replace(/\([^)]*\)/g, '')
    // Collapse runs of whitespace.
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build the fingerprint string. sha256(ip + '|' + normalizedUA).
 * Never contains the raw IP or the raw UA — the row in Postgres is
 * derived, so we don't retain either past the 10-minute window.
 */
export function buildFingerprint(ip: string, userAgent: string | null): string {
  const normalized = normalizeUserAgent(userAgent);
  return createHash('sha256').update(`${ip}|${normalized}`).digest('hex');
}

/** Convenience wrapper — pass a NextRequest and get a fingerprint. */
export function fingerprintFromRequest(req: NextRequest | Request): string {
  const ua = req.headers.get('user-agent');
  const ip = clientIpFrom(req);
  return buildFingerprint(ip, ua);
}

/** Ten minutes past `from`, as a Date. */
export function tenMinutesFromNow(from: Date = new Date()): Date {
  return new Date(from.getTime() + 10 * 60 * 1000);
}

/**
 * Quick mobile-UA sniff. Deliberately loose — the smart-open banner
 * has two states (install button vs "already have it? open the app")
 * and the cost of a false positive is showing a banner to a desktop
 * user for one second before they scroll past it.
 */
export function isMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /iphone|ipad|ipod|android/i.test(ua);
}

/**
 * Split "iOS" vs "Android" for the smart-open banner's App Store
 * link. Returns null for anything not obviously one of those.
 */
export function detectPlatform(
  ua: string | null | undefined
): 'ios' | 'android' | null {
  if (!ua) return null;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return null;
}
