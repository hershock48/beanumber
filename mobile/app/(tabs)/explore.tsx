/**
 * Campus — the walk-around-the-place tab.
 *
 * Rebuilt to website /campus parity after Kevin's test drive ("the
 * my campus page on the website is waaaay different than the app").
 * Structure mirrors the web page top to bottom:
 *
 *   1. Overline THE CAMPUS + personalized Lora headline — "You're
 *      with Desmond." (caps at three names, then "and N more"),
 *      falling back to "The kids at the campus." for viewers with
 *      no kids yet.
 *   2. Place caption + campus-as-place paragraph: six acres, Simon
 *      Peter Wilobo and his team, the buildings. The page is named
 *      Campus; the campus appears on it.
 *   3. Presence line — the Omoro clock.
 *   4. Photo grid: 4:5 tiles, name + "Age 9 · Loves football" line
 *      (same lovesPhrase shaping as the web tiles), "Your kid"
 *      badge on the viewer's own kids in Everyone mode.
 *   5. Latest-newsletter bridge card, same as the web page's
 *      "From the campus" card.
 *
 * Tiles stagger in with the shared <Enter/> primitive.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, RefreshControl, FlatList, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../../components/design/Text';
import { Enter } from '../../components/design/Enter';
import { Skeleton } from '../../components/design/Skeleton';
import { NewsletterCard } from '../../components/home/NewsletterCard';
import { campusPresenceLine } from '../../lib/campusTime';
import {
  getExploreKids,
  getMyKids,
  getLatestNewsletter,
  ExploreKidRow,
  MyKidRow,
  LatestNewsletter,
} from '../../lib/api';
import { sizedImage, IMG } from '../../lib/images';

export default function CampusTab() {
  const router = useRouter();
  const [kids, setKids] = useState<ExploreKidRow[]>([]);
  const [myKids, setMyKids] = useState<MyKidRow[]>([]);
  const [newsletter, setNewsletter] = useState<LatestNewsletter | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [excludeMine, setExcludeMine] = useState(true);

  const load = useCallback(async () => {
    const [roster, mine, news] = await Promise.allSettled([
      getExploreKids({ limit: 100, excludeMine }),
      getMyKids(),
      getLatestNewsletter(),
    ]);
    if (roster.status === 'fulfilled') setKids(roster.value);
    if (mine.status === 'fulfilled') setMyKids(mine.value);
    if (news.status === 'fulfilled') setNewsletter(news.value);
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

  const myIds = new Set(myKids.map(k => k.id));

  // Bento rhythm: the roster breathes instead of checkerboarding.
  // Pattern per 5 kids: one full-width 3:2 tile, then two pair rows.
  // Virtualization preserved — each FlatList item is one ROW.
  type BentoRow =
    | { key: string; type: 'full'; kid: ExploreKidRow }
    | { key: string; type: 'pair'; kids: ExploreKidRow[] };
  const rows: BentoRow[] = [];
  for (let i = 0; i < kids.length; ) {
    if (i % 5 === 0) {
      rows.push({ key: kids[i].id, type: 'full', kid: kids[i] });
      i += 1;
    } else {
      const pair = kids.slice(i, i + 2);
      rows.push({ key: pair[0].id, type: 'pair', kids: pair });
      i += pair.length;
    }
  }

  const header = (
    <View
      style={{
        paddingHorizontal: SPACING.l,
        marginTop: SPACING.l,
        marginBottom: SPACING.l,
      }}
    >
      <Enter index={0}>
        <Text
          color="gold"
          style={{
            fontFamily: TEXT_STYLES.overline.fontFamily,
            fontSize: 11,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          The campus
        </Text>
        <Text variant="h1" color="ink" style={{ marginTop: SPACING.s }}>
          {headline(myKids)}
        </Text>
        <Text
          variant="caption"
          color="umber"
          style={{ marginTop: SPACING.s }}
        >
          Hope Bridge Primary · Omoro District, Uganda
        </Text>
      </Enter>

      <Enter index={1}>
        {/* The place itself — same three facts as the website: the
            land, the people, the buildings. */}
        <Text
          variant="body"
          color="umber"
          style={{ marginTop: SPACING.l }}
        >
          Six acres in Northern Uganda. Simon Peter Wilobo and thirty
          teachers, nurses, and mentors run the day — a nursery, a
          primary school, an on-site clinic, vocational training for
          local women, and a lodge for sponsors who visit.
        </Text>
        <Text
          variant="bodySmall"
          color="umber"
          style={{ marginTop: SPACING.m }}
        >
          {campusPresenceLine()}
        </Text>
      </Enter>

      <Enter index={2}>
        <View style={{ marginTop: SPACING.l, flexDirection: 'row' }}>
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
      </Enter>
    </View>
  );

  const footer = newsletter ? (
    <View
      style={{
        paddingHorizontal: SPACING.l,
        marginTop: SPACING.m,
        marginBottom: SPACING.section,
      }}
    >
      <Text variant="h2" color="ink" style={{ marginBottom: SPACING.m }}>
        From the campus
      </Text>
      <NewsletterCard
        title={newsletter.title}
        teaser={newsletter.teaser}
        heroPhotoUrl={newsletter.heroPhotoUrl}
        onPress={() => router.push(`/newsletter/${newsletter.id}`)}
      />
    </View>
  ) : (
    <View style={{ height: SPACING.section }} />
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: COLORS.cream }}
      edges={['top']}
    >
      {loading && kids.length === 0 ? (
        <View>
          {header}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              paddingHorizontal: SPACING.l,
            }}
          >
            {[0, 1, 2, 3].map(i => (
              <View
                key={i}
                style={{
                  width: '48%',
                  marginRight: i % 2 === 0 ? '4%' : 0,
                  marginBottom: SPACING.l,
                }}
              >
                <Skeleton height={210} radius={RADIUS.cardLarge} />
                <Skeleton
                  height={18}
                  width="70%"
                  style={{ marginTop: SPACING.s }}
                />
              </View>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.key}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.umber}
            />
          }
          renderItem={({ item, index }) => (
            <Enter
              index={Math.min(index, 6)}
              style={{
                paddingHorizontal: SPACING.l,
                marginBottom: SPACING.l,
              }}
            >
              {item.type === 'full' ? (
                <CampusTile
                  kid={item.kid}
                  mine={myIds.has(item.kid.id)}
                  wide
                  onPress={() =>
                    router.push(`/children/${item.kid.shirtNumber}`)
                  }
                />
              ) : (
                <View style={{ flexDirection: 'row', gap: SPACING.m }}>
                  {item.kids.map(k => (
                    <View key={k.id} style={{ flex: 1 }}>
                      <CampusTile
                        kid={k}
                        mine={myIds.has(k.id)}
                        onPress={() =>
                          router.push(`/children/${k.shirtNumber}`)
                        }
                      />
                    </View>
                  ))}
                  {item.kids.length === 1 ? (
                    <View style={{ flex: 1 }} />
                  ) : null}
                </View>
              )}
            </Enter>
          )}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: SPACING.l }}>
              <Text variant="body" color="umber">
                Everyone here is already yours. Switch to "Everyone" to
                walk the whole campus.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

