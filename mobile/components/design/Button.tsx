/**
 * <Button /> — the button primitive.
 *
 * Three variants (primary / secondary / ghost) + a disabled state.
 * Enforces the token rules from `theme.ts`:
 *   - primary: gold background, ink text, radius 12, one per screen
 *     (the "one primary above the fold" rule is not code-enforced,
 *     but violating it is a design bug — the reviewer catches it)
 *   - secondary: ink background, cream text
 *   - ghost: transparent, ink text, no border at rest
 *   - disabled: 40% opacity, no color change, no interaction
 *
 * Pressed state (F1 spec): scale 0.98 + 8% darken, 150ms. Achieved
 * with Reanimated so the animation feels tactile even under load.
 *
 * Haptic on primary press: `.light` — matches the rhythm of the
 * reveal-moment haptics for coherence across the app.
 */
import React from 'react';
import { Pressable, ViewStyle, ActivityIndicator } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS, RADIUS, TEXT_STYLES } from '../../lib/theme';
import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props {
  variant?: Variant;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** When true, uses pill radius (999) — reveal button, some primary CTAs. */
  pill?: boolean;
  /** Optional style escape hatch (positioning only, never override tokens). */
  style?: ViewStyle;
  children: React.ReactNode;
}

const VARIANT_COLORS: Record<
  Variant,
  { bg: string; text: 'ink' | 'cream'; showBorder: boolean }
> = {
  primary: { bg: COLORS.gold, text: 'ink', showBorder: false },
  secondary: { bg: COLORS.ink, text: 'cream', showBorder: false },
  ghost: { bg: 'transparent', text: 'ink', showBorder: false },
};

export function Button({
  variant = 'primary',
  onPress,
  disabled = false,
  loading = false,
  fullWidth = false,
  pill = false,
  style,
  children,
}: Props) {
  const scale = useSharedValue(1);
  const darken = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: darken.value,
  }));

  const colors = VARIANT_COLORS[variant];

  const handlePressIn = () => {
    scale.value = withTiming(0.98, {
      duration: 150,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    darken.value = withTiming(0.08, { duration: 150 });
    if (variant === 'primary' && !disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 150 });
    darken.value = withTiming(0, { duration: 150 });
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[
        {
          backgroundColor: colors.bg,
          borderRadius: pill ? RADIUS.pill : RADIUS.button,
          paddingVertical: 14,
          paddingHorizontal: 24,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 52,
          opacity: disabled ? 0.4 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          overflow: 'hidden',
        },
        style,
        animatedStyle,
      ]}
    >
      {/* Darken overlay for pressed state. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: COLORS.ink,
          },
          overlayStyle,
        ]}
      />
      {loading ? (
        <ActivityIndicator
          color={colors.text === 'ink' ? COLORS.ink : COLORS.cream}
        />
      ) : typeof children === 'string' ? (
        <Text
          variant="body"
          color={colors.text}
          style={{
            fontFamily: TEXT_STYLES.h3.fontFamily, // Inter Semibold
            fontSize: 17,
          }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </AnimatedPressable>
  );
}
