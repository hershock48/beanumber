/**
 * <NumberDoor /> — the front door of the whole product, on Home.
 *
 * Kevin's test-drive verdict on v1: "no magic. no place to search
 * your number." He was right twice. The number entry only existed
 * inside the zero-kids empty state, so the moment you had one kid
 * the door disappeared — a sponsor holding a NEW shirt had nowhere
 * to go. And the door itself was a plain gold pill, which treats
 * the brand's central ritual like a form field.
 *
 * This is the ritual made visible: an ink card (the only dark
 * surface on Home, so it owns the eye), the № mark with three gold
 * slot dashes like the number waiting to be filled in, one line of
 * copy, and the gold act. Always rendered — kids or no kids —
 * because there is always another shirt.
 *
 * Press: soft spring scale + light haptic. The reveal it leads to
 * is the product's peak moment; the door should feel like touching
 * the curtain.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { COLORS, RADIUS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../design/Text';
import * as haptics from '../../lib/haptics';

interface Props {
  onPress: () => void;
  /** Compact once the viewer already has kids; full as the hero. */
  compact?: boolean;
}

export function NumberDoor({ onPress, compact = false }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Enter your shirt Number"
        onPressIn={() => {
          scale.value = withSpring(0.98, { damping: 20, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 16, stiffness: 220 });
        }}
        onPress={() => {
          haptics.light();
          onPress();
        }}
        style={{
          backgroundColor: COLORS.ink,
          borderRadius: RADIUS.cardLarge,
          paddingVertical: compact ? SPACING.l : SPACING.xl,
          paddingHorizontal: SPACING.xl,
          overflow: 'hidden',
        }}
      >
        {/* The № mark + waiting slots. The number that isn't typed
            yet IS the design — three gold dashes where it goes. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
          }}
        >
          <Text
            color="gold"
            style={{
              fontFamily: TEXT_STYLES.h1.fontFamily,
              fontSize: compact ? 30 : 40,
              lineHeight: compact ? 34 : 44,
            }}
          >
            №
          </Text>
          <View style={{ flexDirection: 'row', marginLeft: 10 }}>
            {[0, 1, 2].map(i => (
              <View
                key={i}
                style={{
                  width: compact ? 18 : 24,
                  height: 3,
                  backgroundColor: COLORS.gold,
                  borderRadius: 2,
                  marginLeft: i === 0 ? 0 : 8,
                  marginBottom: compact ? 7 : 9,
                  opacity: 0.9,
                }}
              />
            ))}
          </View>
        </View>

        <Text
          color="cream"
          style={{
            marginTop: SPACING.m,
            fontFamily: TEXT_STYLES.body.fontFamily,
            fontSize: compact ? 14 : 16,
            lineHeight: compact ? 20 : 23,
          }}
        >
          {compact
            ? 'Holding another shirt? Its Number is a kid.'
            : 'The Number on your shirt is a kid at the campus, waiting to meet you.'}
        </Text>

        <View
          style={{
            marginTop: compact ? SPACING.m : SPACING.l,
            backgroundColor: COLORS.gold,
            borderRadius: RADIUS.pill,
            paddingVertical: compact ? 10 : SPACING.m,
            alignItems: 'center',
            alignSelf: 'stretch',
          }}
        >
          <Text
            color="ink"
            style={{
              fontFamily: TEXT_STYLES.h3.fontFamily,
              fontSize: 15,
            }}
          >
            Enter your Number
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
