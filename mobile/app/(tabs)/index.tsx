/**
 * Home — number entry, with the additions that make it feel like
 * an app instead of a form:
 *   - Recently met kids strip above the input (AsyncStorage).
 *   - Live campus context line ("9:43 PM in Omoro. Most kids
 *     are asleep.").
 *   - Haptic on input tap, press on the button, success when
 *     navigation fires.
 *   - Subtle entrance animation on first paint.
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
import { getRecents, type RecentKid } from '../../lib/storage';
import { getCampusContextLine } from '../../lib/campus';
import { error as hapticError, press as hapticPress, tap as hapticTap } from '../../lib/haptics';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [number, setNumber] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentKid[]>([]);
  const [campusLine, setCampusLine] = useState(getCampusContextLine());

  // Refresh recents + campus context every time the home screen
  // gets focus (e.g. after returning from a kid profile).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getRecents().then(r => {
        if (!cancelled) setRecents(r);
      });
      setCampusLine(getCampusContextLine());
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // Tick the campus context every minute while the screen is
  // mounted so "9:43" doesn't sit there at 10:15.
  useEffect(() => {
    const id = setInterval(() => setCampusLine(getCampusContextLine()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + SPACING.xl, paddingBottom: insets.bottom + SPACING.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(400)}>
          <View style={styles.campusLine}>
            <View style={styles.campusDot} />
            <Text style={styles.campusLineText}>
              <Text style={styles.campusLineTime}>{campusLine.time}</Text>
              {'  ·  '}
              {campusLine.doing}
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(80)} style={styles.heroBlock}>
          <Text style={styles.eyebrow}>Be A Number</Text>
          <Text style={styles.headline}>Type your number.</Text>
          <Text style={styles.subhead}>
            The number on the back of your shirt is a real kid at Hope
            Bridge. Type it to meet them.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(160)}>
          <TextInput
            style={styles.input}
            value={number}
            onChangeText={(t) => {
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
          <Animated.View entering={FadeInDown.duration(500).delay(280)} style={styles.recentsBlock}>
            <Text style={styles.sectionLabel}>Kids you&rsquo;ve met</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentsRow}>
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
                  <Text style={styles.recentName} numberOfLines={1}>{k.firstName}</Text>
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
  campusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  campusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.gold,
    marginRight: SPACING.sm,
  },
  campusLineText: {
    fontSize: 12,
    color: COLORS.midGray,
    letterSpacing: 0.3,
  },
  campusLineTime: {
    fontWeight: '700',
    color: COLORS.nearBlack,
  },
  heroBlock: {
    marginTop: SPACING.md,
  },
  eyebrow: {
    fontSize: SIZES.eyebrow,
    fontWeight: '700',
    letterSpacing: 3,
    color: COLORS.gold,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  headline: {
    fontSize: SIZES.hero,
    color: COLORS.nearBlack,
    lineHeight: 50,
    marginBottom: SPACING.md,
    fontFamily: FONT.serif,
  },
  subhead: {
    fontSize: SIZES.bodyLg,
    color: COLORS.midGray,
    lineHeight: 26,
    marginBottom: SPACING.xl,
  },
  input: {
    fontSize: 28,
    color: COLORS.nearBlack,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.sand,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 18,
    marginBottom: SPACING.md,
    fontVariant: ['tabular-nums'],
  },
  error: {
    fontSize: 14,
    color: COLORS.error,
    marginBottom: SPACING.md,
  },
  button: {
    backgroundColor: COLORS.gold,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  buttonLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.nearBlack,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  recentsBlock: {
    marginTop: SPACING.xxl,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: SPACING.md,
  },
  recentsRow: {
    gap: SPACING.md,
    paddingRight: SPACING.lg,
  },
  recentCard: {
    width: 88,
  },
  recentPhotoFrame: {
    width: 88,
    height: 88,
    backgroundColor: COLORS.sandLight,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  recentPhoto: {
    width: '100%',
    height: '100%',
  },
  recentPhotoFallback: {
    backgroundColor: COLORS.sand,
  },
  recentName: {
    fontSize: 13,
    color: COLORS.nearBlack,
    fontFamily: FONT.serif,
  },
  recentNumber: {
    fontSize: 11,
    color: COLORS.lightGray,
    marginTop: 2,
  },
});
