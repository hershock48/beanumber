/**
 * <KidReveal />
 *
 * The transition + landed state after the ring completes.
 *
 * Choreography (from 3.2 annotations, timeline t = ring completion):
 *   0     Ring fills gold, holds 200ms (handled upstream)
 *   200   Ring dissolves outward as glow expanding past screen edges
 *   200   Button + number crossfade out
 *   400   Kid's photo fades in: starts ~55% scale, blur 4 → 0, scales up
 *         to final size over 1400ms with spring (180/22/1)
 *   600   Confetti — 12-16 gold pieces falling behind photo, silent,
 *         fully faded by ~1800ms
 *   900   Name types on below photo, 80ms/letter
 *   name+ Age + grade fades in below name (300ms)
 *   name+300  Intro line fades in
 *   name+600  Primary CTA fades in
 *   name+750  Ghost CTA fades in
 *   name+900  Footer fades in
 *
 * Reduced motion: cut straight to landed state, no stage-in stagger.
 *
 * Photo aspect: portrait 3:4. The number badge is the ONLY element that
 * sits on the photo. Name and everything else lives on cream below.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { COLORS, RADIUS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../design/Text';
import { Button } from '../design/Button';
import { Confetti } from './Confetti';

const SPRING = { damping: 22, mass: 1, stiffness: 180 } as const;

interface KidRevealData {
  firstName: string;
  age?: number;
  grade?: string;
  shirtNumber: number;
  photoUrl?: string;
  /** One specific human detail. Written per kid. */
  intro?: string;
  location?: string; // e.g., "Hope Bridge Primary · Omoro District, Uganda"
}

interface Props {
  kid: KidRevealData;
  /** Primary CTA copy — switches based on viewer role. */
  primaryLabel: string;
  onPrimaryPress: () => void;
  /**
   * One quiet line under the primary button saying what pressing it
   * unlocks (e.g. the claim CTA's "then the letter that came with
   * your shirt is ready to send"). Optional — most roles don't need
   * it.
   */
  primaryCaption?: string;
  secondaryLabel: string;
  onSecondaryPress: () => void;
  reducedMotion?: boolean;
}

