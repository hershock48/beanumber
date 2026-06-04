/**
 * Haptics wrapper. expo-haptics is a no-op on web, so calls are
 * safe everywhere. Web preview ignores them gracefully.
 */
import * as Haptics from 'expo-haptics';

export function tap() {
  Haptics.selectionAsync().catch(() => {});
}

export function press() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function success() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {}
  );
}

export function warning() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
    () => {}
  );
}

export function error() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    () => {}
  );
}
