/**
 * <HoldButton />
 *
 * The interactive circle at the heart of the reveal moment.
 *
 * Spec (from 3.2 annotations — this is the make-or-break element):
 *   - 220pt ink circle, gold number in Lora Regular 64 at center.
 *   - Touch down: light haptic, ring appears immediately, glow intensifies.
 *   - Hold: gold ring fills clockwise from 12 o'clock over 2.8s.
 *   - Milestones: discrete light taps at 33% and 66%.
 *   - Filling haptic approximation: light tap every ~420ms (until CoreHaptics).
 *   - Button pulses subtly (1.0 ↔ 1.04) at heartbeat rhythm during hold.
 *   - Ring track: 6pt stroke, charcoal @8%, radius 124 (10pt clear of button).
 *   - Ring fill: 6pt gold, rounded caps, linear with hold time.
 *   - Release early: ring drains smoothly to zero over 600ms, silent forgiveness.
 *   - Completion: strong success haptic + fires `onComplete`.
 *   - Reduced motion: mechanic preserved, transition skipped (caller handles).
 *
 * Everything about this component's feel matters. Do not change the
 * timings, easings, or haptic pattern without on-device testing.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Text as RNText } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  runOnJS,
  cancelAnimation,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS, FONT_FAMILIES } from '../../lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const HOLD_DURATION_MS = 2800;
const BUTTON_DIAMETER = 220;
const RING_RADIUS = 124; // 10pt clear of button (button r=110)
const RING_STROKE = 6;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// Filling-haptic cadence during hold. Placeholder for CoreHaptics
// rumble — see lib/haptics.ts. Discrete taps every ~420ms feels
// approximately heartbeat-adjacent.
const FILLING_HAPTIC_INTERVAL_MS = 420;

interface Props {
  number: number;
  onComplete: () => void;
  /** Reveal progress 0-1, forwarded so parent can intensify the ambient glow. */
  onProgressChange?: (progress: number) => void;
  disabled?: boolean;
}

