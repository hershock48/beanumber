/**
 * Kid profile — reveal animation + parallax photo + sticky header
 * + sponsor sheet + next-kid suggestion + sponsor duration.
 *
 * Architecture:
 *  - Animated.ScrollView with scroll offset driving parallax.
 *  - Photo at the top scales + translates with scroll, with a
 *    sticky header that fades in as you scroll past the photo.
 *  - First-met date persisted per kid; "with [name] for N days"
 *    surfaces below the name when the count is at least 1.
 *  - Sponsor CTA now opens a bottom sheet instead of redirecting
 *    away. The sheet's Continue button opens Stripe Checkout in
 *    the in-app browser (PAGE_SHEET on iOS).
 *  - NextKid card at the bottom of the profile suggests another
 *    kid in the same grade.
 */
import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  Extrapolation,
} from 'react-native-reanimated';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, SIZES, SPACING } from '../../lib/theme';
import { getKidByShirtNumber, ApiError, type Kid } from '../../lib/api';
import {
  hasRevealed,
  markRevealed,
  pushRecent,
  recordFirstMet,
  getFirstMet,
  daysSince,
} from '../../lib/storage';
import {
  success,
  error as hapticError,
  press as hapticPress,
  tap as hapticTap,
} from '../../lib/haptics';
import { SponsorSheet } from '../../components/SponsorSheet';
import { NextKid } from '../../components/NextKid';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PHOTO_HEIGHT = SCREEN_WIDTH * (5 / 4);

const AnimatedScrollView = Animated.createAnimatedComponent(
  require('react-native').ScrollView
);

