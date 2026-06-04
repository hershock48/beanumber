/**
 * Home — number entry with identity strip + TodayPanel + recents.
 *
 * Identity strip at the top: "Visiting since [Month YYYY] · You've
 * met N kids" or simpler variant if you haven't met any yet. Builds
 * a sense of relationship with the org without requiring auth.
 *
 * TodayPanel below the strip surfaces a live "Hope Bridge, right
 * now" line + a deterministic kid-of-the-day so opening the app
 * always shows something fresh.
 *
 * Recents strip persists kids you've met across launches.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { COLORS, FONT, SIZES, SPACING } from '../../lib/theme';
import {
  getRecents,
  ensureVisitorSince,
  daysSince,
  type RecentKid,
} from '../../lib/storage';
import {
  error as hapticError,
  press as hapticPress,
  tap as hapticTap,
} from '../../lib/haptics';
import { TodayPanel } from '../../components/TodayPanel';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [number, setNumber] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentKid[]>([]);
  const [visitorDays, setVisitorDays] = useState<number | null>(null);

  useEffect(() => {
    ensureVisitorSince().then(since => {
      setVisitorDays(daysSince(since));
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getRecents().then(r => {
        if (!cancelled) setRecents(r);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const handleSubmit = () => {
    const n = parseInt(number, 10);
    if (!number || isNaN(n) || n <= 0) {
      hapticError();
      setFormError('Type a shirt number to meet your kid.');
      return;
    }
    hapticPress();
    setFormError(null);
    router.push(`/children/${n}`);
  };

  const openRecent = (k: RecentKid) => {
    hapticTap();
    router.push(`/children/${k.shirtNumber}`);
  };

  const metCount = recents.length;
  const identityLine = metCount === 0
    ? `Visiting Be A Number${visitorDays !== null ? ` · ${visitorDays === 0 ? 'just arrived' : `${visitorDays} day${visitorDays === 1 ? '' : 's'} in`}` : ''}`
    : `You've met ${metCount} kid${metCount === 1 ? '' : 's'}${visitorDays !== null && visitorDays > 0 ? ` · ${visitorDays} day${visitorDays === 1 ? '' : 's'} in` : ''}`;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + SPACING.lg, paddingBottom: insets.bottom + SPACING.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(400)} style={styles.identityStrip}>
          <Text style={styles.identityLabel}>{identityLine}</Text>
        </Animated.View>

        <TodayPanel />

        <Animated.View entering={FadeInDown.duration(500).delay(120)} style={styles.heroBlock}>
          <Text style={styles.eyebrow}>Be A Number</Text>
          <Text style={styles.headline}>Type your number.</Text>
          <Text style={styles.subhead}>
            The number on the back of your shirt is a real kid at Hope
            Bridge. Type it to meet them.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(200)}>
          <TextInput
            style={styles.input}
            value={number}
            onChangeText={t => {
              setFormError(null);
              setNumber(t.replace(/[^0-9]/g, ''));
            }}
            onFocus={() => hapticTap()}
            placeholder="e.g. 38"
            placeholderTextColor={COLORS.lightGray}
            keyboardType="number-pad"
            maxLength={5}
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
          />

          {formError && <Text style={styles.error}>{formError}</Text>}

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={handleSubmit}
          >
            <Text style={styles.buttonLabel}>Meet your kid</Text>
          </Pressable>
        </Animated.View>

        {recents.length > 0 && (
          <Animated.View entering={FadeInDown.duration(500).delay(320)} style={styles.recentsBlock}>
            <Text style={styles.sectionLabel}>Kids you&rsquo;ve met</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentsRow}
            >
              {recents.map(k => (
                <Pressable
                  key={k.shirtNumber}
                  style={styles.recentCard}
                  onPress={() => openRecent(k)}
                >
                  <View style={styles.recentPhotoFrame}>
                    {k.photoUrl ? (
                      <Image source={{ uri: k.photoUrl }} style={styles.recentPhoto} />
                    ) : (
                      <View style={[styles.recentPhoto, styles.recentPhotoFallback]} />
                    )}
                  </View>
                  <Text style={styles.recentName} numberOfLines={1}>
                    {k.firstName}
                  </Text>
                  <Text style={styles.recentNumber}>#{k.shirtNumber}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    flexGrow: 1,
  },
  identityStrip: {
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.sand,
    marginBottom: SPACING.lg,
  },
  identityLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: COLORS.midGray,
    textTransform: 'uppercase',
  },
  heroBlock: { marginTop: SPACING.md },
  eyebrow: {
    fontSize: SIZES.eyebrow, fontWeight: '700', letterSpacing: 3,
    color: COLORS.gold, textTransform: 'uppercase', marginBottom: SPACING.md,
  },
  headline: {
    fontSize: SIZES.hero, color: COLORS.nearBlack,
    lineHeight: 50, marginBottom: SPACING.md,
    fontFamily: FONT.serif,
  },
  subhead: {
    fontSize: SIZES.bodyLg, color: COLORS.midGray,
    lineHeight: 26, marginBottom: SPACING.xl,
  },
  input: {
    fontSize: 28, color: COLORS.nearBlack,
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.sand,
    paddingHorizontal: SPACING.lg, paddingVertical: 18,
    marginBottom: SPACING.md,
    fontVariant: ['tabular-nums'],
  },
  error: { fontSize: 14, color: COLORS.error, marginBottom: SPACING.md },
  button: {
    backgroundColor: COLORS.gold,
    paddingVertical: 18, alignItems: 'center',
    marginTop: SPACING.sm,
  },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  buttonLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.nearBlack,
    textTransform: 'uppercase', letterSpacing: 2,
  },
  recentsBlock: { marginTop: SPACING.xxl },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.gold,
    textTransform: 'uppercase', letterSpacing: 2,
    marginBottom: SPACING.md,
  },
  recentsRow: { gap: SPACING.md, paddingRight: SPACING.lg },
  recentCard: { width: 88 },
  recentPhotoFrame: {
    width: 88, height: 88,
    backgroundColor: COLORS.sandLight,
    marginBottom: SPACING.sm, overflow: 'hidden',
  },
  recentPhoto: { width: '100%', height: '100%' },
  recentPhotoFallback: { backgroundColor: COLORS.sand },
  recentName: { fontSize: 13, color: COLORS.nearBlack, fontFamily: FONT.serif },
  recentNumber: { fontSize: 11, color: COLORS.lightGray, marginTop: 2 },
});
