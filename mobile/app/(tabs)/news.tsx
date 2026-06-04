/**
 * Campus newsfeed. Same content model as before, now with
 * pull-to-refresh and entrance animations on cards.
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
import { COLORS, FONT, SIZES, SPACING } from '../../lib/theme';
import { getRecentNewsletters, type CampusNewsletter } from '../../lib/api';
import { tap as hapticTap } from '../../lib/haptics';

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
      >
        <Text style={styles.placeholderHeadline}>The first letter is on the way.</Text>
        <Text style={styles.placeholderBody}>
          Once the first newsletter goes out, it&rsquo;ll live here.
        </Text>
      </ScrollView>
    );
  }

  const [featured, ...archive] = newsletters;
  const featuredBody = stripHtml(featured.bodyHtml || '');

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
    >
      <Animated.View entering={FadeIn.duration(400)}>
        <View style={styles.headerBlock}>
          <Text style={styles.eyebrow}>From the campus</Text>
          <Text style={styles.pageHeadline}>What&rsquo;s happening on the ground.</Text>
          <Text style={styles.pageSubhead}>
            One letter a month from Kevin and the YDO team in Omoro District.
            The school, the clinic, the cooks, the kids.
          </Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(500).delay(80)}>
        <View style={styles.featuredCard}>
          {featured.heroPhotoUrl && (
            <Image source={{ uri: featured.heroPhotoUrl }} style={styles.featuredHero} resizeMode="cover" />
          )}
          <View style={styles.featuredContent}>
            <View style={styles.featuredMeta}>
              <Text style={styles.featuredEyebrow}>Latest newsletter</Text>
              {featured.publishedAt && (
                <Text style={styles.featuredDate}>{formatDate(featured.publishedAt)}</Text>
              )}
            </View>
            <Text style={styles.featuredHeading}>
              {featured.subject || featured.title || 'From the campus'}
            </Text>
            <Text style={styles.featuredBody}>{featuredBody}</Text>
          </View>
        </View>
      </Animated.View>

      {archive.length > 0 && (
        <View style={styles.archiveSection}>
          <Text style={styles.archiveLabel}>Earlier this year</Text>
          {archive.map((n, i) => {
            const isOpen = expanded.has(n.id);
            const body = stripHtml(n.bodyHtml || '');
            const teaser = body.slice(0, 180) + (body.length > 180 ? '…' : '');
            return (
              <Animated.View
                key={n.id}
                entering={FadeInDown.duration(400).delay(160 + i * 40)}
              >
                <Pressable style={styles.archiveCard} onPress={() => toggle(n.id)}>
                  {n.publishedAt && <Text style={styles.archiveDate}>{formatDate(n.publishedAt)}</Text>}
                  <Text style={styles.archiveHeading}>
                    {n.subject || n.title || 'From the campus'}
                  </Text>
                  <Text style={styles.archiveBody}>{isOpen ? body : teaser}</Text>
                  <Text style={styles.archiveAction}>
                    {isOpen ? 'Close ↑' : 'Read this month →'}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      )}
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
  centerScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.cream,
  },
  center: { flex: 1, backgroundColor: COLORS.cream, justifyContent: 'center', alignItems: 'center' },
  placeholderHeadline: {
    fontSize: SIZES.heading2,
    fontFamily: FONT.serif,
    color: COLORS.nearBlack,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  placeholderBody: {
    fontSize: SIZES.bodyLg, color: COLORS.midGray, textAlign: 'center',
    maxWidth: 320, lineHeight: 26,
  },
  headerBlock: { marginBottom: SPACING.lg },
  eyebrow: {
    fontSize: 12, fontWeight: '700', letterSpacing: 3,
    color: COLORS.gold, textTransform: 'uppercase', marginBottom: SPACING.sm,
  },
  pageHeadline: {
    fontSize: SIZES.heading1, color: COLORS.nearBlack,
    fontFamily: FONT.serif, lineHeight: 42, marginBottom: SPACING.sm,
  },
  pageSubhead: { fontSize: SIZES.bodyLg, color: COLORS.midGray, lineHeight: 26 },
  featuredCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.sand,
    marginBottom: SPACING.xl,
  },
  featuredHero: { width: '100%', aspectRatio: 16 / 9, backgroundColor: COLORS.sandLight },
  featuredContent: { padding: SPACING.lg },
  featuredMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  featuredEyebrow: {
    fontSize: 11, fontWeight: '700', color: COLORS.gold,
    textTransform: 'uppercase', letterSpacing: 2,
  },
  featuredDate: {
    fontSize: 11, color: COLORS.lightGray,
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
  featuredHeading: {
    fontSize: SIZES.heading2, color: COLORS.nearBlack,
    fontFamily: FONT.serif, lineHeight: 34, marginBottom: SPACING.md,
  },
  featuredBody: { fontSize: SIZES.bodyLg, color: COLORS.bodyText, lineHeight: 28 },
  archiveSection: { marginTop: SPACING.lg },
  archiveLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.lightGray,
    textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACING.md,
  },
  archiveCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.sand,
    padding: SPACING.lg, marginBottom: SPACING.md,
  },
  archiveDate: {
    fontSize: 11, color: COLORS.lightGray,
    textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACING.xs,
  },
  archiveHeading: {
    fontSize: SIZES.heading3, color: COLORS.nearBlack,
    fontFamily: FONT.serif, lineHeight: 28, marginBottom: SPACING.sm,
  },
  archiveBody: { fontSize: SIZES.body, color: COLORS.bodyTextLighter, lineHeight: 24, marginBottom: SPACING.sm },
  archiveAction: {
    fontSize: 12, fontWeight: '700', color: COLORS.gold,
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
});
