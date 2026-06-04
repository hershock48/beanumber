/**
 * Kid profile screen — the reveal. Loads from
 * GET /api/children/[shirtNumber], renders the public profile.
 *
 * Layout mirrors the web's /children/[N] page: hero photo with
 * shirt number badge, name in Lora serif, age/grade, child quote
 * pull-quote, structured fact blocks (Home, Family, About), teacher
 * quote, longer notes, sponsor CTA at the bottom.
 *
 * Photo carousel uses horizontal FlatList with paging. Tap a photo
 * to enter fullscreen view in a future commit; for v0.1.2 swipe
 * + page indicators is enough.
 *
 * The reveal animation (fade-in + name typewriter) is Phase 1.3
 * — keeping this commit focused on layout + data wiring.
 */
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { COLORS, FONT, SIZES, SPACING } from '../../lib/theme';
import { getKidByShirtNumber, ApiError, type Kid } from '../../lib/api';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function KidProfileScreen() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const shirtNumber = parseInt(number, 10);

  const [kid, setKid] = useState<Kid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await getKidByShirtNumber(shirtNumber);
        if (!cancelled) setKid(result);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError(
            `We don't have a #${shirtNumber} yet. Double-check the number on the back of your shirt — it's on the inside label.`
          );
        } else {
          setError('Something went wrong. Try again in a moment.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (!isNaN(shirtNumber) && shirtNumber > 0) load();
    return () => {
      cancelled = true;
    };
  }, [shirtNumber]);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={COLORS.gold} size="large" />
        <Text style={styles.loadingLabel}>Looking up #{shirtNumber}…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.eyebrow}>Not found</Text>
        <Text style={styles.notFoundHeadline}>We don&rsquo;t have a #{shirtNumber} yet.</Text>
        <Text style={styles.notFoundBody}>{error}</Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.secondaryButtonLabel}>Try another number</Text>
        </Pressable>
        <Pressable
          style={styles.linkButton}
          onPress={() => Linking.openURL('mailto:Kevin@beanumber.org')}
        >
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
          This number is held for a future live auction. The winning bidder
          will be matched to a child at the campus, and their profile will
          appear here once the match is made.
        </Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.replace('/')}>
          <Text style={styles.secondaryButtonLabel}>Meet another kid</Text>
        </Pressable>
      </View>
    );
  }

  // Departed kid view — kid left the campus. Their record stays
  // but the page reframes as memorial, no sponsor ask.
  if (kid.departed_at) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <KidPhotoBlock kid={kid} activeIndex={activePhotoIndex} setActiveIndex={setActivePhotoIndex} />
        <View style={styles.contentBlock}>
          <View style={styles.departureBanner}>
            <Text style={styles.departureLabel}>No longer at Hope Bridge</Text>
            <Text style={styles.departureNote}>
              {kid.departure_note || `${kid.display_name} has moved on from the campus.`}
            </Text>
          </View>
          <Text style={styles.kidName}>{kid.display_name}</Text>
          {kid.name_meaning && <Text style={styles.kidMeaning}>{kid.name_meaning}</Text>}
          <Pressable style={styles.secondaryButton} onPress={() => router.replace('/')}>
            <Text style={styles.secondaryButtonLabel}>Meet another kid</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <KidPhotoBlock kid={kid} activeIndex={activePhotoIndex} setActiveIndex={setActivePhotoIndex} />

      <View style={styles.contentBlock}>
        {kid.student_of_month && (
          <View style={styles.sotmBadge}>
            <Text style={styles.sotmBadgeLabel}>
              ★ Student of the Month · {kid.student_of_month}
            </Text>
            {kid.student_of_month_reason && (
              <Text style={styles.sotmReason}>
                &ldquo;{kid.student_of_month_reason}&rdquo;
              </Text>
            )}
          </View>
        )}

        <Text style={styles.kidName}>{kid.display_name}</Text>

        {kid.name_meaning && (
          <Text style={styles.kidMeaning}>{kid.name_meaning}</Text>
        )}

        {(kid.age || kid.grade_class) && (
          <Text style={styles.kidMeta}>
            {[kid.age ? `Age ${kid.age}` : null, kid.grade_class || null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}

        {kid.child_quote && (
          <View style={styles.childQuoteBlock}>
            <Text style={styles.childQuoteText}>
              &ldquo;{kid.child_quote}&rdquo;
            </Text>
            <Text style={styles.childQuoteAttribution}>
              — {kid.first_name || 'them'}
            </Text>
          </View>
        )}

        {kid.home_village && <KidFact label="Home" value={kid.home_village} />}
        {kid.family_context && <KidFact label="Family" value={kid.family_context} />}
        {kid.loves && (
          <KidFact label={`About ${kid.first_name || 'them'}`} value={kid.loves} />
        )}

        {kid.notes && (
          <KidFact
            label={`More about ${kid.first_name || 'them'}`}
            value={kid.notes}
          />
        )}

        {kid.teacher_quote && (
          <View style={styles.teacherBlock}>
            <Text style={styles.factLabel}>
              From {kid.first_name || 'their'} teacher
            </Text>
            <Text style={styles.childQuoteText}>
              &ldquo;{kid.teacher_quote}&rdquo;
            </Text>
            {kid.teacher_name && (
              <Text style={styles.teacherName}>— {kid.teacher_name}</Text>
            )}
          </View>
        )}

        <SponsorCTA firstName={kid.first_name || 'them'} shirtNumber={kid.shirt_number ?? shirtNumber} />
      </View>
    </ScrollView>
  );
}

function KidPhotoBlock({
  kid,
  activeIndex,
  setActiveIndex,
}: {
  kid: Kid;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
}) {
  const photos = (kid.photo_urls && kid.photo_urls.length > 0)
    ? kid.photo_urls
    : (kid.photo_url ? [kid.photo_url] : []);

  if (photos.length === 0) {
    return (
      <View style={[styles.photoFrame, styles.photoPlaceholder]}>
        <Text style={styles.photoPlaceholderLabel}>Photo coming soon</Text>
        <View style={styles.shirtBadge}>
          <Text style={styles.shirtBadgeText}>#{kid.shirt_number ?? '?'}</Text>
        </View>
      </View>
    );
  }

  if (photos.length === 1) {
    return (
      <View style={styles.photoFrame}>
        <Image
          source={{ uri: photos[0] }}
          style={styles.photoFull}
          resizeMode="cover"
        />
        <View style={styles.shirtBadge}>
          <Text style={styles.shirtBadgeText}>#{kid.shirt_number ?? '?'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.photoFrame}>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <Image
            source={{ uri: item }}
            style={styles.photoFull}
            resizeMode="cover"
          />
        )}
        keyExtractor={(item, i) => `${item}-${i}`}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setActiveIndex(i);
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
    </View>
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

function SponsorCTA({ firstName, shirtNumber }: { firstName: string; shirtNumber: number }) {
  const sponsorUrl = `https://www.beanumber.org/sponsorship?child=${shirtNumber}`;
  return (
    <View style={styles.sponsorCard}>
      <Text style={styles.sponsorEyebrow}>Stay with {firstName}</Text>
      <Text style={styles.sponsorHeadline}>$25 a month keeps the campus running.</Text>
      <Text style={styles.sponsorBody}>
        Your monthly $25 funds the campus where {firstName} learns, eats, and
        sees a doctor. The whole pool funds the whole school. {firstName} is
        the face you stay close to.
      </Text>
      <Pressable
        style={styles.sponsorButton}
        onPress={() => Linking.openURL(sponsorUrl)}
      >
        <Text style={styles.sponsorButtonLabel}>Sponsor {firstName}</Text>
      </Pressable>
      <Text style={styles.sponsorFinePrint}>$25/month · cancel anytime</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    backgroundColor: COLORS.cream,
    paddingBottom: SPACING.xxl,
  },
  centerState: {
    flex: 1,
    backgroundColor: COLORS.cream,
    padding: SPACING.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLabel: {
    marginTop: SPACING.md,
    fontSize: 14,
    color: COLORS.midGray,
  },
  eyebrow: {
    fontSize: SIZES.eyebrow,
    fontWeight: '700',
    letterSpacing: 3,
    color: COLORS.gold,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  notFoundHeadline: {
    fontSize: SIZES.heading2,
    color: COLORS.nearBlack,
    fontFamily: FONT.serif,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  notFoundBody: {
    fontSize: SIZES.bodyLg,
    color: COLORS.midGray,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: SPACING.xl,
    maxWidth: 380,
  },
  photoFrame: {
    width: SCREEN_WIDTH,
    aspectRatio: 4 / 5,
    backgroundColor: COLORS.sandLight,
    position: 'relative',
  },
  photoFull: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  photoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderLabel: {
    color: COLORS.lightGray,
    fontSize: 14,
  },
  shirtBadge: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  shirtBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.gold,
  },
  pageIndicator: {
    position: 'absolute',
    bottom: SPACING.md,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  pageIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  pageIndicatorDotActive: {
    backgroundColor: COLORS.white,
  },
  contentBlock: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  sotmBadge: {
    marginBottom: SPACING.md,
  },
  sotmBadgeLabel: {
    backgroundColor: COLORS.gold,
    color: COLORS.nearBlack,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  sotmReason: {
    marginTop: SPACING.sm,
    fontStyle: 'italic',
    color: COLORS.midGray,
    fontSize: 14,
    fontFamily: FONT.serifItalic,
  },
  kidName: {
    fontSize: SIZES.heading1,
    color: COLORS.nearBlack,
    fontFamily: FONT.serif,
    marginBottom: SPACING.xs,
    lineHeight: 42,
  },
  kidMeaning: {
    fontSize: 16,
    color: COLORS.midGray,
    fontStyle: 'italic',
    fontFamily: FONT.serifItalic,
    marginBottom: SPACING.md,
  },
  kidMeta: {
    fontSize: SIZES.bodyLg,
    color: COLORS.midGray,
    marginBottom: SPACING.lg,
  },
  childQuoteBlock: {
    marginBottom: SPACING.lg,
  },
  childQuoteText: {
    fontSize: 22,
    fontStyle: 'italic',
    color: COLORS.nearBlack,
    lineHeight: 32,
    fontFamily: FONT.serifItalic,
  },
  childQuoteAttribution: {
    marginTop: SPACING.sm,
    fontSize: 11,
    color: COLORS.lightGray,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  factBlock: {
    marginBottom: SPACING.lg,
  },
  factLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: SPACING.xs,
  },
  factValue: {
    fontSize: SIZES.bodyLg,
    color: COLORS.bodyTextLight,
    lineHeight: 26,
  },
  teacherBlock: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.gold,
    paddingLeft: SPACING.md,
    marginBottom: SPACING.lg,
  },
  teacherName: {
    marginTop: SPACING.sm,
    fontSize: 13,
    color: COLORS.midGray,
  },
  departureBanner: {
    backgroundColor: COLORS.sandLight,
    borderWidth: 2,
    borderColor: COLORS.midGray,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  departureLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.midGray,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: SPACING.xs,
  },
  departureNote: {
    fontSize: 16,
    color: COLORS.bodyTextLight,
    lineHeight: 24,
    fontFamily: FONT.serifItalic,
  },
  sponsorCard: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.gold,
    padding: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  sponsorEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  sponsorHeadline: {
    fontSize: SIZES.heading2,
    color: COLORS.nearBlack,
    fontFamily: FONT.serif,
    lineHeight: 34,
    marginBottom: SPACING.md,
  },
  sponsorBody: {
    fontSize: SIZES.bodyLg,
    color: COLORS.bodyTextLighter,
    lineHeight: 26,
    marginBottom: SPACING.lg,
  },
  sponsorButton: {
    backgroundColor: COLORS.gold,
    paddingVertical: 18,
    alignItems: 'center',
  },
  sponsorButtonLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.nearBlack,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  sponsorFinePrint: {
    marginTop: SPACING.sm,
    fontSize: 12,
    color: COLORS.lightGray,
    textAlign: 'center',
  },
  secondaryButton: {
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.sand,
    paddingVertical: 16,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  secondaryButtonLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.nearBlack,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  linkButton: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  linkButtonLabel: {
    fontSize: 14,
    color: COLORS.gold,
    textDecorationLine: 'underline',
  },
});
