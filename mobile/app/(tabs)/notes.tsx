/**
 * Penpal tab.
 *
 * Two states depending on the viewer's role for each of their kids:
 *   - For MONTHLY sponsors: an inbox of the latest penpal exchange per
 *     kid (like Messages.app). Tap a row → kid page scrolled to the
 *     penpal thread.
 *   - For HOLDERS: the warm locked card per held kid — same copy as
 *     the kid page's locked state ("Ismail writes his sponsors back —
 *     real notes, in his own handwriting first, then typed up by his
 *     teacher." + "Keep going with Ismail →").
 *
 * Per J7 resolution: the tab is never empty for holders — the locked
 * cards are the tab's content for the majority audience.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../../components/design/Text';
import { Card } from '../../components/design/Card';
import { Skeleton } from '../../components/design/Skeleton';
import { Enter } from '../../components/design/Enter';
import { sundayBatchLine } from '../../lib/campusTime';
import { getMyKids, MyKidRow } from '../../lib/api';
import { LinkEmailSheet } from '../../components/account/LinkEmailSheet';

export default function NotesTab() {
  const router = useRouter();
  const [kids, setKids] = useState<MyKidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [linkSheetOpen, setLinkSheetOpen] = useState(false);

  const load = useCallback(async () => {
    const rows = await getMyKids();
    setKids(rows);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: COLORS.cream }}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: SPACING.section }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.umber}
          />
        }
      >
        <Enter index={0}>
          <View style={{ paddingHorizontal: SPACING.l, marginTop: SPACING.l }}>
            <Text
              color="gold"
              style={{
                fontFamily: TEXT_STYLES.overline.fontFamily,
                fontSize: 11,
                letterSpacing: 3,
                textTransform: 'uppercase',
              }}
            >
              Letters
            </Text>
            <Text variant="h1" color="ink" style={{ marginTop: SPACING.s }}>
              Penpal
            </Text>
            {/* The postal heartbeat — letters move on Sundays, and the
                tab counts down to it. Anticipation is the product. */}
            <Text
              variant="bodySmall"
              color="umber"
              style={{ marginTop: SPACING.s }}
            >
              {sundayBatchLine()}
            </Text>
          </View>
        </Enter>

        {loading && kids.length === 0 ? (
          <View style={{ padding: SPACING.l }}>
            <Skeleton height={120} radius={RADIUS.cardLarge} />
            <View style={{ height: SPACING.l }} />
            <Skeleton height={120} radius={RADIUS.cardLarge} />
          </View>
        ) : kids.length === 0 ? (
          <View style={{ paddingHorizontal: SPACING.l, marginTop: SPACING.l }}>
            <Text variant="body" color="umber">
              Once you've met your Number's kid, this is where the letters
              live — yours going out, theirs coming back.
            </Text>
            <Pressable
              onPress={() => setLinkSheetOpen(true)}
              accessibilityRole="button"
              style={{ marginTop: SPACING.l, alignSelf: 'flex-start' }}
            >
              <Text
                color="ink"
                style={{
                  fontFamily: TEXT_STYLES.textLink.fontFamily,
                  fontSize: TEXT_STYLES.textLink.fontSize,
                  textDecorationLine: 'underline',
                }}
              >
                Shirt under a different email? Connect it →
              </Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={{
              paddingHorizontal: SPACING.l,
              marginTop: SPACING.l,
              gap: SPACING.l,
            }}
          >
            {kids.map((k, i) => (
              <Enter key={k.id} index={Math.min(i + 1, 6)}>
                {k.roleForViewer === 'monthly' ? (
                  <MonthlyRow
                    kid={k}
                    onPress={() => router.push(`/children/${k.shirtNumber}`)}
                  />
                ) : (
                  <HolderRow
                    kid={k}
                    onPress={() => router.push(`/children/${k.shirtNumber}`)}
                  />
                )}
              </Enter>
            ))}
          </View>
        )}
      </ScrollView>

      <LinkEmailSheet
        visible={linkSheetOpen}
        onClose={() => setLinkSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

/** Monthly sponsor row — inbox-shaped. Photo + name + latest preview. */
function MonthlyRow({
  kid,
  onPress,
}: {
  kid: MyKidRow;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.m,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: COLORS.sand,
          overflow: 'hidden',
          marginRight: SPACING.m,
        }}
      >
        {kid.photoUrl ? (
          <Image
            source={{ uri: kid.photoUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          contentPosition="top"
          />
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Text
            color="ink"
            style={{
              fontFamily: TEXT_STYLES.h3.fontFamily,
              fontSize: 17,
            }}
          >
            {kid.firstName}
          </Text>
          {kid.unreadUpdatesCount > 0 ? (
            <View
              style={{
                marginLeft: SPACING.s,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: COLORS.unreadDot,
              }}
            />
          ) : null}
        </View>
        <Text
          variant="bodySmall"
          color="umber"
          style={{ marginTop: 2 }}
          numberOfLines={1}
        >
          {kid.lastUpdatePreview || 'Write your penpal to say hi.'}
        </Text>
      </View>
    </Pressable>
  );
}

/** Holder row — the warm locked card per J7 resolution. */
function HolderRow({
  kid,
  onPress,
}: {
  kid: MyKidRow;
  onPress: () => void;
}) {
  return (
    <Card variant="large" onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: COLORS.sand,
            overflow: 'hidden',
            marginRight: SPACING.m,
          }}
        >
          {kid.photoUrl ? (
            <Image
              source={{ uri: kid.photoUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            contentPosition="top"
            />
          ) : null}
        </View>
        <Text
          color="ink"
          style={{
            fontFamily: TEXT_STYLES.h3.fontFamily,
            fontSize: 17,
          }}
        >
          {kid.firstName}
        </Text>
      </View>
      <Text variant="body" color="ink" style={{ marginTop: SPACING.m }}>
        Your penpal writes back — real notes, in {kid.firstName}'s own
        handwriting first, then typed up by the teacher.
      </Text>
      <Text variant="body" color="ink" style={{ marginTop: SPACING.m }}>
        You get a penpal, monthly photos, report cards, and campus updates.
        $25/month. Cancel anytime.
      </Text>
      <View style={{ marginTop: SPACING.l }}>
        <Text
          color="ink"
          style={{
            fontFamily: TEXT_STYLES.textLink.fontFamily,
            fontSize: TEXT_STYLES.textLink.fontSize,
          }}
        >
          Keep going with {kid.firstName} →
        </Text>
      </View>
    </Card>
  );
}
