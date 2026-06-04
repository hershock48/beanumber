/**
 * About — org overview + link-outs to the web for deeper content.
 */
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { COLORS, FONT, SIZES, SPACING } from '../../lib/theme';
import { tap as hapticTap } from '../../lib/haptics';

function linkOpen(url: string) {
  hapticTap();
  Linking.openURL(url).catch(() => {});
}

export default function AboutScreen() {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Animated.View entering={FadeIn.duration(400)}>
        <Text style={styles.eyebrow}>Be A Number, International</Text>
        <Text style={styles.headline}>
          A campus in Northern Uganda. A number on the back of a shirt. A real
          kid you can name.
        </Text>
      </Animated.View>

      {SECTIONS.map((s, i) => (
        <Animated.View
          key={s.label}
          entering={FadeInDown.duration(500).delay(80 + i * 60)}
          style={styles.section}
        >
          <Text style={styles.sectionLabel}>{s.label}</Text>
          <Text style={styles.body}>{s.body}</Text>
        </Animated.View>
      ))}

      <View style={styles.linksBlock}>
        {LINKS.map(l => (
          <Pressable key={l.label} style={styles.linkRow} onPress={() => linkOpen(l.url)}>
            <Text style={styles.linkLabel}>{l.label} →</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const SECTIONS = [
  {
    label: 'The campus',
    body:
      'Hope Bridge School and the on-site clinic sit on six acres in Omoro District, Northern Uganda. The YDO team runs it day to day. Ugandan teachers teach the kids. We fund it.',
  },
  {
    label: 'The math',
    body:
      '$25 a month per sponsor goes into a single pool. That pool funds school fees, daily meals, the clinic, teachers’ salaries, books, uniforms, mentorship. Every kid gets the same. No per-kid budgeting. The kid you sponsor is your relationship and the face of the work, not their funder.',
  },
  {
    label: 'The shirts',
    body:
      'Every shirt has a number on the back. That number maps to a real kid at the campus. You meet them by typing the number into this app. They become yours — not legally, not financially, just relationally. You follow their year.',
  },
  {
    label: 'The org',
    body:
      'BAN is a U.S. 501(c)(3) nonprofit, EIN 93-1948872. Tax-deductible to the extent allowed by law. Kevin Hershock founded it and runs it from Marshall, Michigan.',
  },
];

const LINKS = [
  { label: 'Kevin’s story', url: 'https://www.beanumber.org/founder' },
  { label: 'Governance & financials', url: 'https://www.beanumber.org/governance' },
  { label: '2025 impact', url: 'https://www.beanumber.org/impact' },
  { label: 'Email Kevin', url: 'mailto:Kevin@beanumber.org' },
];

const styles = StyleSheet.create({
  scrollContent: {
    backgroundColor: COLORS.cream,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  eyebrow: {
    fontSize: 12, fontWeight: '700', letterSpacing: 3,
    color: COLORS.gold, textTransform: 'uppercase', marginBottom: SPACING.md,
  },
  headline: {
    fontSize: SIZES.heading1, color: COLORS.nearBlack,
    fontFamily: FONT.serif, lineHeight: 42, marginBottom: SPACING.xl,
  },
  section: { marginBottom: SPACING.xl },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.gold,
    textTransform: 'uppercase', letterSpacing: 2, marginBottom: SPACING.sm,
  },
  body: { fontSize: SIZES.bodyLg, color: COLORS.bodyTextLight, lineHeight: 28 },
  linksBlock: { marginTop: SPACING.md },
  linkRow: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.sand,
  },
  linkLabel: { fontSize: 16, color: COLORS.gold, fontWeight: '700' },
});
