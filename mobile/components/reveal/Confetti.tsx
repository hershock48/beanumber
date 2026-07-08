/**
 * <Confetti />
 *
 * Gold-only, restrained (~14 pieces), silent. Falls behind the kid's
 * photo and fades before the name finishes typing. This is a warm
 * accent, not the event — if it starts to feel like a video-game win,
 * we cut it entirely per the 3.2 anti-pattern rule.
 *
 * Deterministic layout for the piece placement so QA gets consistent
 * frames; only fall + rotation are animated per piece.
 */
import React, { useEffect, useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { COLORS } from '../../lib/theme';

interface Props {
  pieces?: number;
  durationMs?: number;
}

// Uses a small PRNG so pieces don't cluster the same way across renders.
function pseudoRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

interface PieceSpec {
  x: number; // 0-1 horizontal spread
  size: number; // small: 4-8
  rotate: number; // starting rotation deg
  spin: number; // total spin over fall (deg)
  delay: number; // ms
  duration: number;
  shape: 'square' | 'circle';
}

export function Confetti({ pieces = 14, durationMs = 1600 }: Props) {
  const { width } = useWindowDimensions();

  const specs = useMemo<PieceSpec[]>(() => {
    const rand = pseudoRandom(42);
    return Array.from({ length: pieces }).map(() => ({
      x: rand(),
      size: 4 + Math.round(rand() * 4),
      rotate: rand() * 360,
      spin: (rand() - 0.5) * 720,
      delay: Math.round(rand() * 400),
      duration: durationMs + Math.round((rand() - 0.5) * 400),
      shape: rand() > 0.5 ? 'square' : 'circle',
    }));
  }, [pieces, durationMs]);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      {specs.map((spec, i) => (
        <ConfettiPiece key={i} spec={spec} screenWidth={width} />
      ))}
    </View>
  );
}

function ConfettiPiece({
  spec,
  screenWidth,
}: {
  spec: PieceSpec;
  screenWidth: number;
}) {
  const y = useSharedValue(-40);
  const opacity = useSharedValue(0);
  const rotation = useSharedValue(spec.rotate);

  useEffect(() => {
    // Fade in, fall, fade out over the piece's duration.
    opacity.value = withDelay(
      spec.delay,
      withTiming(0.9, { duration: 200 })
    );
    y.value = withDelay(
      spec.delay,
      withTiming(360, {
        duration: spec.duration,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    );
    rotation.value = withDelay(
      spec.delay,
      withTiming(spec.rotate + spec.spin, { duration: spec.duration })
    );

    // Fade out on second half of fall.
    const fadeOut = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 400 });
    }, spec.delay + spec.duration * 0.6);

    return () => clearTimeout(fadeOut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: spec.x * screenWidth - screenWidth / 2 },
      { translateY: y.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: screenWidth / 2,
          top: 0,
          width: spec.size,
          height: spec.size,
          backgroundColor: COLORS.gold,
          borderRadius: spec.shape === 'circle' ? spec.size / 2 : 1,
        },
        style,
      ]}
    />
  );
}
