/**
 * <HeroSection /> — the top of the kid page.
 *
 * Photo (3:4) with only the #N badge on it, then on cream below:
 * name in Lora H1, age · grade, and optional sponsor-since line.
 * No CTA — the FAB handles that.
 */
import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { COLORS, RADIUS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../design/Text';

interface Props {
  firstName: string;
  shirtNumber: number;
  photoUrl?: string;
  ageYears?: number | null;
  gradeLabel?: string | null;
  sponsoredSinceLabel?: string | null;
}

export function HeroSection({
  firstName,
  shirtNumber,
  photoUrl,
  ageYears,
  gradeLabel,
  sponsoredSinceLabel,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const photoWidth = screenWidth - SPACING.l * 2;
  const photoHeight = photoWidth * (4 / 3);

  return (
    <View style={{ alignItems: 'flex-start', paddingHorizontal: SPACING.l }}>
      {/* Photo — only element allowed on it is the number badge. */}
      <View
        style={{
          width: photoWidth,
          height: photoHeight,
          borderRadius: RADIUS.cardLarge,
          overflow: 'hidden',
          backgroundColor: COLORS.sand,
        }}
      >
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={300}
          />
        ) : null}

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
            style={{
              fontFamily: TEXT_STYLES.h3.fontFamily,
              fontSize: 13,
              lineHeight: 15,
            }}
          >
            #{shirtNumber}
          </Text>
        </View>
      </View>

      {/* Name + meta on cream */}
      <Text variant="h1" color="ink" style={{ marginTop: SPACING.xl }}>
        {firstName}
      </Text>

      {ageYears || gradeLabel ? (
        <Text
          variant="bodySmall"
          color="umber"
          style={{ marginTop: SPACING.xs }}
        >
          {[
            ageYears ? `${ageYears} years old` : null,
            gradeLabel,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}

      {sponsoredSinceLabel ? (
        <Text
          variant="caption"
          color="umber"
          style={{ marginTop: SPACING.s }}
        >
          {sponsoredSinceLabel}
        </Text>
      ) : null}
    </View>
  );
}
