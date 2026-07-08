/**
 * <ListItem /> — the standard clickable row.
 *
 * Per 3.8 tokens: 16pt internal padding, optional photo left with r=8,
 * chevron-right for navigable rows, 1px charcoal @10% divider indented
 * to text (not full-width to screen edge).
 *
 * Buyer home rows, purchase list, sponsorship transfer list — all use this.
 * Divider is drawn INSIDE the item so composing a stack Just Works.
 */
import React from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, SPACING, RADIUS } from '../../lib/theme';
import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  title: string;
  subtitle?: string;
  /** Right-aligned trailing text (e.g., amount, timestamp). */
  trailing?: string;
  /** Show a chevron indicating navigation. */
  showChevron?: boolean;
  onPress?: () => void;
  /** When set, item is the first in a stack — no divider on top. */
  first?: boolean;
  /** When set, item is the last in a stack — no divider on bottom. */
  last?: boolean;
  style?: ViewStyle;
}

export function ListItem({
  title,
  subtitle,
  trailing,
  showChevron = false,
  onPress,
  last = false,
  style,
}: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.l,
        paddingHorizontal: SPACING.l,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="body" color="ink">
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="bodySmall"
            color="umber"
            style={{ marginTop: 2 }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? (
        <Text variant="body" color="ink" style={{ marginLeft: SPACING.m }}>
          {trailing}
        </Text>
      ) : null}
      {showChevron ? (
        <View style={{ marginLeft: SPACING.s }}>
          <Chevron />
        </View>
      ) : null}
    </View>
  );

  const wrapper = onPress ? (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.99, { duration: 100 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 150 });
      }}
      style={[animatedStyle, style]}
    >
      {content}
    </AnimatedPressable>
  ) : (
    <View style={style}>{content}</View>
  );

  return (
    <View>
      {wrapper}
      {last ? null : (
        <View
          style={{
            height: 1,
            backgroundColor: COLORS.divider,
            marginLeft: SPACING.l,
          }}
        />
      )}
    </View>
  );
}

/** Line-icon chevron pointing right. 20pt, 1.5px stroke, per icon spec. */
function Chevron() {
  return (
    <View
      style={{
        width: 8,
        height: 12,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* SVG-free: two lines rotated 45° form a right-pointing chevron */}
      <View
        style={{
          width: 8,
          height: 1.5,
          backgroundColor: COLORS.stone,
          transform: [{ rotate: '45deg' }, { translateY: 3 }],
          borderRadius: 1,
        }}
      />
      <View
        style={{
          width: 8,
          height: 1.5,
          backgroundColor: COLORS.stone,
          transform: [{ rotate: '-45deg' }, { translateY: -3 }],
          borderRadius: 1,
        }}
      />
    </View>
  );
}
