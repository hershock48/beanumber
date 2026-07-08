/**
 * <Sheet /> — bottom sheet primitive.
 *
 * Per 3.8 tokens: r=24 top corners, elevation e3, handle 24×4 pill at
 * 30% charcoal opacity, backdrop 40% charcoal opacity.
 *
 * Behavior:
 *   - slides up 300-400ms standard ease
 *   - tap on backdrop closes
 *   - swipe-down gesture on the handle closes
 *   - onClose is called after the exit animation completes
 *
 * Composer-shaped by default (children get 24pt padding). Pass
 * `padded={false}` to full-bleed the content.
 */
import React, { useEffect } from 'react';
import {
  Modal,
  Pressable,
  View,
  Dimensions,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  padded?: boolean;
  /** Minimum height (excluding handle). Sheet grows with content. */
  minHeight?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function Sheet({
  visible,
  onClose,
  padded = true,
  minHeight,
  children,
  style,
}: Props) {
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, {
        duration: 380,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      });
      backdropOpacity.value = withTiming(0.4, { duration: 300 });
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
      backdropOpacity.value = withTiming(0, { duration: 250 });
    }
  }, [visible, translateY, backdropOpacity]);

  const dismiss = () => {
    translateY.value = withTiming(
      SCREEN_HEIGHT,
      { duration: 300 },
      finished => {
        if (finished) runOnJS(onClose)();
      }
    );
    backdropOpacity.value = withTiming(0, { duration: 250 });
  };

  const pan = Gesture.Pan()
    .onUpdate(event => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd(event => {
      if (event.translationY > 120 || event.velocityY > 800) {
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: 300 },
          finished => {
            if (finished) runOnJS(onClose)();
          }
        );
        backdropOpacity.value = withTiming(0, { duration: 250 });
      } else {
        translateY.value = withTiming(0, { duration: 250 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: COLORS.charcoal,
          },
          backdropStyle,
        ]}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={dismiss}
          accessibilityLabel="Close sheet"
          accessibilityRole="button"
        />
      </Animated.View>

      {/* Sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
        }}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            {
              backgroundColor: COLORS.cream,
              borderTopLeftRadius: RADIUS.sheetTop,
              borderTopRightRadius: RADIUS.sheetTop,
              paddingTop: 8,
              minHeight,
              // Sheet e3 shadow (upward-facing).
              shadowColor: '#1e1408',
              shadowOffset: { width: 0, height: -8 },
              shadowOpacity: 0.08,
              shadowRadius: 24,
              elevation: 4,
            },
            sheetStyle,
          ]}
        >
          {/* Handle — draggable */}
          <GestureDetector gesture={pan}>
            <View
              style={{
                alignItems: 'center',
                paddingVertical: 8,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: COLORS.sheetHandle,
                }}
              />
            </View>
          </GestureDetector>

          <View
            style={[
              padded
                ? { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl }
                : null,
              style,
            ]}
          >
            {children}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
