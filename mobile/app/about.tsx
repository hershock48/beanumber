/**
 * About screen — what BAN is, who runs it, what the money does.
 * Static content for now. Phase 2 may pull from a CMS / Airtable.
 */
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT, SIZES, SPACING } from '../lib/theme';

export default function AboutScreen() {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.eyebrow}>Be A Number, International</Text>
      <Text style={styles.headline}>
        A campus in Northern Uganda. A number on the back of a shirt. A real
        kid you can name.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>The campus</Text>
        <Text style={styles.body}>
          Hope Bridge School and the on-site clinic sit on six acres in
          Omoro District, Northern Uganda. The YDO team runs it day to day.
          Ugandan teachers teach the kids. We fund it.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>The math</Text>
        <Text style={styles.body}>
          $25 a month per sponsor goes into a single pool. That pool funds
          school fees, daily meals, the clinic, teachers&rsquo; salaries,
          books, uniforms, mentorship. Every kid gets the same. No per-kid
          budgeting. The kid you sponsor is your relationship and the face
          of the work, not their funder.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>The shirts</Text>
        <Text style={styles.body}>
          Every shirt has a number on the back. That number maps to a real
          kid at the campus. You meet them by typing the number into this
          app. They become &ldquo;yours&rdquo; — not legally, not
          financially, just relationally. You follow their year.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>The org</Text>
        <Text style={styles.body}>
          BAN is a U.S. 501(c)(3) nonprofit, EIN 93-1948872. Tax-deductible
          to the extent allowed by law. Kevin Hershock founded it and runs
          it from Marshall, Michigan.
        </Text>
      </View>

      <Pressable
        style={styles.linkRow}
        onPress={() => Linking.openURL('https://www.beanumber.org/founder')}
      >
        <Text style={styles.linkLabel}>Kevin&rsquo;s story →</Text>
      </Pressable>
      <Pressable
        style={styles.linkRow}
        onPress={() => Linking.openURL('https://www.beanumber.org/governance')}
      >
        <Text style={styles.linkLabel}>Governance &amp; financials →</Text>
      </Pressable>
      <Pressable
        style={styles.linkRow}
        onPress={() => Linking.openURL('https://www.beanumber.org/impact')}
      >
        <Text style={styles.linkLabel}>2025 impact →</Text>
      </Pressable>
      <Pressable
        style={styles.linkRow}
        onPress={() => Linking.openURL('mailto:Kevin@beanumber.org')}
      >
        <Text style={styles.linkLabel}>Email Kevin →</Text>
      </Pressable>
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
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    color: COLORS.gold,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  headline: {
    fontSize: SIZES.heading1,
    color: COLORS.nearBlack,
    fontFamily: FONT.serif,
    lineHeight: 42,
    marginBottom: SPACING.xl,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  body: {
    fontSize: SIZES.bodyLg,
    color: COLORS.bodyTextLight,
    lineHeight: 28,
  },
  linkRow: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.sand,
  },
  linkLabel: {
    fontSize: 16,
    color: COLORS.gold,
    fontWeight: '700',
  },
});
