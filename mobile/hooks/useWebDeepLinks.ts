/**
 * useWebDeepLinks — attaches expo-linking listeners so a
 * https://beanumber.org/… universal link OR a beanumber://… custom
 * scheme opens the corresponding in-app route.
 *
 * Coexists with usePushDeepLinks — they handle different sources:
 *
 *   - usePushDeepLinks reads the notification `data.deepLink` and
 *     fires on notification tap.
 *   - useWebDeepLinks reads Linking.getInitialURL() + subscribes to
 *     Linking.addEventListener('url').
 *
 * The two never handle the same event: notifications don't emit
 * URL events, and universal-link taps don't emit notification
 * responses. Both hooks run in the root layout without stepping on
 * each other.
 *
 * The reveal moment is preserved end-to-end: whether the number
 * arrives via QR scan, email link, push tap, or manual entry, the
 * route ends at /meet/[N] and the HoldButton still runs. NEVER
 * bypass the hold — that's the non-negotiable in the design brief.
 */

import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { resolveIncomingUrl } from '../lib/deepLink';

export function useWebDeepLinks(): void {
  const router = useRouter();
  const consumedInitialRef = useRef(false);

  useEffect(() => {
    // Cold-start check: was the app launched by tapping a link?
    (async () => {
      if (consumedInitialRef.current) return;
      consumedInitialRef.current = true;
      try {
        const initial = await Linking.getInitialURL();
        const target = resolveIncomingUrl(initial);
        if (target) router.push(target as never);
      } catch {
        // Non-fatal — the user can still navigate manually.
      }
    })();

    // Warm case: the app was already running when the URL arrived.
    const sub = Linking.addEventListener('url', event => {
      const target = resolveIncomingUrl(event.url);
      if (target) router.push(target as never);
    });
    return () => sub.remove();
  }, [router]);
}
