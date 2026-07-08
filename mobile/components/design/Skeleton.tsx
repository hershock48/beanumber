/**
 * <Skeleton /> — loading shimmer.
 *
 * Cream → paper shimmer at ~60 BPM. Never grey, never blue, never a
 * spinner. Every loading placeholder in the app uses this.
 *
 * Props are simple: width, height, radius. Compose multiple skeletons
 * for complex placeholders (kid card, feed post, etc.).
 */
import React, { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { COLORS, RADIUS } from '../../lib/theme';

interface Props {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: any;
}

// 60 BPM = 1000ms per full cycle. Split as 500ms in / 500ms out via reverse.
const CYCLE_MS = 1000;

export function Skeleton({
  width = '100%',
  height = 20,
  radius = RADIUS.smallCard,
  style,
}: Props) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, {
        duration: CYCLE_MS,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      }),
      -1,
      true
    );
  }, [t]);

  const animated = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      t.value,
      [0, 1],
      [COLORS.cream, COLORS.paper]
    ),
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
        },
        animated,
        style,
      ]}
    />
  );
}
