/**
 * <Card /> — the surface primitive.
 *
 * Every non-hero content block uses this. Defaults per 3.8 tokens:
 * cream background, 12pt radius, elevation 1, 16pt internal padding.
 *
 * Props:
 *   - variant: 'default' (r=12, e1) | 'large' (r=16, e1) | 'newsletter' (r=16, e2)
 *   - padded (bool, default true) — set false when children need full-bleed
 *   - onPress — optional; when set, Pressable + press-state feedback
 */
import React from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, ELEVATION, RADIUS, SPACING } from '../../lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'default' | 'large' | 'newsletter';

interface Props {
  variant?: Variant;
  padded?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  children: React.ReactNode;
}

const VARIANT_MAP: Record<
  Variant,
  { radius: number; elevation: typeof ELEVATION.e1 }
> = {
  default: { radius: RADIUS.card, elevation: ELEVATION.e1 },
  large: { radius: RADIUS.cardLarge, elevation: ELEVATION.e1 },
  newsletter: { radius: RADIUS.cardLarge, elevation: ELEVATION.e2 },
};

export function Card({
  variant = 'default',
  padded = true,
  onPress,
  style,
  children,
}: Props) {
  const scale = useSharedValue(1);
  const config = VARIANT_MAP[variant];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const baseStyle: ViewStyle = {
    backgroundColor: COLORS.cream,
    borderRadius: config.radius,
    ...config.elevation,
    ...(padded ? { padding: SPACING.l } : null),
  };

  if (!onPress) {
    return <View style={[baseStyle, style]}>{children}</View>;
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.985, { duration: 150 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 150 });
      }}
      style={[baseStyle, style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
