/**
 * Home screen — the number entry. The brand mechanic preserved
 * from the website. Type your shirt number, tap the button, get
 * pushed onto the kid profile screen.
 *
 * Secondary entries beneath the main flow link to the campus
 * newsfeed and the About page, so visitors without a shirt have
 * a way into the campus story without being asked to fake a
 * number.
 */
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { COLORS, FONT, SIZES, SPACING } from '../lib/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const n = parseInt(number, 10);
    if (!number || isNaN(n) || n <= 0) {
      setError('Type a shirt number to meet your kid.');
      return;
    }
    setError(null);
    router.push(`/children/${n}`);
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
      >
        <View style={styles.heroBlock}>
          <Text style={styles.eyebrow}>Be A Number</Text>
          <Text style={styles.headline}>Type your number.</Text>
          <Text style={styles.subhead}>
            The number on the back of your shirt is a real kid at the
            campus in Northern Uganda. Type it to meet them.
          </Text>

          <TextInput
            style={styles.input}
            value={number}
            onChangeText={(t) => {
              setError(null);
              setNumber(t.replace(/[^0-9]/g, ''));
            }}
            placeholder="e.g. 38"
            placeholderTextColor={COLORS.lightGray}
            keyboardType="number-pad"
            maxLength={5}
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={handleSubmit}
          >
            <Text style={styles.buttonLabel}>Meet your kid</Text>
          </Pressable>
        </View>

        <View style={styles.secondaryLinks}>
          <Pressable onPress={() => router.push('/news')} style={styles.secondaryLink}>
            <Text style={styles.secondaryLinkLabel}>From the campus</Text>
            <Text style={styles.secondaryLinkSubtitle}>
              Monthly updates from Hope Bridge School &rarr;
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push('/about')} style={styles.secondaryLink}>
            <Text style={styles.secondaryLinkLabel}>What is Be A Number?</Text>
            <Text style={styles.secondaryLinkSubtitle}>
              The campus, the model, the kids &rarr;
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  heroBlock: { marginTop: SPACING.xl },
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
  buttonPressed: { opacity: 0.85 },
  buttonLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.nearBlack,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  secondaryLinks: {
    marginTop: SPACING.xxl,
    gap: SPACING.md,
  },
  secondaryLink: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.sand,
    padding: SPACING.lg,
  },
  secondaryLinkLabel: {
    fontSize: 16,
    color: COLORS.nearBlack,
    fontFamily: FONT.serif,
    marginBottom: 4,
  },
  secondaryLinkSubtitle: {
    fontSize: 13,
    color: COLORS.midGray,
  },
});