export default function KidProfileScreen() {
  const insets = useSafeAreaInsets();
  const { number } = useLocalSearchParams<{ number: string }>();
  const shirtNumber = parseInt(number, 10);

  const [kid, setKid] = useState<Kid | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const [daysWithKid, setDaysWithKid] = useState<number | null>(null);

  const [revealStage, setRevealStage] = useState<0 | 1 | 2 | 3>(0);
  const [typedName, setTypedName] = useState('');
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: e => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // Parallax: photo translates up slowly + scales slightly as you
  // scroll. The header bar fades in once you've scrolled past the
  // photo.
  const photoStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [-PHOTO_HEIGHT, 0, PHOTO_HEIGHT],
          [-PHOTO_HEIGHT / 2, 0, PHOTO_HEIGHT / 3],
          Extrapolation.CLAMP
        ),
      },
      {
        scale: interpolate(
          scrollY.value,
          [-PHOTO_HEIGHT, 0],
          [1.25, 1],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const headerBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [PHOTO_HEIGHT * 0.65, PHOTO_HEIGHT * 0.85],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setErrorMsg(null);
        const result = await getKidByShirtNumber(shirtNumber);
        if (cancelled) return;
        setKid(result);

        if (!result.reserved && !result.departed_at) {
          await pushRecent({
            shirtNumber: result.shirt_number ?? shirtNumber,
            firstName: result.first_name || 'Kid',
            displayName: result.display_name || result.first_name || 'Kid',
            photoUrl: result.photo_url,
          });
          await recordFirstMet(shirtNumber);
          const firstMet = await getFirstMet(shirtNumber);
          if (firstMet) setDaysWithKid(daysSince(firstMet));
        }

        const seen = await hasRevealed(shirtNumber);
        if (!result.reserved && !result.departed_at) {
          if (!seen) {
            runReveal(result.display_name || 'Kid');
            await markRevealed(shirtNumber);
          } else {
            setRevealStage(3);
            setTypedName(result.display_name || '');
          }
        } else {
          setRevealStage(3);
          setTypedName(result.display_name || '');
        }
      } catch (err) {
        if (cancelled) return;
        hapticError();
        if (err instanceof ApiError && err.status === 404) {
          setErrorMsg(
            `We don't have a #${shirtNumber} yet. Double-check the number on the back of your shirt — it's on the inside label.`
          );
        } else {
          setErrorMsg('Something went wrong. Try again in a moment.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (!isNaN(shirtNumber) && shirtNumber > 0) load();
    return () => {
      cancelled = true;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shirtNumber]);

  const runReveal = useCallback((fullName: string) => {
    setRevealStage(1);
    setTimeout(() => {
      setRevealStage(2);
      hapticPress();
      let i = 0;
      const tick = () => {
        i += 1;
        setTypedName(fullName.slice(0, i));
        if (i < fullName.length) {
          if (i % 3 === 0) hapticTap();
          typingTimerRef.current = setTimeout(tick, 70);
        } else {
          success();
          setRevealStage(3);
        }
      };
      tick();
    }, 420);
  }, []);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={COLORS.gold} size="large" />
        <Text style={styles.loadingLabel}>Looking up #{shirtNumber}…</Text>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.eyebrow}>Not found</Text>
        <Text style={styles.notFoundHeadline}>We don&rsquo;t have a #{shirtNumber} yet.</Text>
        <Text style={styles.notFoundBody}>{errorMsg}</Text>
        <Pressable style={styles.secondaryButton} onPress={() => { hapticTap(); router.replace('/'); }}>
          <Text style={styles.secondaryButtonLabel}>Try another number</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={() => Linking.openURL('mailto:Kevin@beanumber.org')}>
          <Text style={styles.linkButtonLabel}>Email Kevin@beanumber.org</Text>
        </Pressable>
      </View>
    );
  }

  if (!kid) return null;

  if (kid.reserved) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.eyebrow}>Reserved</Text>
        <Text style={styles.notFoundHeadline}>Shirt #{shirtNumber} is reserved.</Text>
        <Text style={styles.notFoundBody}>
          This number is held for a future live auction.
        </Text>
        <Pressable style={styles.secondaryButton} onPress={() => { hapticTap(); router.replace('/'); }}>
          <Text style={styles.secondaryButtonLabel}>Meet another kid</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.stickyHeader, headerBarStyle, { paddingTop: insets.top }]}
        pointerEvents="none"
      >
        <Text style={styles.stickyHeaderText} numberOfLines={1}>
          {kid.display_name || kid.first_name}
        </Text>
      </Animated.View>

      <AnimatedScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[styles.photoFrame, photoStyle]}
          pointerEvents="box-none"
        >
          <KidPhotos kid={kid} activeIndex={photoIdx} setActiveIndex={setPhotoIdx} />
        </Animated.View>

        <View style={styles.contentBlock}>
          {kid.departed_at && (
            <View style={styles.departureBanner}>
              <Text style={styles.departureLabel}>No longer at Hope Bridge</Text>
              <Text style={styles.departureNote}>
                {kid.departure_note || `${kid.display_name} has moved on from the campus.`}
              </Text>
            </View>
          )}

          {kid.student_of_month && revealStage >= 3 && (
            <Animated.View entering={FadeInDown.duration(400).delay(80)} style={styles.sotmBadge}>
              <Text style={styles.sotmBadgeLabel}>
                ★ Student of the Month · {kid.student_of_month}
              </Text>
              {kid.student_of_month_reason && (
                <Text style={styles.sotmReason}>
                  &ldquo;{kid.student_of_month_reason}&rdquo;
                </Text>
              )}
            </Animated.View>
          )}

          <Text style={styles.kidName}>
            {typedName}
            {revealStage === 2 && <Text style={styles.cursor}>|</Text>}
          </Text>

          {revealStage >= 3 && (
            <>
              {kid.name_meaning && (
                <Animated.Text entering={FadeIn.duration(300).delay(120)} style={styles.kidMeaning}>
                  {kid.name_meaning}
                </Animated.Text>
              )}

              {(kid.age || kid.grade_class) && (
                <Animated.Text entering={FadeIn.duration(300).delay(160)} style={styles.kidMeta}>
                  {[kid.age ? `Age ${kid.age}` : null, kid.grade_class || null]
                    .filter(Boolean).join(' · ')}
                </Animated.Text>
              )}

              {daysWithKid !== null && daysWithKid > 0 && !kid.departed_at && (
                <Animated.View entering={FadeIn.duration(300).delay(220)} style={styles.durationStrip}>
                  <View style={styles.durationDot} />
                  <Text style={styles.durationText}>
                    With {kid.first_name} for {daysWithKid} day{daysWithKid === 1 ? '' : 's'}
                  </Text>
                </Animated.View>
              )}

              {kid.child_quote && (
                <Animated.View entering={FadeInDown.duration(400).delay(280)} style={styles.childQuoteBlock}>
                  <Text style={styles.childQuoteText}>
                    &ldquo;{kid.child_quote}&rdquo;
                  </Text>
                  <Text style={styles.childQuoteAttribution}>
                    — {kid.first_name || 'them'}
                  </Text>
                </Animated.View>
              )}

              {kid.home_village && (
                <Animated.View entering={FadeInDown.duration(400).delay(360)}>
                  <KidFact label="Home" value={kid.home_village} />
                </Animated.View>
              )}
              {kid.family_context && (
                <Animated.View entering={FadeInDown.duration(400).delay(420)}>
                  <KidFact label="Family" value={kid.family_context} />
                </Animated.View>
              )}
              {kid.loves && (
                <Animated.View entering={FadeInDown.duration(400).delay(480)}>
                  <KidFact label={`About ${kid.first_name || 'them'}`} value={kid.loves} />
                </Animated.View>
              )}
              {kid.notes && (
                <Animated.View entering={FadeInDown.duration(400).delay(540)}>
                  <KidFact label={`More about ${kid.first_name || 'them'}`} value={kid.notes} />
                </Animated.View>
              )}

              {kid.teacher_quote && (
                <Animated.View entering={FadeInDown.duration(400).delay(600)} style={styles.teacherBlock}>
                  <Text style={styles.factLabel}>
                    From {kid.first_name || 'their'} teacher
                  </Text>
                  <Text style={styles.childQuoteText}>
                    &ldquo;{kid.teacher_quote}&rdquo;
                  </Text>
                  {kid.teacher_name && (
                    <Text style={styles.teacherName}>— {kid.teacher_name}</Text>
                  )}
                </Animated.View>
              )}

              {!kid.departed_at && (
                <Animated.View entering={FadeInDown.duration(500).delay(720)}>
                  <View style={styles.sponsorCard}>
                    <Text style={styles.sponsorEyebrow}>Stay with {kid.first_name}</Text>
                    <Text style={styles.sponsorHeadline}>
                      $25 a month keeps the campus running.
                    </Text>
                    <Text style={styles.sponsorBody}>
                      The pool funds Hope Bridge. {kid.first_name} is the face you
                      stay close to.
                    </Text>
                    <Pressable
                      style={styles.sponsorButton}
                      onPress={() => { hapticPress(); setSponsorOpen(true); }}
                    >
                      <Text style={styles.sponsorButtonLabel}>
                        Sponsor {kid.first_name}
                      </Text>
                    </Pressable>
                    <Text style={styles.sponsorFinePrint}>
                      $25/month · cancel anytime
                    </Text>
                  </View>
                </Animated.View>
              )}

              <NextKid
                excludeShirtNumber={kid.shirt_number ?? shirtNumber}
                matchGrade={kid.grade_class}
              />
            </>
          )}
        </View>
      </AnimatedScrollView>

      <SponsorSheet
        visible={sponsorOpen}
        onClose={() => setSponsorOpen(false)}
        firstName={kid.first_name || 'them'}
        shirtNumber={kid.shirt_number ?? shirtNumber}
      />
    </View>
  );
}

