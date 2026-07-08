/**
 * /children/[number]/updates — full chronological list of updates
 * about this kid.
 *
 * Reached from the kid page's 'See recent updates from Ismail →' link.
 * Same card layout as the single-update view on the kid page, stacked.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../../../lib/theme';
import { Text } from '../../../components/design/Text';
import { Card } from '../../../components/design/Card';
import { Skeleton } from '../../../components/design/Skeleton';
import { formatRelative } from '../../../components/kids/LatestUpdateSection';
import {
  getKidUpdates,
  getMobileKid,
  KidUpdate,
  MobileKidDetail,
} from '../../../lib/api';

export default function KidUpdatesList() {
  const params = useLocalSearchParams<{ number: string }>();
  const shirtNumber = parseInt(params.number || '', 10);
  const insets = useSafeAreaInsets();
  const [kid, setKid] = useState<MobileKidDetail | null>(null);
  const [updates, setUpdates] = useState<KidUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(shirtNumber)) return;
    const [k, u] = await Promise.allSettled([
      getMobileKid(shirtNumber),
      getKidUpdates(shirtNumber),
    ]);
    if (k.status === 'fulfilled') setKid(k.value);
    if (u.status === 'fulfilled') setUpdates(u.value);
  }, [shirtNumber]);

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
      edges={['bottom']}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + SPACING.l,
          paddingBottom: SPACING.section,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.umber}
          />
        }
      >
        <View style={{ paddingHorizontal: SPACING.l }}>
          <Text variant="h1" color="ink">
            {kid?.firstName || 'Kid'}'s updates
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: SPACING.l,
            marginTop: SPACING.xl,
            gap: SPACING.l,
          }}
        >
          {loading && updates.length === 0 ? (
            <>
              <Skeleton height={240} />
              <Skeleton height={240} />
            </>
          ) : updates.length === 0 ? (
            <Text variant="body" color="umber">
              No updates yet. Simon posts them monthly.
            </Text>
          ) : (
            updates.map(u => <UpdateCard key={u.id} update={u} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function UpdateCard({ update }: { update: KidUpdate }) {
  const router = useRouter();
  return (
    <Card variant="large" padded={false} style={{ overflow: 'hidden' }}>
      {update.photoUrl ? (
        <Image
          source={{ uri: update.photoUrl }}
          style={{
            width: '100%',
            aspectRatio: 3 / 2,
            backgroundColor: COLORS.sand,
          }}
          contentFit="cover"
          transition={200}
          onError={() => {}}
        />
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
  );
}
