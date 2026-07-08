/**
 * <FeedCard /> — campus feed post.
 *
 * 16:9 photo + caption (Inter 17/1.55, ink) + relative timestamp
 * (Caption umber). Reads like Instagram, never like Salesforce. Only
 * the photo is tappable — caption tap does nothing per 3.3 rule.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { COLORS, SPACING } from '../../lib/theme';
import { Text } from '../design/Text';
import { Card } from '../design/Card';
import { formatRelative } from '../kids/LatestUpdateSection';

interface Props {
  publishedAt: string;
  title: string;
  body?: string;
  photoUrl?: string;
  onPhotoPress?: (photoUrl: string) => void;
  onCardPress?: () => void;
}

export function FeedCard({
  publishedAt,
  title,
  body,
  photoUrl,
  onPhotoPress,
  onCardPress,
}: Props) {
  return (
    <Card
      variant="large"
      padded={false}
      onPress={onCardPress}
      style={{ overflow: 'hidden' }}
    >
      {photoUrl ? (
        <Pressable
          onPress={() => photoUrl && onPhotoPress?.(photoUrl)}
          accessibilityRole="image"
        >
          <Image
            source={{ uri: photoUrl }}
            style={{
              width: '100%',
              aspectRatio: 16 / 9,
              backgroundColor: COLORS.sand,
            }}
            contentFit="cover"
            transition={200}
          />
        </Pressable>
      ) : null}
      <View style={{ padding: SPACING.l }}>
        <Text variant="body" color="ink">
          {body || title}
        </Text>
        <Text
          variant="caption"
          color="umber"
          style={{ marginTop: SPACING.s }}
        >
          {formatRelative(publishedAt)}
        </Text>
      </View>
    </Card>
  );
}
