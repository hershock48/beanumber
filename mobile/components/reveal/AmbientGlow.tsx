/**
 * <AmbientGlow />
 *
 * The warm halo behind the reveal button. Pulses at ~60 BPM (calm
 * resting heart rate) — the only idle animation in the entire app.
 *
 * Spec (from 3.2 annotations):
 *   - 340pt diameter default
 *   - Peak alpha 0.16, min 0.10 (during pulse)
 *   - Scale 1.0 ↔ 1.06 (during pulse)
 *   - Radial fade to 0 at ~70% radius
 *   - Optional intensified mode during hold (alpha up to 0.22,
 *     diameter grows to 360)
 *
 * Rendered as an SVG radial gradient — react-native-svg is already
 * a dep. Reanimated drives the alpha + scale changes so the pulse
 * doesn't stutter under load.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Circle,
} from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { COLORS } from '../../lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** true after touch-down; glow intensifies with hold fill (0–1). */
  intensity?: number; // 0 = idle pulse; > 0 = hold-driven boost
  /** Default 340. Grows toward 360 as intensity rises. */
  baseDiameter?: number;
}

// Pulse cycle: half at 60 BPM = 500ms in, 500ms out.
const PULSE_MS = 1000;

export function AmbientGlow({
  intensity = 0,
  baseDiameter = 340,
}: Props) {
  // Base heartbeat pulse — runs forever.
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, {
        duration: PULSE_MS,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      }),
      -1, // infinite
      true // reverse
    );
  }, [pulse]);

  const scale = 1 + baseDiameter / 340; // stub; final scale in animatedStyle

  const wrapperStyle = useAnimatedStyle(() => {
    // Base scale 1.0 ↔ 1.06 during idle pulse; intensity nudges it toward 1.06 baseline.
    const idleScale = 1 + pulse.value * 0.06;
    const intensityScale = 1 + intensity * 0.02;
    return { transform: [{ scale: idleScale * intensityScale }] };
  });

  const animatedProps = useAnimatedProps(() => {
    // Alpha: idle 0.10 ↔ 0.16, intensified goes up to 0.22.
    const idleAlpha = 0.1 + pulse.value * 0.06;
    const intensifiedAlpha = idleAlpha + intensity * 0.06;
    return { opacity: intensifiedAlpha };
  });

  const size = baseDiameter + intensity * 20; // 340 → 360 during hold

  return (
    <View
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View style={wrapperStyle}>
        <Svg width={size} height={size}>
          <Defs>
            {/*
              Radial gradient: gold at center, fully transparent at 70% radius.
              Stop offsets chosen so the fall-off feels warm but doesn't clip
              against the cream background as a hard edge.
            */}
            <RadialGradient id="ambient" cx="50%" cy="50%" r="70%">
              <Stop offset="0%" stopColor={COLORS.gold} stopOpacity={1} />
              <Stop offset="45%" stopColor={COLORS.gold} stopOpacity={0.5} />
              <Stop offset="100%" stopColor={COLORS.gold} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={size / 2}
            fill="url(#ambient)"
            animatedProps={animatedProps}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
