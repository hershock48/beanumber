/**
 * Sponsor Home — the tab index.
 *
 * Sections top to bottom:
 *   1. "Hey {firstName}." greeting (H1 Lora, no subtitle — dashboards
 *      put one; this isn't a dashboard).
 *   2. "Your kids" — horizontal-scrolling strip of KidCards.
 *   3. "From the campus" — chronological feed cards.
 *   4. "The latest letter" — newsletter card (elevation 2).
 *   5. "Meet more of the campus" — 3 square thumbs + See everyone link.
 *
 * Zero gold CTAs on this whole screen. Home is a place to be, not a
 * funnel. Pull-to-refresh spinner tinted umber (never gold).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  RefreshControl,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, TEXT_STYLES, RADIUS } from '../../lib/theme';
import { Text } from '../../components/design/Text';
import { Skeleton } from '../../components/design/Skeleton';
import { KidCard } from '../../components/kids/KidCard';
import { FeedCard } from '../../components/home/FeedCard';
import { NewsletterCard } from '../../components/home/NewsletterCard';
import {
  getMyKids,
  getCampusFeed,
  getLatestNewsletter,
  getExploreKids,
  MyKidRow,
  CampusFeedItem,
  LatestNewsletter,
} from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

export default function SponsorHome() {
  const router = useRouter();
  const { user } = useAuth();
  const [kids, setKids] = useState<MyKidRow[]>([]);
  const [feed, setFeed] = useState<CampusFeedItem[]>([]);
  const [newsletter, setNewsletter] = useState<LatestNewsletter | null>(null);
  const [explore, setExplore] = useState<MyKidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [k, f, n, e] = await Promise.allSettled([
      getMyKids(),
      getCampusFeed({ limit: 10 }),
      getLatestNewsletter(),
      getExploreKids({ limit: 3, excludeMine: true }),
    ]);
    if (k.status === 'fulfilled') setKids(k.value);
    if (f.status === 'fulfilled') setFeed(f.value.items);
    if (n.status === 'fulfilled') setNewsletter(n.value);
    if (e.status === 'fulfilled') setExplore(e.value);
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

  const firstName = user?.email ? deriveFirstName(user.email) : 'friend';

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: COLORS.cream }}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: SPACING.section }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.umber}
          />
        }
      >
        {/* Greeting */}
        <View style={{ paddingHorizontal: SPACING.l, marginTop: SPACING.l }}>
          <Text variant="h1" color="ink">
            Hey {firstName}.
          </Text>
        </View>

        {/* Your kids */}
        <View style={{ marginTop: SPACING.section }}>
          <SectionHeader>Your kids</SectionHeader>
          {loading && kids.length === 0 ? (
            <YourKidsSkeleton />
          ) : kids.length === 0 ? (
            <View style={{ paddingHorizontal: SPACING.l }}>
              <Text variant="bodySmall" color="umber">
                No kids on your account yet. When someone claims a shirt with
                your card on it, they'll land here.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: SPACING.l,
                paddingRight: SPACING.section,
              }}
            >
              {kids.map((k, i) => (
                <View
                  key={k.id}
                  style={{
                    marginRight: i === kids.length - 1 ? 0 : SPACING.m,
                  }}
                >
                  <KidCard
                    firstName={k.firstName}
                    shirtNumber={k.shirtNumber}
                    photoUrl={k.photoUrl || undefined}
                    hasUnread={k.unreadUpdatesCount > 0}
                    onPress={() => router.push(`/children/${k.shirtNumber}`)}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* From the campus */}
        <View style={{ marginTop: SPACING.section }}>
          <SectionHeader>From the campus</SectionHeader>
          <View style={{ paddingHorizontal: SPACING.l }}>
            {loading && feed.length === 0 ? (
              <FeedSkeleton />
            ) : feed.length === 0 ? (
              <Text variant="bodySmall" color="umber">
                Nothing from the campus yet. New updates land here.
              </Text>
            ) : (
              feed.map((item, i) => (
                <View
                  key={item.id}
                  style={{
                    marginBottom: i === feed.length - 1 ? 0 : SPACING.l,
                  }}
                >
                  <FeedCard
                    publishedAt={item.publishedAt}
                    title={item.title}
                    body={item.body}
                    photoUrl={item.photoUrl}
                    onCardPress={
                      item.kidRef
                        ? () =>
                            router.push(
                              `/children/${item.kidRef!.shirtNumber}`
                            )
                        : undefined
                    }
                  />
                </View>
              ))
            )}
          </View>
        </View>

        {/* The latest letter */}
        {newsletter ? (
          <View style={{ marginTop: SPACING.section }}>
            <SectionHeader>The latest letter</SectionHeader>
            <View style={{ paddingHorizontal: SPACING.l }}>
              <NewsletterCard
                title={newsletter.title}
                teaser={newsletter.teaser}
                heroPhotoUrl={newsletter.heroPhotoUrl}
                onPress={() => router.push(`/newsletter/${newsletter.id}`)}
              />
            </View>
          </View>
        ) : null}

        {/* Meet more of the campus */}
        {explore.length > 0 ? (
          <View style={{ marginTop: SPACING.section }}>
            <SectionHeader>Meet more of the campus</SectionHeader>
            <View
              style={{
                paddingHorizontal: SPACING.l,
                flexDirection: 'row',
                justifyContent: 'flex-start',
              }}
            >
              {explore.slice(0, 3).map((k, i) => (
                <Pressable
                  key={k.id}
                  onPress={() => router.push(`/children/${k.shirtNumber}`)}
                  style={{
                    width: 104,
                    marginRight: i === 2 ? 0 : SPACING.m,
                  }}
                  accessibilityRole="button"
                >
                  <View
                    style={{
                      width: 104,
                      height: 104,
                      borderRadius: RADIUS.card,
                      overflow: 'hidden',
                      backgroundColor: COLORS.sand,
                    }}
                  >
                    {k.photoUrl ? (
                      <Image
                        source={{ uri: k.photoUrl }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : null}
                  </View>
                  <Text
                    variant="bodySmall"
                    color="ink"
                    style={{ marginTop: SPACING.s }}
                  >
                    {k.firstName}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => router.push('/(tabs)/explore')}
              style={{
                marginTop: SPACING.m,
                paddingHorizontal: SPACING.l,
                alignSelf: 'flex-start',
              }}
              accessibilityRole="link"
            >
              <Text
                color="ink"
                style={{
                  fontFamily: TEXT_STYLES.textLink.fontFamily,
                  fontSize: TEXT_STYLES.textLink.fontSize,
                }}
              >
                See everyone at the campus →
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <View
      style={{
        paddingHorizontal: SPACING.l,
        marginBottom: SPACING.m,
      }}
    >
      <Text variant="h2" color="ink">
        {children}
      </Text>
    </View>
  );
}

function YourKidsSkeleton() {
  return (
    <View
      style={{
        paddingHorizontal: SPACING.l,
        flexDirection: 'row',
      }}
    >
      {[0, 1, 2].map(i => (
        <View key={i} style={{ marginRight: SPACING.m }}>
          <Skeleton width={150} height={200} radius={RADIUS.cardLarge} />
          <Skeleton
            width={100}
            height={20}
            style={{ marginTop: SPACING.s }}
          />
        </View>
      ))}
    </View>
  );
}

function FeedSkeleton() {
  return (
    <View>
      {[0, 1].map(i => (
        <View
          key={i}
          style={{ marginBottom: i === 1 ? 0 : SPACING.l }}
        >
          <Skeleton height={200} radius={RADIUS.cardLarge} />
          <Skeleton
            height={16}
            style={{ marginTop: SPACING.m }}
          />
          <Skeleton
            height={16}
            style={{ marginTop: SPACING.s, width: '60%' }}
          />
        </View>
      ))}
    </View>
  );
}

function deriveFirstName(email: string): string {
  const local = email.split('@')[0] || '';
  const chunk = local.split(/[._+]/)[0] || local;
  if (!chunk) return 'friend';
  return chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase();
}
