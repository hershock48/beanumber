/**
 * useDeferredLink — the "install-first, meet-your-kid-second" hook.
 *
 * On first-open (per install), we ping /api/mobile/v1/deferred-link/resolve.
 * The endpoint looks for a pending_deferred_links row keyed to our
 * device's (IP + UA) fingerprint. If it finds one — because the same
 * device just hit /children/[N] on the web and tapped "Open in the
 * app" — we get the target path back and route there. The reveal
 * screen then lands on /meet/N with no manual entry.
 *
 * Runs at most once per install (guarded by AsyncStorage). If the
 * endpoint returns no match, that's fine — the app opens its normal
 * home screen and the user can navigate manually.
 *
 * Does NOT step on:
 *   - usePushDeepLinks (different event source, notification data)
 *   - useWebDeepLinks (fires only when Linking has an actual URL;
 *     if we're already routing because of a live universal link,
 *     the deferred-link path is redundant and both landing on the
 *     same route is idempotent — router.push twice on the same path
 *     is a no-op in Expo Router).
 *
 * The reveal-moment ritual is preserved. The route target is a path
 * like /meet/48; the reveal screen still requires a hold to unlock.
 */

import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { API_BASE_URL } from '../lib/api';
import { resolveIncomingUrl } from '../lib/deepLink';

const CHECKED_KEY = 'deferredLink.checked.v1';

export function useDeferredLink(): void {
  const router = useRouter();
  const ranRef = useRef(false);

  useEffect(() => {
    (async () => {
      if (ranRef.current) return;
      ranRef.current = true;

      try {
        const already = await AsyncStorage.getItem(CHECKED_KEY);
        if (already) return; // Only fire on the first-open per install.
      } catch {
        /* AsyncStorage failure — proceed anyway, worst case we
           double-fire once and the endpoint returns null the second
           time because the row is single-use. */
      }

      // Mark as checked BEFORE the network call so a slow response
      // + fast quit-and-relaunch doesn't produce two resolves. The
      // server row is single-use anyway, but this is cheaper.
      try {
        await AsyncStorage.setItem(CHECKED_KEY, String(Date.now()));
      } catch {
        /* non-fatal */
      }

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/mobile/v1/deferred-link/resolve`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          ok?: boolean;
          targetPath?: string | null;
        };
        if (!body?.targetPath) return;

        // Route the returned path through the same normalizer the
        // web-URL listener uses, so an unknown path (e.g. injected
        // via a compromised endpoint response) can't push to an
        // arbitrary route.
        const target = resolveIncomingUrl(
          `https://beanumber.org${body.targetPath}`
        );
        if (target) {
          router.push(target as never);
        }
      } catch {
        // Network failure — graceful no-op. The user still gets the
        // app's home screen.
      }
    })();
  }, [router]);
}