function KidPhotos({
  kid, activeIndex, setActiveIndex,
}: {
  kid: Kid; activeIndex: number; setActiveIndex: (i: number) => void;
}) {
  const photos =
    kid.photo_urls && kid.photo_urls.length > 0
      ? kid.photo_urls
      : kid.photo_url ? [kid.photo_url] : [];

  if (photos.length === 0) {
    return (
      <View style={[styles.photoFull, styles.photoPlaceholder]}>
        <Text style={styles.photoPlaceholderLabel}>Photo coming soon</Text>
        <View style={styles.shirtBadge}>
          <Text style={styles.shirtBadgeText}>#{kid.shirt_number ?? '?'}</Text>
        </View>
      </View>
    );
  }

  if (photos.length === 1) {
    return (
      <>
        <Image source={{ uri: photos[0] }} style={styles.photoFull} resizeMode="cover" />
        <View style={styles.shirtBadge}>
          <Text style={styles.shirtBadgeText}>#{kid.shirt_number ?? '?'}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <Image source={{ uri: item }} style={styles.photoFull} resizeMode="cover" />
        )}
        keyExtractor={(item, i) => `${item}-${i}`}
        onMomentumScrollEnd={e => {
          const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setActiveIndex(i);
          hapticTap();
        }}
      />
      <View style={styles.shirtBadge}>
        <Text style={styles.shirtBadgeText}>#{kid.shirt_number ?? '?'}</Text>
      </View>
      <View style={styles.pageIndicator}>
        {photos.map((_, i) => (
          <View
            key={i}
            style={[
              styles.pageIndicatorDot,
              i === activeIndex && styles.pageIndicatorDotActive,
            ]}
          />
        ))}
      </View>
    </>
  );
}

function KidFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factBlock}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  scrollContent: {
    backgroundColor: COLORS.cream,
    paddingBottom: SPACING.xxl,
  },
  centerState: {
    flex: 1, backgroundColor: COLORS.cream, padding: SPACING.lg,
    justifyContent: 'center', alignItems: 'center',
  },
  loadingLabel: {
    marginTop: SPACING.md, fontSize: 14, color: COLORS.midGray,
  },
  eyebrow: {
    fontSize: SIZES.eyebrow, fontWeight: '700', letterSpacing: 3,
    color: COLORS.gold, textTransform: 'uppercase', marginBottom: SPACING.md,
  },
  notFoundHeadline: {
    fontSize: SIZES.heading2, color: COLORS.nearBlack,
    fontFamily: FONT.serif, textAlign: 'center', marginBottom: SPACING.md,
  },
  notFoundBody: {
    fontSize: SIZES.bodyLg, color: COLORS.midGray,
    textAlign: 'center', lineHeight: 26, marginBottom: SPACING.xl, maxWidth: 380,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    backgroundColor: COLORS.cream,
    borderBottomWidth: 1, borderBottomColor: COLORS.sand,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    zIndex: 10,
  },
  stickyHeaderText: {
    fontSize: 17, color: COLORS.nearBlack,
    fontFamily: FONT.serif, textAlign: 'center',
  },
  photoFrame: {
    width: SCREEN_WIDTH,
    height: PHOTO_HEIGHT,
    backgroundColor: COLORS.sandLight,
    position: 'relative',
  },
  photoFull: { width: SCREEN_WIDTH, height: PHOTO_HEIGHT },
  photoPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  photoPlaceholderLabel: { color: COLORS.lightGray, fontSize: 14 },
  shirtBadge: {
    position: 'absolute', top: SPACING.md, right: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  shirtBadgeText: { fontSize: 16, fontWeight: '700', color: COLORS.gold },
  pageIndicator: {
    position: 'absolute', bottom: SPACING.md, alignSelf: 'center',
    flexDirection: 'row', gap: 6,
    left: 0, right: 0, justifyContent: 'center',
  },
  pageIndicatorDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  pageIndicatorDotActive: { backgroundColor: COLORS.white },
  contentBlock: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, backgroundColor: COLORS.cream },
  sotmBadge: { marginBottom: SPACING.md },
  sotmBadgeLabel: {
    backgroundColor: COLORS.gold, color: COLORS.nearBlack,
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1.5, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    alignSelf: 'flex-start', overflow: 'hidden',
  },
  sotmReason: {
    marginTop: SPACING.sm, fontStyle: 'italic', color: COLORS.midGray,
    fontSize: 14, fontFamily: FONT.serifItalic,
  },
  kidName: {
    fontSize: SIZES.heading1, color: COLORS.nearBlack,
    fontFamily: FONT.serif, marginBottom: SPACING.xs, lineHeight: 42,
  },
  cursor: { color: COLORS.gold, fontWeight: '700' },
  kidMeaning: {
    fontSize: 16, color: COLORS.midGray, fontStyle: 'italic',
    fontFamily: FONT.serifItalic, marginBottom: SPACING.md,
  },
  kidMeta: { fontSize: SIZES.bodyLg, color: COLORS.midGray, marginBottom: SPACING.md },
  durationStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.sandLight,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    alignSelf: 'flex-start',
    marginBottom: SPACING.lg,
  },
  durationDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: COLORS.gold, marginRight: SPACING.sm,
  },
  durationText: {
    fontSize: 12, fontWeight: '700', letterSpacing: 1.2,
    color: COLORS.nearBlack, textTransform: 'uppercase',
  },
  childQuoteBlock: { marginBottom: SPACING.lg },
  childQuoteText: {
    fontSize: 22, fontStyle: 'italic', color: COLORS.nearBlack,
    lineHeight: 32, fontFamily: FONT.serifItalic,
  },
  childQuoteAttribution: {
    marginTop: SPACING.sm, fontSize: 11, color: COLORS.lightGray,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  factBlock: { marginBottom: SPACING.lg },
  factLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.gold,
    textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACING.xs,
  },
  factValue: { fontSize: SIZES.bodyLg, color: COLORS.bodyTextLight, lineHeight: 26 },
  teacherBlock: {
    borderLeftWidth: 2, borderLeftColor: COLORS.gold,
    paddingLeft: SPACING.md, marginBottom: SPACING.lg,
  },
  teacherName: { marginTop: SPACING.sm, fontSize: 13, color: COLORS.midGray },
  departureBanner: {
    backgroundColor: COLORS.sandLight, borderWidth: 2, borderColor: COLORS.midGray,
    padding: SPACING.md, marginBottom: SPACING.lg,
  },
  departureLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.midGray,
    textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACING.xs,
  },
  departureNote: {
    fontSize: 16, color: COLORS.bodyTextLight, lineHeight: 24,
    fontFamily: FONT.serifItalic,
  },
  sponsorCard: {
    backgroundColor: COLORS.white, borderWidth: 2, borderColor: COLORS.gold,
    padding: SPACING.lg, marginTop: SPACING.lg, marginBottom: SPACING.xl,
  },
  sponsorEyebrow: {
    fontSize: 11, fontWeight: '700', color: COLORS.gold,
    textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACING.sm,
  },
  sponsorHeadline: {
    fontSize: SIZES.heading2, color: COLORS.nearBlack,
    fontFamily: FONT.serif, lineHeight: 34, marginBottom: SPACING.md,
  },
  sponsorBody: { fontSize: SIZES.bodyLg, color: COLORS.bodyTextLighter, lineHeight: 26, marginBottom: SPACING.lg },
  sponsorButton: { backgroundColor: COLORS.gold, paddingVertical: 18, alignItems: 'center' },
  sponsorButtonLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.nearBlack,
    textTransform: 'uppercase', letterSpacing: 2,
  },
  sponsorFinePrint: { marginTop: SPACING.sm, fontSize: 12, color: COLORS.lightGray, textAlign: 'center' },
  secondaryButton: {
    marginTop: SPACING.lg, borderWidth: 1, borderColor: COLORS.sand,
    paddingVertical: 16, paddingHorizontal: SPACING.lg, alignItems: 'center',
  },
  secondaryButtonLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.nearBlack,
    textTransform: 'uppercase', letterSpacing: 2,
  },
  linkButton: { marginTop: SPACING.md, paddingVertical: SPACING.sm },
  linkButtonLabel: { fontSize: 14, color: COLORS.gold, textDecorationLine: 'underline' },
});
