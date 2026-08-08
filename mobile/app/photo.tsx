/**
 * /photo — full-screen photo viewer.
 *
 * Modal presentation. Used anywhere a tappable photo lives (kid page
 * latest update, updates sub-view, campus feed). Params:
 *   ?url=<encoded photo url>&caption=<optional caption>
 *
 * Gestures:
 *   - Pinch to zoom (min 1x, max 4x, snaps back below 1x)
 *   - Two-finger pan while zoomed
 *   - Single-finger pan-down to dismiss (velocity or ~120pt drag)
 *   - Double-tap to zoom in to 2x, or back out to 1x
 *
 * Background fades from opaque ink → 0 as the dismiss gesture progresses,
 * so the underlying screen bleeds through the last 30% of the swipe.
 * Matches the character of the reveal moment: physical, considered,
 * never Salesforce.
 */
import React from 'react';
import { View, Pressable, StatusBar } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { COLORS, SPACING } from '../lib/theme';
import { Text } from '../components/design/Text';
import { sizedImage, IMG } from '../lib/images';

const MAX_SCALE = 4;
const MIN_SCALE = 1;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

export default function PhotoViewer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    url?: string;
    caption?: string;
  }>();
  const url = typeof params.url === 'string' ? params.url : '';
  const caption =
    typeof params.caption === 'string' && params.caption.length > 0
      ? params.caption
      : null;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  // Separate progress driver for dismiss swipe. Only engages when
  // scale is at rest at 1x — otherwise pan is treated as image panning.
  const dismissProgress = useSharedValue(0);

  const close = () => {
    router.back();
  };

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      const next = savedScale.value * e.scale;
      scale.value = Math.max(0.5, Math.min(MAX_SCALE, next));
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE) {
        scale.value = withSpring(MIN_SCALE, {
          stiffness: 220,
          damping: 22,
        });
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
      savedScale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value));
    });

  const pan = Gesture.Pan()
    .onUpdate(e => {
      if (scale.value > 1.02) {
        // Pan the zoomed image.
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      } else if (e.translationY > 0) {
        // Drag-down dismiss. Ignore upward drags.
        dismissProgress.value = Math.min(1, e.translationY / 260);
        translateY.value = e.translationY;
      }
    })
    .onEnd(e => {
      if (scale.value > 1.02) {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        return;
      }
      const shouldDismiss =
        e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        translateY.value = withTiming(1000, { duration: 220 });
        dismissProgress.value = withTiming(1, { duration: 220 }, () => {
          runOnJS(close)();
        });
      } else {
        translateY.value = withSpring(0, { stiffness: 220, damping: 22 });
        dismissProgress.value = withSpring(0, {
          stiffness: 220,
          damping: 22,
        });
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd(() => {
      if (scale.value > 1.02) {
        scale.value = withSpring(MIN_SCALE);
        savedScale.value = MIN_SCALE;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2, { stiffness: 220, damping: 22 });
        savedScale.value = 2;
      }
    });

  // Pinch and pan compose simultaneously; double-tap is exclusive.
  const combined = Gesture.Simultaneous(pinch, pan);
  const gesture = Gesture.Exclusive(doubleTap, combined);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      dismissProgress.value,
      [0, 1],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  const imageWrapStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      dismissProgress.value,
      [0, 0.3],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  if (!url) {
    // Defensive: no URL, nothing to show. Bounce back.
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <StatusBar barStyle="light-content" />
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: COLORS.ink,
          },
          backdropStyle,
        ]}
      />

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            {
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            },
            imageWrapStyle,
          ]}
        >
          <Image
            source={{ uri: sizedImage(url, IMG.zoomable) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            transition={200}
          />
        </Animated.View>
      </GestureDetector>

      {/* Close button — cream-on-ink glyph, top-right. Sits above the
          gesture layer so a stray drag-down doesn't miss the tap. */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: 'absolute',
            top: insets.top + SPACING.s,
            right: SPACING.l,
          },
          chromeStyle,
        ]}
      >
        <Pressable
          onPress={close}
          hitSlop={20}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: 'rgba(13,13,13,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            color="cream"
            style={{
              fontSize: 20,
              lineHeight: 22,
            }}
          >
            ×
          </Text>
        </Pressable>
      </Animated.View>

      {caption ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: SPACING.l,
              right: SPACING.l,
              bottom: insets.bottom + SPACING.l,
            },
            chromeStyle,
          ]}
        >
          <Text
            variant="bodySmall"
            color="cream"
            style={{
              textShadowColor: 'rgba(0,0,0,0.6)',
              textShadowRadius: 4,
              textShadowOffset: { width: 0, height: 1 },
            }}
          >
            {caption}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
