/**
 * /children/[number] — the kid page.
 *
 * The retention surface. Composes hero, latest update, notes thread,
 * timeline, bio, and co-sponsors into one scroll view with a sticky
 * nav on scroll past the hero and a floating "Write [Kid]" FAB for
 * monthly sponsors.
 *
 * Query params:
 *   compose=1 — auto-open the composer on mount (used after reveal
 *               moment's primary CTA).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  Extrapolation,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { COLORS, SPACING, TEXT_STYLES, ELEVATION, RADIUS } from '../../lib/theme';
import { Text } from '../../components/design/Text';
import { Skeleton } from '../../components/design/Skeleton';
import { HeroSection } from '../../components/kids/HeroSection';
import { LatestUpdateSection } from '../../components/kids/LatestUpdateSection';
import { NotesThread } from '../../components/kids/NotesThread';
import { TimelineSection } from '../../components/kids/TimelineSection';
import { BioSection } from '../../components/kids/BioSection';
import { Composer } from '../../components/kids/Composer';
import {
  getMobileKid,
  getKidUpdates,
  getKidTimeline,
  getThread,
  sendNote,
  MobileKidDetail,
  KidUpdate,
  KidTimelineEntry,
  ThreadResponse,
} from '../../lib/api';

const HERO_HEIGHT_APPROX = 520;

export default function KidPage() {
  const params = useLocalSearchParams<{ number: string; compose?: string }>();
  const shirtNumber = parseInt(params.number || '', 10);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [kid, setKid] = useState<MobileKidDetail | null>(null);
  const [updates, setUpdates] = useState<KidUpdate[]>([]);
  const [timeline, setTimeline] = useState<KidTimelineEntry[]>([]);
  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(shirtNumber)) return;
    const [k, u, t, th] = await Promise.allSettled([
      getMobileKid(shirtNumber),
      getKidUpdates(shirtNumber),
      getKidTimeline(shirtNumber),
      getThread(shirtNumber),
    ]);
    if (k.status === 'fulfilled') setKid(k.value);
    if (u.status === 'fulfilled') setUpdates(u.value);
    if (t.status === 'fulfilled') setTimeline(t.value);
    if (th.status === 'fulfilled') setThread(th.value);
  }, [shirtNumber]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (params.compose === '1' && kid?.viewer.canWriteNotes) {
      setComposerOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kid?.viewer.canWriteNotes]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
  });
  const navStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [HERO_HEIGHT_APPROX - 120, HERO_HEIGHT_APPROX],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const handleSendNote = useCallback(
    async (body: string) => {
      const message = await sendNote(shirtNumber, body);
      setThread(prev =>
        prev
          ? { ...prev, messages: [...prev.messages, message] }
          : { messages: [message], kidIsWritingBack: false }
      );
    },
    [shirtNumber]
  );

  if (loading || !kid) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: COLORS.cream }}
        edges={['top', 'bottom']}
      >
        <View style={{ padding: SPACING.l }}>
          <Skeleton height={520} radius={RADIUS.cardLarge} />
          <Skeleton
            height={40}
            style={{ marginTop: SPACING.xl, width: '50%' }}
          />
          <Skeleton
            height={20}
            style={{ marginTop: SPACING.s, width: '30%' }}
          />
          <Skeleton
            height={220}
            style={{ marginTop: SPACING.xxl }}
            radius={RADIUS.cardLarge}
          />
        </View>
      </SafeAreaView>
    );
  }

  const sponsoredSinceLabel = kid.bio.sponsoredSince
    ? `You've been ${kid.firstName}'s sponsor since ${formatMonthYear(
        kid.bio.sponsoredSince
      )}.`
    : null;

  const showSponsoredSince = kid.viewer.roleForKid === 'monthly';
  const showFAB = kid.viewer.canWriteNotes;
  const canReadUpdates = kid.viewer.canReadUpdates;
  const threadLockedForHolder =
    kid.viewer.roleForKid === 'holder' && !kid.viewer.canReadNotes;

  const bioForSection = {
    ...kid.bio,
    ageYears: kid.ageYears ?? kid.bio.ageYears,
    gradeLabel: kid.gradeLabel ?? kid.bio.gradeLabel,
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Sticky nav — fades in past the hero. */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            paddingTop: insets.top,
            paddingBottom: SPACING.s,
            paddingHorizontal: SPACING.l,
            backgroundColor: COLORS.cream,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            ...ELEVATION.e1,
          },
          navStyle,
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text
            variant="h3"
            color="ink"
            style={{ fontSize: 22, lineHeight: 22 }}
          >
            ‹
          </Text>
        </Pressable>
        <Text
          variant="body"
          color="ink"
          style={{
            fontFamily: TEXT_STYLES.h3.fontFamily,
            fontSize: 15,
          }}
        >
          {kid.firstName}
        </Text>
        {showFAB ? (
          <Pressable
            onPress={() => setComposerOpen(true)}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel={`Write ${kid.firstName}`}
          >
            <Text
              color="ink"
              style={{
                fontFamily: TEXT_STYLES.h3.fontFamily,
                fontSize: 20,
              }}
            >
              ✎
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </Animated.View>

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + SPACING.s,
          paddingBottom: SPACING.zone + insets.bottom,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.umber}
          />
        }
      >
        {/* Back button — top-left, over-photo (before sticky nav kicks in). */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + SPACING.s,
            left: SPACING.l,
            zIndex: 10,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={20}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.72)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              variant="h3"
              color="ink"
              style={{ fontSize: 20, lineHeight: 20 }}
            >
              ‹
            </Text>
          </Pressable>
        </View>

        <HeroSection
          firstName={kid.firstName}
          shirtNumber={kid.shirtNumber}
          photoUrl={kid.photoUrl || undefined}
          ageYears={kid.ageYears ?? undefined}
          gradeLabel={kid.gradeLabel ?? undefined}
          sponsoredSinceLabel={showSponsoredSince ? sponsoredSinceLabel : null}
        />

        {kid.intro ? (
          <View
            style={{
              paddingHorizontal: SPACING.l,
              marginTop: SPACING.l,
            }}
          >
            <Text variant="body" color="ink">
              {kid.intro}
            </Text>
          </View>
        ) : null}

        <View style={{ marginTop: SPACING.section }}>
          <LatestUpdateSection
            kidFirstName={kid.firstName}
            update={updates[0]}
            totalCount={updates.length}
            onSeeAllPress={() => {
              /* TODO route: /children/[N]/updates */
            }}
            locked={canReadUpdates ? null : 'holderOnly'}
          />
        </View>

        {(kid.viewer.canReadNotes || threadLockedForHolder) && thread ? (
          <View style={{ marginTop: SPACING.section }}>
            <NotesThread
              kidFirstName={kid.firstName}
              messages={thread.messages}
              kidIsWritingBack={thread.kidIsWritingBack}
              lockedForHolder={threadLockedForHolder}
              onWriteFirstNote={() => setComposerOpen(true)}
              onConvertPress={() => {
                /* TODO conversion route */
              }}
            />
          </View>
        ) : null}

        <View style={{ marginTop: SPACING.section }}>
          <TimelineSection
            kidFirstName={kid.firstName}
            entries={timeline}
          />
        </View>

        <View style={{ marginTop: SPACING.section }}>
          <BioSection bio={bioForSection} />
        </View>

        {kid.coSponsors && kid.coSponsors.length > 0 ? (
          <View
            style={{
              marginTop: SPACING.section,
              paddingHorizontal: SPACING.l,
            }}
          >
            <Text
              variant="overline"
              color="umber"
              style={{ marginBottom: SPACING.s }}
            >
              Also sponsored by
            </Text>
            <Text variant="body" color="ink">
              {formatFirstNames(kid.coSponsors)}
            </Text>
          </View>
        ) : null}
      </Animated.ScrollView>

      {showFAB ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            right: SPACING.xl,
            bottom: insets.bottom + SPACING.xl,
          }}
        >
          <Pressable
            onPress={() => setComposerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Write ${kid.firstName} a note`}
            style={{
              backgroundColor: COLORS.gold,
              paddingVertical: SPACING.m,
              paddingHorizontal: SPACING.l,
              borderRadius: RADIUS.pill,
              flexDirection: 'row',
              alignItems: 'center',
              ...ELEVATION.e2,
            }}
          >
            <Text
              color="ink"
              style={{
                fontFamily: TEXT_STYLES.h3.fontFamily,
                fontSize: 16,
                marginRight: 8,
              }}
            >
              ✎
            </Text>
            <Text
              color="ink"
              style={{
                fontFamily: TEXT_STYLES.h3.fontFamily,
                fontSize: 15,
              }}
            >
              Write {kid.firstName}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Composer
        visible={composerOpen}
        kidFirstName={kid.firstName}
        kidShirtNumber={kid.shirtNumber}
        onClose={() => setComposerOpen(false)}
        onSend={handleSendNote}
      />
    </View>
  );
}

function formatMonthYear(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatFirstNames(names: string[]): string {
  if (names.length === 1) return `${names[0]}.`;
  if (names.length === 2) return `${names[0]} and ${names[1]}.`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}.`;
}
