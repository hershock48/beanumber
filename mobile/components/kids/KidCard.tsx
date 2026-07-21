/**
 * <KidCard /> — the horizontal-strip / grid kid tile.
 *
 * Per 3.8 tokens:
 *   - 3:4 portrait photo, radius 16, elevation 1
 *   - Gold `#N` badge, r=4, top-right, 12pt inset
 *   - Gold unread dot (dot.md = 8pt), top-left, only when there's news
 *   - First name below photo, Inter Medium 17
 *
 * Sponsor home "Your Kids" strip uses a fixed 150pt width variant;
 * the Explore grid uses a flexible-width variant.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, DOT_SIZE, ELEVATION, RADIUS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../design/Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  firstName: string;
  shirtNumber: number;
  photoUrl?: string;
  hasUnread?: boolean;
  onPress?: () => void;
  /** Fixed photo width — cards inside a horizontal strip. */
  width?: number;
}

export function KidCard({
  firstName,
  shirtNumber,
  photoUrl,
  hasUnread = false,
  onPress,
  width = 150,
}: Props) {
  const scale = useSharedValue(1);
  const photoHeight = (width * 4) / 3; // 3:4 portrait

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={!onPress}
      onPressIn={() => {
        scale.value = withTiming(0.97, { duration: 120 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 150 });
      }}
      style={[
        { width, alignItems: 'flex-start' },
        animatedStyle,
      ]}
    >
      {/* Photo card */}
      <View
        style={{
          width,
          height: photoHeight,
          borderRadius: RADIUS.cardLarge,
          overflow: 'hidden',
          backgroundColor: COLORS.sand,
          ...ELEVATION.e1,
        }}
      >
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            contentPosition="top"
            transition={200}
          />
        ) : null}

        {/* Number badge — top-right, only element on photo. */}
        <View
          style={{
            position: 'absolute',
            top: SPACING.m,
            right: SPACING.m,
            backgroundColor: COLORS.ink,
            paddingVertical: 3,
            paddingHorizontal: 8,
            borderRadius: RADIUS.chip,
          }}
        >
          <Text
            variant="caption"
            color="gold"
            style={{
              fontFamily: TEXT_STYLES.h3.fontFamily,
              fontSize: 12,
              lineHeight: 14,
            }}
          >
            #{shirtNumber}
          </Text>
        </View>

        {/* Unread dot — top-left, gold, dot.md. */}
        {hasUnread ? (
          <View
            style={{
              position: 'absolute',
              top: SPACING.m,
              left: SPACING.m,
              width: DOT_SIZE.md,
              height: DOT_SIZE.md,
              borderRadius: DOT_SIZE.md / 2,
              backgroundColor: COLORS.unreadDot,
            }}
            accessibilityLabel="New update"
          />
        ) : null}
      </View>

      {/* Name below photo */}
      <Text
        variant="body"
        color="ink"
        style={{
          marginTop: SPACING.s,
          fontFamily: TEXT_STYLES.h3.fontFamily,
          fontSize: 17,
        }}
      >
        {firstName}
      </Text>
    </AnimatedPressable>
  );
}
