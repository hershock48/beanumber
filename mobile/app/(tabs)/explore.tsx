/**
 * Explore — browse the roster of kids at the campus.
 *
 * Grid of KidCards, 2 per row. Excludes the viewer's own kids from
 * this view by default. Tap → kid page (public view or holder view
 * depending on the viewer's relationship to that kid).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, RefreshControl, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../../components/design/Text';
import { KidCard } from '../../components/kids/KidCard';
import { Skeleton } from '../../components/design/Skeleton';
import { getExploreKids, MyKidRow } from '../../lib/api';
import { campusPresenceLine } from '../../lib/campusTime';

const CARD_GAP = SPACING.m;

export default function ExploreTab() {
  const router = useRouter();
  const [kids, setKids] = useState<MyKidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [excludeMine, setExcludeMine] = useState(true);

  const load = useCallback(async () => {
    const rows = await getExploreKids({ limit: 100, excludeMine });
    setKids(rows);
  }, [excludeMine]);

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
      <View
        style={{
          paddingHorizontal: SPACING.l,
          marginTop: SPACING.l,
          marginBottom: SPACING.l,
        }}
      >
        <Text variant="h1" color="ink">
          The campus
        </Text>
        <Text
          variant="caption"
          color="umber"
          style={{ marginTop: SPACING.xs }}
        >
          Hope Bridge Primary · Omoro District, Uganda
        </Text>
        <Text
          variant="body"
          color="umber"
          style={{ marginTop: SPACING.s }}
        >
          Meet the rest of the kids at Hope Bridge.
        </Text>
        {/* Presence — same heartbeat as Home and the kid pages. A
            directory of faces is a yearbook; a campus where it's
            currently Friday afternoon is a place. */}
        <Text
          variant="bodySmall"
          color="umber"
          style={{ marginTop: SPACING.s }}
        >
          {campusPresenceLine()}
        </Text>

        {/* Toggle */}
        <View
          style={{
            marginTop: SPACING.l,
            flexDirection: 'row',
          }}
        >
          <ToggleChip
            active={excludeMine}
            label="Not yet mine"
            onPress={() => setExcludeMine(true)}
          />
          <ToggleChip
            active={!excludeMine}
            label="Everyone"
            onPress={() => setExcludeMine(false)}
          />
        </View>
      </View>

      {loading && kids.length === 0 ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            paddingHorizontal: SPACING.l,
          }}
        >
          {[0, 1, 2, 3, 4, 5].map(i => (
            <View
              key={i}
              style={{
                width: '48%',
                marginRight: i % 2 === 0 ? '4%' : 0,
                marginBottom: SPACING.l,
              }}
            >
              <Skeleton height={200} radius={16} />
              <Skeleton
                height={20}
                width="70%"
                style={{ marginTop: SPACING.s }}
              />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={kids}
          keyExtractor={k => k.id}
          numColumns={2}
          columnWrapperStyle={{
            paddingHorizontal: SPACING.l,
            gap: CARD_GAP,
          }}
          contentContainerStyle={{ paddingBottom: SPACING.section }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.umber}
            />
          }
          renderItem={({ item }) => (
            <View style={{ flex: 1, marginBottom: SPACING.l }}>
              <KidCard
                firstName={item.firstName}
                shirtNumber={item.shirtNumber}
                photoUrl={item.photoUrl || undefined}
                onPress={() => router.push(`/children/${item.shirtNumber}`)}
                width={undefined as any}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: SPACING.l }}>
              <Text variant="body" color="umber">
                Everyone here is already sponsored by you. See "Everyone" for
                the full campus.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function ToggleChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: active ? COLORS.ink : 'transparent',
        borderWidth: 1,
        borderColor: active ? COLORS.ink : COLORS.divider,
        marginRight: SPACING.s,
      }}
    >
      <Text
        color={active ? 'cream' : 'umber'}
        style={{
          fontFamily: TEXT_STYLES.caption.fontFamily,
          fontSize: 13,
          fontWeight: '500',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
