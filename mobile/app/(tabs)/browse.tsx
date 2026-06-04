/**
 * Browse roster — every kid at the campus, in a two-column grid.
 * Reusing the existing /api/children list endpoint (returns the
 * full visible roster). Tap a card to push the kid profile.
 *
 * Phase 1.3 will add search + filter by grade.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { COLORS, FONT, SIZES, SPACING } from '../../lib/theme';
import { tap as hapticTap } from '../../lib/haptics';

const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  'https://www.beanumber.org';

interface RosterChild {
  id: string;
  child_id: string;
  first_name: string;
  display_name?: string;
  age?: number;
  grade_class?: string;
  photo_url?: string;
  shirt_number_start?: number;
}

async function fetchRoster(): Promise<RosterChild[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/children`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.children || []) as RosterChild[];
  } catch {
    return [];
  }
}

export default function BrowseScreen() {
  const [kids, setKids] = useState<RosterChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const list = await fetchRoster();
    setKids(list.filter(k => !!k.photo_url));
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    hapticTap();
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openKid = (shirtNumber: number) => {
    hapticTap();
    router.push(`/children/${shirtNumber}`);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
    >
      <Animated.View entering={FadeIn.duration(400)}>
        <Text style={styles.eyebrow}>The roster</Text>
        <Text style={styles.pageHeadline}>{kids.length} kids at Hope Bridge.</Text>
        <Text style={styles.pageSubhead}>
          Tap any kid to meet them. Every shirt number that maps to one of
          these kids opens the same page.
        </Text>
      </Animated.View>

      <View style={styles.grid}>
        {kids.map((k, i) => (
          <Animated.View
            key={k.id}
            entering={FadeInDown.duration(400).delay(80 + (i % 6) * 30)}
            style={styles.cell}
          >
            <Pressable
              style={styles.card}
              onPress={() => k.shirt_number_start && openKid(k.shirt_number_start)}
            >
              <View style={styles.cardPhotoFrame}>
                {k.photo_url && (
                  <Image source={{ uri: k.photo_url }} style={styles.cardPhoto} />
                )}
                {typeof k.shirt_number_start === 'number' && (
                  <View style={styles.cardBadge}>
                    <Text style={styles.cardBadgeText}>#{k.shirt_number_start}</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {k.display_name || k.first_name}
                </Text>
                {(k.age || k.grade_class) && (
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {[k.age ? `${k.age}` : null, k.grade_class].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    backgroundColor: COLORS.cream,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  center: { flex: 1, backgroundColor: COLORS.cream, justifyContent: 'center', alignItems: 'center' },
  eyebrow: {
    fontSize: 12, fontWeight: '700', letterSpacing: 3,
    color: COLORS.gold, textTransform: 'uppercase', marginBottom: SPACING.sm,
  },
  pageHeadline: {
    fontSize: SIZES.heading1, color: COLORS.nearBlack,
    fontFamily: FONT.serif, lineHeight: 42, marginBottom: SPACING.sm,
  },
  pageSubhead: { fontSize: SIZES.body, color: COLORS.midGray, lineHeight: 24, marginBottom: SPACING.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -SPACING.xs },
  cell: { width: '50%', padding: SPACING.xs },
  card: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.sand },
  cardPhotoFrame: { width: '100%', aspectRatio: 1, backgroundColor: COLORS.sandLight, position: 'relative' },
  cardPhoto: { width: '100%', height: '100%' },
  cardBadge: {
    position: 'absolute', top: SPACING.sm, right: SPACING.sm,
    backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: SPACING.sm, paddingVertical: 4,
  },
  cardBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.gold },
  cardContent: { padding: SPACING.md },
  cardName: { fontSize: 16, color: COLORS.nearBlack, fontFamily: FONT.serif },
  cardMeta: { fontSize: 12, color: COLORS.midGray, marginTop: 2 },
});
