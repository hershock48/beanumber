/**
 * Push notification client.
 *
 * Two responsibilities:
 *
 *   1. `registerForPushNotifications()` — asks Expo for a push token
 *      (requires the OS permission to already be granted) and POSTs
 *      it to /api/mobile/v1/push/register along with the device's
 *      IANA time zone. Idempotent — the server upserts on the token
 *      so calling this on every app launch is fine.
 *
 *   2. `requestPermissionIfAppropriate(kind, context)` — the
 *      *contextual* permission prompt. Never asked in onboarding.
 *      Instead: after a sponsor sends their first note, or when a
 *      holder returns to a kid page that has a fresh update, we
 *      show a native pre-prompt alert. If the user taps "Yes",
 *      we request the OS permission. Whatever they answer, we
 *      log to /log-prompt so a reinstall doesn't reset the 60-day
 *      cooldown.
 *
 * The default foreground notification handler is set at module
 * scope so the first import wires it up before any listener attaches.
 * We ask the OS to display the alert + play the sound while the app
 * is in the foreground — the design brief calls for the in-app gold
 * dot to replace numeric badges, so setShouldSetBadge is false.
 */
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from './api';

// Set once at module load. Called before any listener attaches
// because /_layout.tsx imports this file at app start.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Types ────────────────────────────────────────────────────────

export type PromptKind = 'monthly-first-note' | 'holder-first-return';

export interface PromptContext {
  kidFirstName: string;
}

// Local mirror of server-side push_prompt_history — a fast check
// before we hit the network. Server enforces the durable cooldown
// (60d) because AsyncStorage clears on reinstall.
const COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;
const PROMPT_HISTORY_KEY = 'push.promptHistory.v1';

interface StoredPromptRecord {
  kind: PromptKind;
  at: number; // epoch ms
  outcome: 'granted' | 'declined' | 'asked';
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Ask the OS + server for a push token and register it. Assumes the
 * caller already has notification permission (or is willing to
 * trigger the OS prompt). Returns the token on success, null on any
 * failure (permission denied, physical-device required, network).
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    // Simulators can't receive real pushes; abort cleanly.
    if (!Constants.isDevice) {
      return null;
    }

    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;
    if (finalStatus !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      finalStatus = req.status;
    }
    if (finalStatus !== 'granted') {
      return null;
    }

    if (Platform.OS === 'android') {
      // Same defaults on every install — the design brief covers
      // sound + priority, we don't need per-kind channels because
      // threadId does the grouping.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: 'default',
      });
    }

    // projectId is required in bare / EAS builds. Constants populates
    // it from app.json's extra.eas.projectId when built via `eas build`;
    // for Expo Go dev it's absent and getExpoPushTokenAsync uses the
    // ambient session.
    const projectId =
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)
        ?.projectId ?? Constants.easConfig?.projectId;

    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResp.data;
    if (!token) return null;

    // POST to the server. Failure here is non-fatal — the token is
    // still valid on the device; a later app launch will retry.
    try {
      const tz =
        Intl.DateTimeFormat().resolvedOptions().timeZone || null;
      await authFetch('/api/mobile/v1/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expoPushToken: token,
          platform: Platform.OS === 'android' ? 'android' : 'ios',
          tz,
        }),
      });
    } catch {
      // Swallow — next launch will retry.
    }
    return token;
  } catch {
    return null;
  }
}

/**
 * Called from the composer's post-send hook and the kid-page mount
 * hook. Never fires during onboarding — the call sites gate it on
 * "did the user just do the thing that earns this ask."
 */
export async function requestPermissionIfAppropriate(
  kind: PromptKind,
  context: PromptContext
): Promise<'granted' | 'declined' | 'skipped'> {
  // 0. If permission is already granted, register (idempotent) and
  //    move on — we don't need to nag.
  const perm = await Notifications.getPermissionsAsync();
  if (perm.status === 'granted') {
    await registerForPushNotifications();
    return 'granted';
  }

  // 1. Fast local cooldown — recent decline blocks the ask.
  const history = await loadHistory();
  const last = history
    .filter(r => r.kind === kind)
    .sort((a, b) => b.at - a.at)[0];
  if (last && Date.now() - last.at < COOLDOWN_MS) {
    return 'skipped';
  }

  // 2. Pre-prompt native alert with the copy from the design brief.
  const headline =
    kind === 'monthly-first-note'
      ? `Want to know when ${context.kidFirstName} writes back?`
      : `Want to hear when there's news from ${context.kidFirstName}?`;
  const supporting =
    kind === 'monthly-first-note'
      ? `The campus team translates the reply and pushes it to your phone.`
      : `New updates, notes, or student-of-the-month moments — nothing else.`;

  const willAsk = await new Promise<boolean>(resolve => {
    Alert.alert(headline, supporting, [
      {
        text: 'Not now',
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: 'Yes',
        style: 'default',
        isPreferred: true,
        onPress: () => resolve(true),
      },
    ]);
  });

  if (!willAsk) {
    await recordLocal({ kind, at: Date.now(), outcome: 'declined' });
    void logPromptOutcome(kind, 'declined');
    return 'declined';
  }

  // 3. Actual OS permission request.
  const req = await Notifications.requestPermissionsAsync();
  const granted = req.status === 'granted';
  await recordLocal({
    kind,
    at: Date.now(),
    outcome: granted ? 'granted' : 'declined',
  });
  void logPromptOutcome(kind, granted ? 'granted' : 'declined');
  if (granted) {
    await registerForPushNotifications();
    return 'granted';
  }
  return 'declined';
}

// ─── Deep-link plumbing ───────────────────────────────────────────

export interface PushDeepLinkPayload {
  deepLink?: string;
  kind?: string;
  kidId?: string;
  newsletterId?: string;
  threadId?: string;
}

/**
 * Turn an incoming Expo notification response into the string path
 * we hand to router.push(). Kept exported so the deep-link hook and
 * tests can share the same normalizer.
 */
export function deepLinkFromResponse(
  response: Notifications.NotificationResponse
): string | null {
  const data = (response?.notification?.request?.content?.data ?? {}) as
    | PushDeepLinkPayload
    | Record<string, unknown>;
  const deepLink =
    (data as PushDeepLinkPayload)?.deepLink ??
    (data as Record<string, unknown>)?.deepLink;
  if (typeof deepLink !== 'string' || !deepLink) return null;
  // Map web-style paths to native routes. The API server emits
  // /children/[N] and /newsletter/[id]; the app router uses the same
  // paths so no rewrites needed today.
  return deepLink;
}

// ─── Private helpers ──────────────────────────────────────────────

async function loadHistory(): Promise<StoredPromptRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(PROMPT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredPromptRecord[]) : [];
  } catch {
    return [];
  }
}

async function recordLocal(rec: StoredPromptRecord): Promise<void> {
  try {
    const history = await loadHistory();
    history.push(rec);
    // Keep it bounded — max 20 records, oldest first out.
    const trimmed = history.slice(-20);
    await AsyncStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // Non-fatal.
  }
}

async function logPromptOutcome(
  kind: PromptKind,
  outcome: 'granted' | 'declined'
): Promise<void> {
  try {
    await authFetch('/api/mobile/v1/push/log-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, outcome }),
    });
  } catch {
    // Non-fatal — local history is the primary defense against
    // repeat nagging within the same install.
  }
}
