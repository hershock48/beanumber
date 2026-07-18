/**
 * <HomeHero /> — the full-bleed photographic masthead.
 *
 * Wave-3 research verdict: the app had zero full-bleed photography
 * while the website leads with it — and photography is the single
 * strongest emotional asset this org owns. The hero is an
 * edge-to-edge photo (under the status bar), a bottom scrim, and
 * the masthead type sitting ON the image: gold overline, cream
 * Lora greeting, cream presence line. Ken-Burns-lite: the photo
 * drifts a few points over 14s so the surface is never static.
 *
 * Photo priority: your first kid → latest newsletter hero → latest
 * campus feed photo. No photo at all (fresh anonymous install) →
 * ink panel with the same type, which still looks intentional.
 *
 * Sunday: a gold letter-day ribbon rides under the presence line —
 * the app dresses up once a week because the campus does too.
 */
import React, { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { COLORS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../design/Text';
import { campusPresenceLine, campusNow } from '../../lib/campusTime';

interface Props {
  greeting: string;
  photoUrl?: string | null;
  /** "Since you were last here" delta line, when there is one. */
  deltaLine?: string | null;
}

export function HomeHero({ greeting, photoUrl, deltaLine }: Props) {
  const { height: screenH } = useWindowDimensions();
  const heroH = Math.round(screenH * 0.4);
  const sunday = campusNow().isSunday;

  // Ken-Burns-lite: 1.0 → 1.06 over 14s, forever, mirrored.
  const drift = useSharedValue(1);
  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1.06, { duration: 14000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [drift]);
  const driftStyle = useAnimatedStyle(() => ({
    transform: [{ scale: drift.value }],
  }));

  return (
    <View
      style={{
        height: heroH,
        backgroundColor: COLORS.ink,
        overflow: 'hidden',
        justifyContent: 'flex-end',
      }}
    >
      {/* Never black: with no live photo (fresh install, empty feed,
          no kids yet) the bundled campus photograph carries the hero.
          Kevin hit the ink-only fallback and read it as broken — an
          intentional-looking dark panel and a bug are indistinguishable
          to a user, so the photo is now unconditional. */}
      <Animated.View
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, driftStyle]}
      >
        <Image
          source={
            photoUrl ? { uri: photoUrl } : require('../../assets/campus-hero.jpg')
          }
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={400}
        />
      </Animated.View>

      {/* Scrim — type must win over any photo. */}
      <LinearGradient
        colors={['transparent', 'rgba(13,13,13,0.55)', 'rgba(13,13,13,0.88)']}
        locations={[0.35, 0.7, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <View
        style={{
          paddingHorizontal: SPACING.l,
          paddingBottom: SPACING.l,
        }}
      >
        <Text
          color="gold"
          style={{
            fontFamily: TEXT_STYLES.overline.fontFamily,
            fontSize: 11,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          Be A Number
        </Text>
        <Text
          color="cream"
          style={{
            marginTop: SPACING.s,
            fontFamily: TEXT_STYLES.h1.fontFamily,
            fontSize: TEXT_STYLES.h1.fontSize,
            lineHeight: TEXT_STYLES.h1.lineHeight,
          }}
        >
          {greeting}
        </Text>
        <Text
          variant="bodySmall"
          style={{ marginTop: SPACING.s, color: 'rgba(255,248,240,0.85)' }}
        >
          {campusPresenceLine()}
        </Text>

        {deltaLine ? (
          <Text
            variant="bodySmall"
            color="gold"
            style={{ marginTop: SPACING.s }}
          >
            {deltaLine}
          </Text>
        ) : null}

        {sunday ? (
          <View
            style={{
              marginTop: SPACING.m,
              alignSelf: 'flex-start',
              backgroundColor: COLORS.gold,
              borderRadius: 999,
              paddingVertical: 5,
              paddingHorizontal: 12,
            }}
          >
            <Text
              color="ink"
              style={{
                fontFamily: TEXT_STYLES.overline.fontFamily,
                fontSize: 10,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              It's letter day at the campus
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
