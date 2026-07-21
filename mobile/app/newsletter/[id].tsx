/**
 * /newsletter/[id] — full newsletter view.
 *
 * Renders the newsletter's hero photo, title, teaser, and body HTML.
 * The body HTML comes from the same source the web renders — the
 * kids' pages on beanumber.org already publish it inline, so this
 * screen is essentially a mobile-native reader for the same content.
 *
 * For v1: uses react-native-webview for the bodyHtml block. Not a
 * heavy render — a few hundred words with img tags. Later we can
 * render the HTML natively (parse to blocks) if webview feels foreign.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';
import { Text } from '../../components/design/Text';
import { Skeleton } from '../../components/design/Skeleton';
import {
  authJson,
  LatestNewsletter,
  ApiError,
} from '../../lib/api';

export default function NewsletterView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [n, setN] = useState<LatestNewsletter | null>(null);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      // By-id endpoint — this screen used to fetch /latest no matter
      // which issue was tapped, which was only right by coincidence.
      const data = await authJson<LatestNewsletter & { id: string | null }>(
        `/api/mobile/v1/newsletter/${id}`
      );
      setN(data && data.id ? data : null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Stale id (old push, unpublished issue) — fall back to the
        // latest rather than showing a dead screen.
        try {
          const data = await authJson<LatestNewsletter & { id: string | null }>(
            '/api/mobile/v1/newsletter/latest'
          );
          setN(data && data.id ? data : null);
        } catch {
          /* empty state renders */
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn('Newsletter fetch failed', err);
      }
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: COLORS.cream }}
      edges={['bottom']}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: SPACING.section,
        }}
      >
        {loading || !n ? (
          <View style={{ padding: SPACING.l }}>
            <Skeleton
              height={width * 0.5}
              radius={RADIUS.cardLarge}
            />
            <Skeleton
              height={40}
              style={{ marginTop: SPACING.xl, width: '80%' }}
            />
            <Skeleton
              height={20}
              style={{ marginTop: SPACING.s, width: '60%' }}
            />
          </View>
        ) : (
          <>
            {n.heroPhotoUrl ? (
              <Image
                source={{ uri: n.heroPhotoUrl }}
                style={{
                  width: '100%',
                  aspectRatio: 16 / 9,
                  backgroundColor: COLORS.sand,
                }}
                contentFit="cover"
                contentPosition="top"
                transition={300}
              />
            ) : null}
            <View style={{ padding: SPACING.l }}>
              <Text variant="h1" color="ink">
                {n.title}
              </Text>
              {n.teaser ? (
                <Text
                  variant="body"
                  color="ink"
                  style={{
                    marginTop: SPACING.m,
                    fontStyle: 'italic',
                  }}
                >
                  {n.teaser}
                </Text>
              ) : null}
              {n.bodyHtml ? (
                <View style={{ marginTop: SPACING.xl }}>
                  <BodyHtmlBlocks html={n.bodyHtml} />
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Very minimal HTML-to-blocks renderer for the newsletter body. Handles
 * <h2>, <p>, and inline <img> tags. For anything more complex we'd swap
 * to react-native-render-html or webview — but the newsletter format is
 * intentionally constrained per the brief so this is plenty for v1.
 */
function BodyHtmlBlocks({ html }: { html: string }) {
  const blocks = html
    .split(/<\/?(?:h2|p|img)[^>]*>/i)
    .map(chunk => chunk.trim())
    .filter(Boolean);
  const imgMatches = Array.from(
    html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)
  ).map(m => m[1]);
  const h2Matches = Array.from(
    html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)
  ).map(m => stripTags(m[1]));

  // Reconstruct the ordering: walk the original string, emit each
  // element in order. Simpler + safer than combining split arrays.
  const elements: Array<
    | { kind: 'h2'; text: string }
    | { kind: 'p'; text: string }
    | { kind: 'img'; src: string }
  > = [];
  const re = /<(h2|p|img)[^>]*>([\s\S]*?)(?:<\/(h2|p)>|)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    if (tag === 'img') {
      const src = /src=["']([^"']+)["']/i.exec(m[0])?.[1];
      if (src) elements.push({ kind: 'img', src });
    } else if (tag === 'h2') {
      elements.push({ kind: 'h2', text: stripTags(m[2]) });
    } else if (tag === 'p') {
      elements.push({ kind: 'p', text: stripTags(m[2]) });
    }
  }

  return (
    <>
      {elements.map((el, i) => {
        if (el.kind === 'h2') {
          return (
            <Text
              key={i}
              variant="h2"
              color="ink"
              style={{ marginTop: SPACING.xl, marginBottom: SPACING.s }}
            >
              {el.text}
            </Text>
          );
        }
        if (el.kind === 'p') {
          return (
            <Text
              key={i}
              variant="body"
              color="ink"
              style={{ marginBottom: SPACING.m }}
            >
              {el.text}
            </Text>
          );
        }
        return (
          <Image
            key={i}
            source={{ uri: el.src }}
            style={{
              width: '100%',
              aspectRatio: 16 / 9,
              backgroundColor: COLORS.sand,
              borderRadius: RADIUS.cardLarge,
              marginVertical: SPACING.m,
            }}
            contentFit="cover"
            contentPosition="top"
            transition={200}
          />
        );
      })}
    </>
  );
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .trim();
}
