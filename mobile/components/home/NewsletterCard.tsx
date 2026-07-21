/**
 * <NewsletterCard /> — the newsletter embed on sponsor home.
 *
 * Section header is "The latest letter" (J3 resolution) rendered by
 * the caller. This card gets elevation 2 (one step above feed cards)
 * so 'The latest letter' reads as an event without shouting. Hero
 * photo + title in Lora H2 (dated per newsletter title) + teaser +
 * ghost link "Read June's letter".
 */
import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { COLORS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../design/Text';
import { Card } from '../design/Card';

interface Props {
  title: string;
  teaser?: string;
  heroPhotoUrl?: string;
  onPress?: () => void;
}

export function NewsletterCard({ title, teaser, heroPhotoUrl, onPress }: Props) {
  const readLabel = deriveReadLabel(title);
  return (
    <Card
      variant="newsletter"
      padded={false}
      onPress={onPress}
      style={{ overflow: 'hidden' }}
    >
      {heroPhotoUrl ? (
        <Image
          source={{ uri: heroPhotoUrl }}
          style={{
            width: '100%',
            aspectRatio: 16 / 9,
            backgroundColor: COLORS.sand,
          }}
          contentFit="cover"
          contentPosition="top"
          transition={300}
        />
      ) : null}
      <View style={{ padding: SPACING.l }}>
        <Text variant="h2" color="ink">
          {title}
        </Text>
        {teaser ? (
          <Text
            variant="body"
            color="ink"
            style={{ marginTop: SPACING.s }}
          >
            {teaser}
          </Text>
        ) : null}
        <View style={{ marginTop: SPACING.l }}>
          <Text
            color="ink"
            style={{
              fontFamily: TEXT_STYLES.textLink.fontFamily,
              fontSize: TEXT_STYLES.textLink.fontSize,
            }}
          >
            {readLabel}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/**
 * Convert a dated newsletter title ("June at the campus") into the
 * read-link copy ("Read June's letter"). Falls back to a generic
 * "Read the letter" if the title doesn't match the pattern.
 */
function deriveReadLabel(title: string): string {
  const m = /^([A-Za-z]+)\s+at\s+the\s+campus$/i.exec(title.trim());
  if (m) return `Read ${m[1]}'s letter`;
  return 'Read the letter';
}