export function KidReveal({
  kid,
  primaryLabel,
  onPrimaryPress,
  primaryCaption,
  secondaryLabel,
  onSecondaryPress,
  reducedMotion = false,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const photoWidth = screenWidth - SPACING.l * 2;
  const photoHeight = photoWidth * (4 / 3); // 3:4 portrait

  // Animation shared values.
  const photoOpacity = useSharedValue(reducedMotion ? 1 : 0);
  const photoScale = useSharedValue(reducedMotion ? 1 : 0.55);
  const nameLength = useSharedValue(reducedMotion ? kid.firstName.length : 0);
  const ageOpacity = useSharedValue(reducedMotion ? 1 : 0);
  const introOpacity = useSharedValue(reducedMotion ? 1 : 0);
  const primaryOpacity = useSharedValue(reducedMotion ? 1 : 0);
  const ghostOpacity = useSharedValue(reducedMotion ? 1 : 0);
  const footerOpacity = useSharedValue(reducedMotion ? 1 : 0);
  const [typedName, setTypedName] = useState(
    reducedMotion ? kid.firstName : ''
  );

  // Confetti trigger — set on mount, cleared shortly after so instance is transient.
  const [showConfetti, setShowConfetti] = useState(!reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;

    // Photo entrance (t=400ms after this component mounts — the
    // preceding button-fade-out step is handled by the parent screen).
    photoOpacity.value = withDelay(200, withTiming(1, { duration: 700 }));
    photoScale.value = withDelay(200, withSpring(1, SPRING));

    // Confetti autoclear after ~2s so the DOM is clean at rest.
    const confettiClear = setTimeout(() => setShowConfetti(false), 2000);

    // Name types on at t=900ms, 80ms/letter.
    const typeStart = 900;
    const perLetter = 80;
    const typeTimers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= kid.firstName.length; i += 1) {
      typeTimers.push(
        setTimeout(() => {
          setTypedName(kid.firstName.slice(0, i));
        }, typeStart + (i - 1) * perLetter)
      );
    }
    const nameEnd = typeStart + kid.firstName.length * perLetter;

    // After name lands, stage in the rest.
    ageOpacity.value = withDelay(
      nameEnd,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) })
    );
    introOpacity.value = withDelay(
      nameEnd + 300,
      withTiming(1, { duration: 300 })
    );
    primaryOpacity.value = withDelay(
      nameEnd + 600,
      withTiming(1, { duration: 300 })
    );
    ghostOpacity.value = withDelay(
      nameEnd + 750,
      withTiming(1, { duration: 300 })
    );
    footerOpacity.value = withDelay(
      nameEnd + 900,
      withTiming(1, { duration: 300 })
    );

    return () => {
      clearTimeout(confettiClear);
      typeTimers.forEach(clearTimeout);
    };
    // Intentionally only run once on mount — kid.firstName should never
    // change while this component is visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const photoStyle = useAnimatedStyle(() => ({
    opacity: photoOpacity.value,
    transform: [{ scale: photoScale.value }],
  }));
  const ageStyle = useAnimatedStyle(() => ({ opacity: ageOpacity.value }));
  const introStyle = useAnimatedStyle(() => ({
    opacity: introOpacity.value,
  }));
  const primaryStyle = useAnimatedStyle(() => ({
    opacity: primaryOpacity.value,
  }));
  const ghostStyle = useAnimatedStyle(() => ({ opacity: ghostOpacity.value }));
  const footerStyle = useAnimatedStyle(() => ({
    opacity: footerOpacity.value,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream, alignItems: 'center' }}>
      {/* Photo — 3:4 portrait, radius 16. Only element on photo: badge. */}
      <Animated.View
        style={[
          {
            width: photoWidth,
            height: photoHeight,
            borderRadius: RADIUS.cardLarge,
            overflow: 'hidden',
            marginTop: SPACING.s,
            backgroundColor: COLORS.sand, // placeholder while photo loads
          },
          photoStyle,
        ]}
        accessibilityLabel={`${kid.firstName}, ${
          kid.age ? `${kid.age},` : ''
        } in ${kid.grade || 'their classroom'}`}
      >
        {kid.photoUrl ? (
          <Image
            source={{ uri: kid.photoUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={200}
          />
        ) : null}

        {/* Shirt number badge — top-right, only on-photo element. */}
        <View
          style={{
            position: 'absolute',
            top: SPACING.m,
            right: SPACING.m,
            backgroundColor: COLORS.ink,
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: RADIUS.chip,
          }}
        >
          <Text
            variant="caption"
            color="gold"
            style={{ fontFamily: TEXT_STYLES.h3.fontFamily, fontSize: 13 }}
          >
            #{kid.shirtNumber}
          </Text>
        </View>
      </Animated.View>

      {/* Confetti — falls BEHIND the photo per the anti-pattern rule. */}
      {/* Rendered absolutely above the photo view in z-order for visibility, */}
      {/* but the piece paths are drawn so they read as "landing behind" the */}
      {/* photo via placement + fade timing. */}
      {showConfetti ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: photoHeight + SPACING.s * 2,
            zIndex: -1,
          }}
        >
          <Confetti pieces={14} durationMs={1600} />
        </View>
      ) : null}

      {/* Name — Display XL, kid's name only. Below photo on cream. */}
      <View style={{ marginTop: SPACING.xl, alignItems: 'center' }}>
        <Text variant="displayXL" color="ink" align="center">
          {typedName || ' '}
        </Text>

        <Animated.View style={ageStyle}>
          {kid.age || kid.grade ? (
            <Text
              variant="bodySmall"
              color="umber"
              align="center"
              style={{ marginTop: SPACING.s }}
            >
              {[
                kid.age ? `${kid.age} years old` : null,
                kid.grade ? kid.grade : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
        </Animated.View>
      </View>

      {/* Intro — one specific human detail. */}
      {kid.intro ? (
        <Animated.View
          style={[
            {
              paddingHorizontal: SPACING.xl,
              marginTop: SPACING.xl,
            },
            introStyle,
          ]}
        >
          <Text variant="body" color="ink" align="center">
            {kid.intro}
          </Text>
        </Animated.View>
      ) : null}

      {/* Primary + Ghost CTAs */}
      <View
        style={{
          marginTop: 'auto',
          paddingHorizontal: SPACING.l,
          paddingBottom: SPACING.xl,
          width: '100%',
          alignItems: 'center',
        }}
      >
        <Animated.View
          style={[{ width: '100%' }, primaryStyle]}
        >
          <Button variant="primary" onPress={onPrimaryPress} fullWidth>
            {primaryLabel}
          </Button>
          {primaryCaption ? (
            <Text
              variant="caption"
              color="umber"
              align="center"
              style={{ marginTop: SPACING.s }}
            >
              {primaryCaption}
            </Text>
          ) : null}
        </Animated.View>

        <Animated.View
          style={[{ marginTop: SPACING.m }, ghostStyle]}
        >
          <Button variant="ghost" onPress={onSecondaryPress}>
            {secondaryLabel}
          </Button>
        </Animated.View>

        {kid.location ? (
          <Animated.View
            style={[{ marginTop: SPACING.m }, footerStyle]}
          >
            <Text variant="caption" color="umber" align="center">
              Kid #{kid.shirtNumber} · {kid.location}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}
