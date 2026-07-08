/**
 * Campus newsfeed screen — mobile reproduction of /news on the web.
 *
 * Fetches recent published newsletters, renders the most recent in
 * full and the older ones as expandable cards. Newsletter body
 * comes in as authored HTML; for v0.1 we strip tags and render
 * plain text. Phase 1.3 swaps in a proper HTML renderer
 * (react-native-render-html) so paragraphs and headings keep
 * structure.
 *
 * No nav chrome — header is set by the root layout's stack.
 */
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS, FONT, SIZES, SPACING } from '../lib/theme';
import { getRecentNewsletters, type CampusNewsletter } from '../lib/api';

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
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function NewsfeedScreen() {
  const [newsletters, setNewsletters] = useState<CampusNewsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await getRecentNewsletters();
        if (!cancelled) setNewsletters(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  if (newsletters.length === 0) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.placeholderHeadline}>
          The first letter is on the way.
        </Text>
        <Text style={styles.placeholderBody}>
          Once the first newsletter goes out, it&rsquo;ll live here.
        </Text>
      </View>
    );
  }

  const [featured, ...archive] = newsletters;
  const featuredBody = stripHtml(featured.bodyHtml || '');

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerBlock}>
        <Text style={styles.eyebrow}>From the campus</Text>
        <Text style={styles.pageHeadline}>What&rsquo;s happening on the ground.</Text>
        <Text style={styles.pageSubhead}>
          One letter a month from Kevin and the YDO team in Omoro District. The
          school, the clinic, the cooks, the kids.
        </Text>
      </View>

      <View style={styles.featuredCard}>
        {featured.heroPhotoUrl && (
          <Image
            source={{ uri: featured.heroPhotoUrl }}
            style={styles.featuredHero}
            resizeMode="cover"
          />
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

      {archive.length > 0 && (
        <View style={styles.archiveSection}>
          <Text style={styles.archiveLabel}>Earlier this year</Text>
          {archive.map(n => {
            const expanded = expandedIds.has(n.id);
            const body = stripHtml(n.bodyHtml || '');
            const teaser = body.slice(0, 180) + (body.length > 180 ? '…' : '');
            return (
              <Pressable
                key={n.id}
                style={styles.archiveCard}
                onPress={() => toggle(n.id)}
              >
                {n.publishedAt && (
                  <Text style={styles.archiveDate}>{formatDate(n.publishedAt)}</Text>
                )}
                <Text style={styles.archiveHeading}>
                  {n.subject || n.title || 'From the campus'}
                </Text>
                <Text style={styles.archiveBody}>
                  {expanded ? body : teaser}
                </Text>
                <Text style={styles.archiveAction}>
                  {expanded ? 'Close ↑' : 'Read this month →'}
                </Text>
              </Pressable>
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
  centerState: {
    flex: 1,
    backgroundColor: COLORS.cream,
    padding: SPACING.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderHeadline: {
    fontSize: SIZES.heading2,
    fontFamily: FONT.serif,
    color: COLORS.nearBlack,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  placeholderBody: {
    fontSize: SIZES.bodyLg,
    color: COLORS.midGray,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 26,
  },
  headerBlock: {
    marginBottom: SPACING.lg,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    color: COLORS.gold,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  pageHeadline: {
    fontSize: SIZES.heading1,
    color: COLORS.nearBlack,
    fontFamily: FONT.serif,
    lineHeight: 42,
    marginBottom: SPACING.sm,
  },
  pageSubhead: {
    fontSize: SIZES.bodyLg,
    color: COLORS.midGray,
    lineHeight: 26,
  },
  featuredCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.sand,
    marginBottom: SPACING.xl,
  },
  featuredHero: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: COLORS.sandLight,
  },
  featuredContent: {
    padding: SPACING.lg,
  },
  featuredMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  featuredEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  featuredDate: {
    fontSize: 11,
    color: COLORS.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  featuredHeading: {
    fontSize: SIZES.heading2,
    color: COLORS.nearBlack,
    fontFamily: FONT.serif,
    lineHeight: 34,
    marginBottom: SPACING.md,
  },
  featuredBody: {
    fontSize: SIZES.bodyLg,
    color: COLORS.bodyText,
    lineHeight: 28,
  },
  archiveSection: {
    marginTop: SPACING.lg,
  },
  archiveLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: SPACING.md,
  },
  archiveCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.sand,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  archiveDate: {
    fontSize: 11,
    color: COLORS.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: SPACING.xs,
  },
  archiveHeading: {
    fontSize: SIZES.heading3,
    color: COLORS.nearBlack,
    fontFamily: FONT.serif,
    lineHeight: 28,
    marginBottom: SPACING.sm,
  },
  archiveBody: {
    fontSize: SIZES.body,
    color: COLORS.bodyTextLighter,
    lineHeight: 24,
    marginBottom: SPACING.sm,
  },
  archiveAction: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});
