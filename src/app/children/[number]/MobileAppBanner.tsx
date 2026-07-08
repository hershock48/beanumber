'use client';

/**
 * MobileAppBanner — slim "Open in Be A Number app" banner.
 *
 * Additive. Rendered above the reveal experience on /children/[N].
 * Server-rendered as null on desktop; on iOS/Android it hydrates and
 * shows a top strip. Two modes:
 *
 *   1. If the app is installed, tapping the banner fires the
 *      universal link (beanumber://meet/N). If that succeeds, the
 *      app takes over. If nothing happens after ~1.2s, we assume it
 *      isn't installed and fall through to (2).
 *
 *   2. If the app isn't installed, tapping the banner stamps a
 *      deferred-link row (via /api/mobile/v1/deferred-link/stamp)
 *      and redirects to the App Store / Play Store, carrying the
 *      shirt number in the URL as an SKAd campaign token
 *      (?ct=meet_N) for the belt-and-suspenders resolution path
 *      documented in the brief.
 *
 * DOES NOT auto-redirect. The banner is a nudge, not a takeover.
 * The web reveal continues to work if the user ignores or dismisses
 * the banner — that's the "preserve the existing web reveal
 * experience for desktop" rule in the task brief.
 *
 * Dismissal is remembered via localStorage for 24h, so we don't
 * pester a user who explicitly closed it earlier the same day.
 */

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'ban.mobileAppBanner.dismissedAt';
const DISMISS_WINDOW_MS = 24 * 60 * 60 * 1000;

interface Props {
  shirtNumber: number;
  kidFirstName: string;
  /** Which store to link to. Server pre-computes from UA. */
  platform: 'ios' | 'android';
  /**
   * Optional App Store / Play Store URLs. If missing we fall through
   * to the store search — Kevin can drop the real IDs in when the
   * app is approved.
   */
  iosStoreUrl?: string;
  androidStoreUrl?: string;
}

export function MobileAppBanner({
  shirtNumber,
  kidFirstName,
  platform,
  iosStoreUrl,
  androidStoreUrl,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      if (raw) {
        const at = parseInt(raw, 10);
        if (Number.isFinite(at) && Date.now() - at < DISMISS_WINDOW_MS) {
          return;
        }
      }
    } catch {
      /* localStorage unavailable — show the banner */
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const storeUrl =
    platform === 'ios'
      ? iosStoreUrl ||
        `https://apps.apple.com/us/app/be-a-number/id0000000000?ct=meet_${shirtNumber}`
      : androidStoreUrl ||
        `https://play.google.com/store/apps/details?id=org.beanumber.app&referrer=meet_${shirtNumber}`;

  async function handleOpen() {
    // 1. Stamp the deferred-link row. Fire-and-forget — we don't
    //    block the App Store hop on it.
    try {
      await fetch('/api/mobile/v1/deferred-link/stamp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPath: `/meet/${shirtNumber}`,
          shirtNumber,
          source: 'children_banner',
        }),
        keepalive: true,
      });
    } catch {
      /* non-fatal */
    }

    // 2. Try the custom-scheme deep link first. If the app is
    //    installed, iOS/Android will hand control over before the
    //    setTimeout fires. If not, we fall through to the store.
    const start = Date.now();
    const timeout = setTimeout(() => {
      // Only redirect if we're still visible — universal-link
      // capture sends us to the background, in which case
      // document.visibilityState becomes 'hidden' and this branch
      // is skipped.
      if (document.visibilityState === 'visible' && Date.now() - start > 1000) {
        window.location.href = storeUrl;
      }
    }, 1200);

    // Custom scheme first (matches the app's `scheme: "beanumber"`).
    window.location.href = `beanumber://meet/${shirtNumber}`;

    // Cleanup if the tab is put into the background (i.e. the app
    // took over). Not strictly necessary but keeps the console clean.
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(timeout);
        document.removeEventListener('visibilitychange', onHide);
      }
    };
    document.addEventListener('visibilitychange', onHide);
  }

  function handleDismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Open in the Be A Number app"
      className="sticky top-0 z-40 w-full bg-[#0d0d0d] text-[#FFF8F0] shadow-md"
    >
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-[#D4A843] font-bold">
            Meet {kidFirstName} in the app
          </p>
          <p className="text-sm text-[#FFF8F0]/85 truncate">
            Sharper reveal, push updates, and letters in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpen}
          className="whitespace-nowrap px-3 py-2 bg-[#D4A843] hover:bg-[#c49a3a] text-[#0d0d0d] font-bold text-xs uppercase tracking-wider transition-colors"
        >
          Open
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="text-[#FFF8F0]/60 hover:text-[#FFF8F0] px-1 text-xl leading-none"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