export function HoldButton({
  number,
  onComplete,
  onProgressChange,
  disabled = false,
}: Props) {
  const progress = useSharedValue(0); // 0 → 1
  const pulseScale = useSharedValue(1);
  const isHolding = useRef(false);
  const holdStartTime = useRef(0);
  const rafId = useRef<number | null>(null);
  const fillingHapticTimer = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const milestoneFired = useRef({ p33: false, p66: false });

  // ─── Milestone haptics ──────────────────────────────────────────────
  const fireMilestone = useCallback((label: '33' | '66') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const fireCompletion = useCallback(() => {
    // Strong success haptic. The follow-up two taps at 900ms and 1400ms
    // fire from the parent screen (via lib/haptics.ts:revealCompletion)
    // so they can be aligned with the actual photo-entrance animation.
    Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success
    ).catch(() => {});
    onComplete();
  }, [onComplete]);

  const emitProgress = useCallback(
    (p: number) => {
      onProgressChange?.(p);
    },
    [onProgressChange]
  );

  // ─── Hold loop ──────────────────────────────────────────────────────
  const startHold = () => {
    if (disabled || isHolding.current) return;
    isHolding.current = true;
    holdStartTime.current = Date.now() - progress.value * HOLD_DURATION_MS;
    milestoneFired.current = { p33: false, p66: false };

    // Touch-down haptic.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Button subtle pulse (1.0 ↔ 1.04) at heartbeat rhythm during hold.
    pulseScale.value = withRepeat(
      withTiming(1.04, {
        duration: 500,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      }),
      -1,
      true
    );

    // Filling haptic approximation — discrete light taps every 420ms.
    // Kill on release; retry on next hold.
    fillingHapticTimer.current = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, FILLING_HAPTIC_INTERVAL_MS);

    // rAF loop drives progress + milestone checks in JS so haptic timing
    // matches the visual ring precisely.
    const step = () => {
      if (!isHolding.current) return;
      const elapsed = Date.now() - holdStartTime.current;
      const p = Math.min(elapsed / HOLD_DURATION_MS, 1);
      progress.value = p;
      emitProgress(p);

      if (p >= 0.33 && !milestoneFired.current.p33) {
        milestoneFired.current.p33 = true;
        fireMilestone('33');
      }
      if (p >= 0.66 && !milestoneFired.current.p66) {
        milestoneFired.current.p66 = true;
        fireMilestone('66');
      }
      if (p >= 1) {
        stopHoldInternal();
        // Small microtask delay so the visual state settles before the
        // parent flips into the transition.
        setTimeout(fireCompletion, 60);
        return;
      }
      rafId.current = requestAnimationFrame(step);
    };
    rafId.current = requestAnimationFrame(step);
  };

  const stopHoldInternal = () => {
    isHolding.current = false;
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    if (fillingHapticTimer.current) {
      clearInterval(fillingHapticTimer.current);
      fillingHapticTimer.current = null;
    }
    cancelAnimation(pulseScale);
    pulseScale.value = withTiming(1, { duration: 200 });
  };

  const releaseEarly = () => {
    if (progress.value >= 1) return; // completion path handled separately
    stopHoldInternal();
    // Silent forgiveness — drain ring over 600ms, no haptic.
    progress.value = withTiming(0, {
      duration: 600,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    emitProgress(0);
  };

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      if (fillingHapticTimer.current)
        clearInterval(fillingHapticTimer.current);
    };
  }, []);

  // ─── Visual layers ──────────────────────────────────────────────────

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const ringProps = useAnimatedProps(() => {
    // strokeDashoffset shrinks as progress grows.
    const dashOffset = interpolate(
      progress.value,
      [0, 1],
      [RING_CIRCUMFERENCE, 0],
      Extrapolation.CLAMP
    );
    return { strokeDashoffset: dashOffset };
  });

  const trackProps = useAnimatedProps(() => {
    // Track appears when progress > 0 (touch-down).
    return { opacity: progress.value > 0 ? 1 : 0 };
  });

  const size = RING_RADIUS * 2 + RING_STROKE * 2 + 20; // extra padding for touch target

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Ring — track + fill. Rendered behind the button. */}
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        {/* Track: light charcoal at 8%. Fades in on touch. */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={RING_RADIUS}
          stroke={COLORS.charcoal}
          strokeOpacity={0.08}
          strokeWidth={RING_STROKE}
          fill="none"
          animatedProps={trackProps}
        />
        {/*
          Fill: gold, rounded caps, starts at 12 o'clock and fills
          clockwise. Rotation -90° puts the start at the top; the
          stroke dash draws clockwise by default.
        */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={RING_RADIUS}
          stroke={COLORS.gold}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          animatedProps={ringProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {/* Button — animated pulse wrapper + Pressable + number */}
      <Animated.View style={pulseStyle}>
        <Pressable
          accessibilityLabel={`Hold to meet number ${number}`}
          accessibilityRole="button"
          accessibilityHint="Hold your finger down until the ring completes to meet the kid on the other end of this number."
          onPressIn={startHold}
          onPressOut={releaseEarly}
          disabled={disabled}
          style={{
            width: BUTTON_DIAMETER,
            height: BUTTON_DIAMETER,
            borderRadius: BUTTON_DIAMETER / 2,
            backgroundColor: COLORS.ink,
            alignItems: 'center',
            justifyContent: 'center',
            // Small e2-ish shadow to lift it off the cream.
            shadowColor: '#1e1408',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.06,
            shadowRadius: 16,
            elevation: 2,
            opacity: disabled ? 0.4 : 1,
          }}
        >
          <RNText
            style={{
              fontFamily: FONT_FAMILIES.loraRegular,
              fontSize: 64,
              color: COLORS.gold,
              lineHeight: 72,
            }}
          >
            #{number}
          </RNText>
        </Pressable>
      </Animated.View>
    </View>
  );
}
