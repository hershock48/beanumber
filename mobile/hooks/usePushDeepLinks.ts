/**
 * usePushDeepLinks — attaches Expo notification listeners so a tap
 * on any BAN push routes into the app.
 *
 * Two scenarios:
 *   1. Cold start — the user tapped a notification while the app was
 *      terminated. Expo hands us the response via
 *      getLastNotificationResponseAsync() on mount.
 *   2. Warm — the app was already running (foreground or background).
 *      addNotificationResponseReceivedListener() catches those.
 *
 * Wired once in the root layout (see app/_layout.tsx). Safe to
 * call multiple times; the listener refs are torn down on unmount.
 */
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { deepLinkFromResponse } from '../lib/push';

export function usePushDeepLinks(): void {
  const router = useRouter();
  const consumedInitialRef = useRef(false);

  useEffect(() => {
    // Cold-start check: was the app launched by tapping a push?
    (async () => {
      if (consumedInitialRef.current) return;
      consumedInitialRef.current = true;
      try {
        const initial = await Notifications.getLastNotificationResponseAsync();
        if (!initial) return;
        const path = deepLinkFromResponse(initial);
        if (path) router.push(path as never);
      } catch {
        // Non-fatal — the user can still navigate manually.
      }
    })();

    const sub = Notifications.addNotificationResponseReceivedListener(
      response => {
        const path = deepLinkFromResponse(response);
        if (path) router.push(path as never);
      }
    );
    return () => sub.remove();
  }, [router]);
}
