/**
 * <LatestUpdateSection /> — the Instagram-shaped kid update card.
 *
 * Header "Latest from Ismail" (H2), card with full-bleed 16:9 photo,
 * caption in Body, relative timestamp in Caption umber. Tap photo →
 * full-screen viewer. "See recent updates" ghost link below.
 *
 * Empty state: quiet single line, no card, no illustration.
 * Locked state: shown to non-holders, warm invitation copy.
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { COLORS, RADIUS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../design/Text';
import { Card } from '../design/Card';

interface UpdateShape {
  publishedAt: string; // ISO
  caption: string;
  photoUrl?: string;
}

type LockedReason = 'holderOnly' | 'monthlyOnly' | null;

interface Props {
  kidFirstName: string;
  update?: UpdateShape;
  totalCount?: number;
  onSeeAllPress?: () => void;
  onPhotoPress?: (photoUrl: string) => void;
  locked?: LockedReason;
}

export function LatestUpdateSection({
  kidFirstName,
  update,
  totalCount,
  onSeeAllPress,
  onPhotoPress,
  locked,
}: Props) {
  return (
    <View style={{ paddingHorizontal: SPACING.l }}>
      <Text variant="h2" color="ink">
        Latest from {kidFirstName}
      </Text>

      {locked ? (
        <Card variant="large" style={{ marginTop: SPACING.m }}>
          <Text variant="body" color="ink">
            Updates unlock when you sponsor {kidFirstName}.
          </Text>
        </Card>
      ) : !update ? (
        <Text
          variant="bodySmall"
          color="umber"
          style={{ marginTop: SPACING.m }}
        >
          No updates yet. Simon posts them monthly.
        </Text>
      ) : (
        <>
          <Card
            variant="large"
            padded={false}
            style={{ marginTop: SPACING.m, overflow: 'hidden' }}
          >
            {update.photoUrl ? (
              <Pressable
                onPress={() =>
                  update.photoUrl && onPhotoPress?.(update.photoUrl)
                }
                accessibilityRole="image"
                accessibilityLabel={`Photo of ${kidFirstName}`}
              >
                <Image
                  source={{ uri: update.photoUrl }}
                  style={{
                    width: '100%',
                    aspectRatio: 3 / 2,
                    backgroundColor: COLORS.sand,
                  }}
                  contentFit="cover"
                  transition={200}
                />
              </Pressable>
            ) : null}
            <View style={{ padding: SPACING.l }}>
              <Text variant="body" color="ink">
                {update.caption}
              </Text>
              <Text
                variant="caption"
                color="umber"
                style={{ marginTop: SPACING.s }}
              >
                {formatRelative(update.publishedAt)}
              </Text>
            </View>
          </Card>

          {totalCount && totalCount > 1 && onSeeAllPress ? (
            <Pressable
              onPress={onSeeAllPress}
              style={{ marginTop: SPACING.m, alignSelf: 'flex-start' }}
              accessibilityRole="link"
            >
              <Text
                color="ink"
                style={{
                  fontFamily: TEXT_STYLES.textLink.fontFamily,
                  fontSize: TEXT_STYLES.textLink.fontSize,
                }}
              >
                See recent updates from {kidFirstName} →
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

/** Relative-time voice: "just now" / "3 days ago" / "a week ago" / etc. */
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const now = Date.now();
  const s = Math.floor((now - then) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'a day ago';
  if (d < 7) return `${d} days ago`;
  const w = Math.floor(d / 7);
  if (w === 1) return 'a week ago';
  if (w < 5) return `${w} weeks ago`;
  const mo = Math.floor(d / 30);
  if (mo === 1) return 'a month ago';
  if (mo < 12) return `${mo} months ago`;
  const y = Math.floor(d / 365);
  return y === 1 ? 'a year ago' : `${y} years ago`;
}
