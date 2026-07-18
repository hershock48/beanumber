/**
 * <BackChip /> — the one back button, used everywhere off the tabs.
 *
 * Kevin's wave-4 verdict: "there are no back buttons. there is
 * really poor nav." The nav system rule now: every screen pushed
 * over the tabs carries this chip, top-left, safe-area aware. One
 * shape, one position, one behavior — users learn it once.
 *
 * Behavior: router.back() when there's history; router.replace to
 * Home when there isn't (deep links, pushes, cold starts land on
 * pushed screens with an empty stack — back must NEVER be a dead
 * end).
 */
import React from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from './Text';

interface Props {
  /** 'light' = cream chip for photo/ink surfaces; 'dark' = ink chip. */
  tone?: 'light' | 'dark';
  /** Render × instead of ‹ — for modal-feeling screens. */
  close?: boolean;
  /** Override the default back/home behavior. */
  onPress?: () => void;
  /** Absolute-position the chip (default true). */
  floating?: boolean;
}

export function BackChip({
  tone = 'light',
  close = false,
  onPress,
  floating = true,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handlePress =
    onPress ??
    (() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    });

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={16}
      accessibilityRole="button"
      accessibilityLabel={close ? 'Close' : 'Back'}
      style={[
        {
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor:
            tone === 'light' ? 'rgba(255,248,240,0.9)' : 'rgba(13,13,13,0.55)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        floating
          ? {
              position: 'absolute',
              top: insets.top + SPACING.s,
              left: SPACING.l,
              zIndex: 20,
            }
          : null,
      ]}
    >
      <Text
        color={tone === 'light' ? 'ink' : 'cream'}
        style={{
          fontFamily: TEXT_STYLES.h3.fontFamily,
          fontSize: close ? 18 : 22,
          lineHeight: close ? 20 : 24,
          marginTop: close ? 0 : -2,
        }}
      >
        {close ? '×' : '‹'}
      </Text>
    </Pressable>
  );
}
