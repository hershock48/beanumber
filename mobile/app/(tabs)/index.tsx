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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
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
import { Enter } from '../../components/design/Enter';
import { KidCard } from '../../components/kids/KidCard';
import { FeedCard } from '../../components/home/FeedCard';
import { NewsletterCard } from '../../components/home/NewsletterCard';
import { EnterNumberSheet } from '../../components/home/EnterNumberSheet';
import { NumberDoor } from '../../components/home/NumberDoor';
import { LinkEmailSheet } from '../../components/account/LinkEmailSheet';
import { campusPresenceLine } from '../../lib/campusTime';
import {
  getMe,
  getMyKids,
  getCampusFeed,
  getLatestNewsletter,
  getExploreKids,
  MyKidRow,
  ExploreKidRow,
  CampusFeedItem,
  LatestNewsletter,
} from '../../lib/api';

export default function SponsorHome() {
  const router = useRouter();
  const [kids, setKids] = useState<MyKidRow[]>([]);
  const [feed, setFeed] = useState<CampusFeedItem[]>([]);
  const [newsletter, setNewsletter] = useState<LatestNewsletter | null>(null);
  const [explore, setExplore] = useState<ExploreKidRow[]>([]);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [numberSheetOpen, setNumberSheetOpen] = useState(false);
  const [linkSheetOpen, setLinkSheetOpen] = useState(false);

  const load = useCallback(async () => {
    const [k, f, n, e, m] = await Promise.allSettled([
      getMyKids(),
      getCampusFeed({ limit: 10 }),
      getLatestNewsletter(),
      getExploreKids({ limit: 3, excludeMine: true }),
      getMe(),
    ]);
    if (k.status === 'fulfilled') setKids(k.value);
    if (f.status === 'fulfilled') setFeed(f.value.items);
    if (n.status === 'fulfilled') setNewsletter(n.value);
    if (e.status === 'fulfilled') setExplore(e.value);
    // Real name from the server (donor record / checkout name) — never
    // derived from the email local-part. Null greets namelessly.
    if (m.status === 'fulfilled') setFirstName(m.value.firstName ?? null);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Refetch on foreground return — the email-link flow finishes in the
  // user's mail app / browser, so the kids appear the moment they
  // come back without needing a manual pull-to-refresh.
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        void load();
      }
      appState.current = next;
    });
    return () => sub.remove();
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
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.umber}
          />
        }
      >
        {/* Masthead — brand overline, time-aware greeting, and the
            presence line directly under it. The first three lines of
            the app say: this is Be A Number, we know you, and the
            campus is a real place where it's a real time of day. */}
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
              Be A Number
            </Text>
            <Text variant="h1" color="ink" style={{ marginTop: SPACING.s }}>
              {greetingLine(firstName)}
            </Text>
            <Text
              variant="bodySmall"
              color="umber"
              style={{ marginTop: SPACING.s }}
            >
              {campusPresenceLine()}
            </Text>
          </View>
        </Enter>

        {/* Your kids */}
        <View style={{ marginTop: SPACING.section }}>
          {loading && kids.length === 0 ? (
            <>
              <SectionHeader>Your kids</SectionHeader>
              <YourKidsSkeleton />
            </>
          ) : kids.length === 0 ? (
            <Enter index={1}>
              <View style={{ paddingHorizontal: SPACING.l }}>
                <NumberDoor onPress={() => setNumberSheetOpen(true)} />
                <Pressable
                  onPress={() => setLinkSheetOpen(true)}
                  accessibilityRole="button"
                  style={{ marginTop: SPACING.l, alignSelf: 'center' }}
                >
                  <Text
                    color="ink"
                    style={{
                      fontFamily: TEXT_STYLES.textLink.fontFamily,
                      fontSize: TEXT_STYLES.textLink.fontSize,
                      textDecorationLine: 'underline',
                    }}
                  >
                    Already claimed yours on the website? Connect that email
                  </Text>
                </Pressable>
              </View>
            </Enter>
          ) : (
            <Enter index={1}>
              <SectionHeader>Your kids</SectionHeader>
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
              {/* The door stays open even with kids — there is always
                  another shirt. Compact so it reads as an invitation,
                  not a demand. */}
              <View
                style={{
                  paddingHorizontal: SPACING.l,
                  marginTop: SPACING.l,
                }}
              >
                <NumberDoor
                  compact
                  onPress={() => setNumberSheetOpen(true)}
                />
              </View>
            </Enter>
          )}
        </View>

        {/* From the campus */}
        <Enter index={2} style={{ marginTop: SPACING.section }}>
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
                    onPhotoPress={photoUrl =>
                      router.push({
                        pathname: '/photo',
                        params: {
                          url: photoUrl,
                          caption: item.body || item.title,
                        },
                      })
                    }
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
        </Enter>

        {/* The latest letter */}
        {newsletter ? (
          <Enter index={3} style={{ marginTop: SPACING.section }}>
            <SectionHeader>The latest letter</SectionHeader>
            <View style={{ paddingHorizontal: SPACING.l }}>
              <NewsletterCard
                title={newsletter.title}
                teaser={newsletter.teaser}
                heroPhotoUrl={newsletter.heroPhotoUrl}
                onPress={() => router.push(`/newsletter/${newsletter.id}`)}
              />
            </View>
          </Enter>
        ) : null}

        {/* Meet more of the campus */}
        {explore.length > 0 ? (
          <Enter index={4} style={{ marginTop: SPACING.section }}>
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
          </Enter>
        ) : null}
      </ScrollView>

      <EnterNumberSheet
        visible={numberSheetOpen}
        onClose={() => setNumberSheetOpen(false)}
      />
      <LinkEmailSheet
        visible={linkSheetOpen}
        onClose={() => setLinkSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

/**
 * "Morning, Kevin." — the greeting knows what time it is where the
 * USER is (device local), the presence line under it knows what time
 * it is in Omoro. Two clocks, one sentence apart: that contrast is
 * the whole world-getting-smaller move.
 */
function greetingLine(firstName: string | null): string {
  const h = new Date().getHours();
  const part =
    h < 5 ? 'Up late' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  return firstName ? `${part}, ${firstName}.` : `${part}.`;
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