/** "You're with Desmond." — caps at three names, then collapses. */
function headline(myKids: MyKidRow[]): string {
  const names = [...new Set(myKids.map(k => k.firstName).filter(Boolean))];
  if (names.length === 0) return 'The kids at the campus.';
  if (names.length === 1) return `You’re with ${names[0]}.`;
  if (names.length === 2) return `You’re with ${names[0]} and ${names[1]}.`;
  if (names.length === 3)
    return `You’re with ${names[0]}, ${names[1]}, and ${names[2]}.`;
  return `You’re with ${names[0]}, ${names[1]}, and ${names.length - 2} more.`;
}

/**
 * 4:5 photo tile — photo does the talking, then name + the warmest
 * one-liner we have ("Age 9 · Loves football").
 */
function CampusTile({
  kid,
  mine,
  wide = false,
  onPress,
}: {
  kid: ExploreKidRow;
  mine: boolean;
  /** Full-width bento tile — landscape 3:2 instead of portrait 4:5. */
  wide?: boolean;
  onPress: () => void;
}) {
  const subLine = [
    kid.ageYears ? `Age ${kid.ageYears}` : null,
    kid.lovesPhrase ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Meet ${kid.firstName}`}
    >
      <View
        style={{
          aspectRatio: wide ? 3 / 2 : 4 / 5,
          borderRadius: RADIUS.cardLarge,
          overflow: 'hidden',
          backgroundColor: COLORS.sand,
        }}
      >
        {kid.photoUrl ? (
          <Image
            source={{ uri: sizedImage(kid.photoUrl, IMG.card) }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={250}
          />
        ) : null}
        {mine ? (
          <View
            style={{
              position: 'absolute',
              top: SPACING.s,
              left: SPACING.s,
              backgroundColor: COLORS.ink,
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: RADIUS.chip,
            }}
          >
            <Text
              color="gold"
              style={{
                fontFamily: TEXT_STYLES.overline.fontFamily,
                fontSize: 9,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
              }}
            >
              Your kid
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        color="ink"
        style={{
          marginTop: SPACING.s,
          fontFamily: TEXT_STYLES.h3.fontFamily,
          fontSize: 16,
        }}
        numberOfLines={1}
      >
        {kid.firstName}
      </Text>
      {subLine ? (
        <Text
          variant="caption"
          color="umber"
          numberOfLines={1}
          style={{ marginTop: 2 }}
        >
          {subLine}
        </Text>
      ) : null}
    </Pressable>
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
