/**
 * Campus newsfeed — magazine-cover treatment.
 *
 * Each newsletter renders as a tall hero card: full-bleed photo
 * with a soft gradient over the bottom third, serif title floated
 * over the photo, date in small caps. The featured (latest) gets
 * the largest cover; earlier newsletters render as smaller covers
 * in a stack. Tap to expand the body inline.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { COLORS, FONT, SIZES, SPACING } from '../../lib/theme';
import { getRecentNewsletters, type CampusNewsletter } from '../../lib/api';
import { tap as hapticTap } from '../../lib/haptics';

const SCREEN_WIDTH = Dimensions.get('window').width;

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|h\d|li|div)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&mdash;/g, '—')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return ''; }
}

function formatMonthShort(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', year: 'numeric',
    }).toUpperCase();
  } catch { return ''; }
}

export default function NewsfeedScreen() {
  const [newsletters, setNewsletters] = useState<CampusNewsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const list = await getRecentNewsletters();
    setNewsletters(list);
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

  const toggle = (id: string) => {
    hapticTap();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  if (newsletters.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.centerScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />
        }
      >
        <Text style={styles.placeholderHeadline}>The first letter is on the way.</Text>
        <Text style={styles.placeholderBody}>
          Once the first newsletter goes out, it&rsquo;ll live here.
        </Text>
      </ScrollView>
    );
  }

  const [featured, ...archive] = newsletters;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />
      }
    >
      <Animated.View entering={FadeIn.duration(400)}>
        <Text style={styles.pageHeader}>The campus newsfeed</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(500).delay(80)}>
        <NewsletterCover
          newsletter={featured}
          variant="featured"
          isOpen={expanded.has(featured.id)}
          onToggle={() => toggle(featured.id)}
        />
      </Animated.View>

      {archive.length > 0 && (
        <View style={styles.archiveSection}>
          <Text style={styles.archiveLabel}>Earlier this year</Text>
          {archive.map((n, i) => (
            <Animated.View
              key={n.id}
              entering={FadeInDown.duration(400).delay(160 + i * 40)}
            >
              <NewsletterCover
                newsletter={n}
                variant="archive"
                isOpen={expanded.has(n.id)}
                onToggle={() => toggle(n.id)}
              />
            </Animated.View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function NewsletterCover({
  newsletter,
  variant,
  isOpen,
  onToggle,
}: {
  newsletter: CampusNewsletter;
  variant: 'featured' | 'archive';
  isOpen: boolean;
  onToggle: () => void;
}) {
  const heading = newsletter.subject || newsletter.title || 'From the campus';
  const body = stripHtml(newsletter.bodyHtml || '');
  const teaser = body.slice(0, 200) + (body.length > 200 ? '…' : '');
  const heroHeight = variant === 'featured' ? 480 : 280;
  const titleSize = variant === 'featured' ? 34 : 24;
  const titleLineHeight = variant === 'featured' ? 40 : 30;

  return (
    <Pressable
      onPress={onToggle}
      style={[
        styles.cover,
        variant === 'featured' ? styles.coverFeatured : styles.coverArchive,
      ]}
    >
      {newsletter.heroPhotoUrl ? (
        <ImageBackground
          source={{ uri: newsletter.heroPhotoUrl }}
          style={[styles.coverHero, { height: heroHeight }]}
          imageStyle={styles.coverHeroImg}
        >
          <View style={styles.coverDim} />
          <View style={styles.coverHeroContent}>
            <Text style={styles.coverDate}>
              {formatMonthShort(newsletter.publishedAt)}
            </Text>
            <Text
              style={[
                styles.coverTitle,
                { fontSize: titleSize, lineHeight: titleLineHeight },
              ]}
            >
              {heading}
            </Text>
            <Text style={styles.coverAction}>
              {isOpen ? 'Close ↑' : 'Read this issue →'}
            </Text>
          </View>
        </ImageBackground>
      ) : (
        <View
          style={[
            styles.coverHero,
            { height: heroHeight, backgroundColor: COLORS.nearBlack },
          ]}
        >
          <View style={styles.coverHeroContent}>
            <Text style={styles.coverDate}>
              {formatMonthShort(newsletter.publishedAt)}
            </Text>
            <Text
              style={[
                styles.coverTitle,
                { fontSize: titleSize, lineHeight: titleLineHeight },
              ]}
            >
              {heading}
            </Text>
            <Text style={styles.coverAction}>
              {isOpen ? 'Close ↑' : 'Read this issue →'}
            </Text>
          </View>
        </View>
      )}

      {isOpen && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.coverBody}>
          <Text style={styles.coverBodyDate}>
            {formatDate(newsletter.publishedAt)}
          </Text>
          <Text style={styles.coverBodyText}>{body || teaser}</Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    backgroundColor: COLORS.cream,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  centerScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.cream,
  },
  center: { flex: 1, backgroundColor: COLORS.cream, justifyContent: 'center', alignItems: 'center' },
  placeholderHeadline: {
    fontSize: SIZES.heading2, fontFamily: FONT.serif,
    color: COLORS.nearBlack, textAlign: 'center', marginBottom: SPACING.md,
  },
  placeholderBody: {
    fontSize: SIZES.bodyLg, color: COLORS.midGray, textAlign: 'center',
    maxWidth: 320, lineHeight: 26,
  },
  pageHeader: {
    fontSize: 11, fontWeight: '700', letterSpacing: 2,
    color: COLORS.gold, textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  cover: {
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  coverFeatured: {},
  coverArchive: {},
  coverHero: {
    width: '100%',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  coverHeroImg: { resizeMode: 'cover' },
  coverDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 13, 13, 0.45)',
  },
  coverHeroContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  coverDate: {
    fontSize: 11, fontWeight: '700', letterSpacing: 3,
    color: COLORS.gold, textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  coverTitle: {
    fontFamily: FONT.serif,
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  coverAction: {
    fontSize: 12, fontWeight: '700', letterSpacing: 1.5,
    color: COLORS.white, textTransform: 'uppercase',
    opacity: 0.92,
  },
  coverBody: {
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.sand, borderTopWidth: 0,
  },
  coverBodyDate: {
    fontSize: 11, color: COLORS.lightGray, letterSpacing: 1.5,
    marginBottom: SPACING.sm, textTransform: 'uppercase',
  },
  coverBodyText: {
    fontSize: SIZES.bodyLg, color: COLORS.bodyText,
    lineHeight: 28, fontFamily: FONT.serifItalic,
  },
  archiveSection: { marginTop: SPACING.lg },
  archiveLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.lightGray,
    textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACING.md,
  },
});
