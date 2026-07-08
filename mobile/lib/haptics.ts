/**
 * Haptics wrapper. Every haptic call in the app goes through this
 * file so the reveal-moment rhythm stays consistent across surfaces.
 *
 * expo-haptics no-ops on web and simulator — calls are safe everywhere.
 *
 * The reveal-moment pattern (see 3.2 annotations):
 *   - touch down            → light impact
 *   - filling (continuous)  → CoreHaptics rumble, intensity rises with fill
 *   - 33% / 66%             → discrete light taps
 *   - completion            → notification success
 *   - transition (photo in) → two soft light taps
 *   - landed (page settled) → single light tap
 *
 * The continuous filling rumble requires CoreHaptics via a native
 * module — expo-haptics doesn't expose it yet. Interim spec: substitute
 * discrete light taps at 15% intervals during the hold. Coarser than
 * the ideal, but ships with expo-haptics as-is. When a CoreHaptics
 * bridge lands, swap `fillingContinuous` to the real API.
 */
import * as Haptics from 'expo-haptics';

async function safe<T>(fn: () => Promise<T>): Promise<void> {
  try {
    await fn();
  } catch {
    // no-op on web / simulator / when hardware unavailable
  }
}

/** Light tap. Uses: touch-down, milestone tap, button press, landing. */
export function light() {
  return safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Medium impact. Uses: state confirmation (e.g., photo attached). */
export function medium() {
  return safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Success. Uses: reveal completion, note sent, code redeemed. */
export function success() {
  return safe(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  );
}

/** Warning. Uses: destructive action confirm, unsaved changes prompt. */
export function warning() {
  return safe(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
  );
}

/** Error. Uses: send failure, network drop. */
export function errorHaptic() {
  return safe(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  );
}

/**
 * Reveal-moment "filling" haptic. Discrete-tap approximation of the
 * intended continuous rumble — see file header. Fires at ~15% fill
 * intervals starting after touch-down.
 *
 * Call this from the hold controller's frame loop, not here.
 */
export function fillingTap() {
  return light();
}

/**
 * Reveal-moment completion pattern: strong success haptic followed by
 * two soft taps timed to the photo-entrance beat. This is called ONCE
 * at ring completion — the two follow-up taps are deferred internally
 * so callers don't juggle timers.
 */
export function revealCompletion() {
  return safe(async () => {
    await Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success
    );
    // Two soft taps as the photo enters. Delays match the 1.4s photo
    // fade + scale + type-on choreography from 3.2 annotations.
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, 900);
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, 1400);
  });
}
