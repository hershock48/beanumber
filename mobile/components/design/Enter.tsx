/**
 * <Enter /> — the entrance animation for screen sections.
 *
 * Every section fades up 12pt with a stagger as the screen mounts.
 * This is most of what "alive vs. dead" means on mobile: a screen
 * that assembles itself reads as breathing; one that snaps in reads
 * as a document. One primitive, used everywhere, so the whole app
 * enters the same way (400ms, gentle ease, 70ms stagger steps).
 *
 * Usage: <Enter index={2}><Section /></Enter> — index is the
 * stagger slot, not a required sequence; skipping numbers is fine.
 */
import React from 'react';
import Animated, { FadeInUp } from 'react-native-reanimated';
import type { ViewStyle, StyleProp } from 'react-native';

interface Props {
  children: React.ReactNode;
  /** Stagger slot — delay = index * 70ms. */
  index?: number;
  style?: StyleProp<ViewStyle>;
}

export function Enter({ children, index = 0, style }: Props) {
  return (
    <Animated.View
      entering={FadeInUp.duration(400)
        .delay(index * 70)
        .springify()
        .damping(18)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
