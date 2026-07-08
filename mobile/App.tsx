/**
 * BAN mobile app — root component.
 *
 * v0.1.1: number entry now resolves against the live API at
 * beanumber.org and renders the kid inline below the input. No
 * navigation yet — single screen for now, results appear under
 * the input. Phase 1.2 splits this into a dedicated kid profile
 * screen with photo carousel + structured intake blocks.
 *
 * Brand palette inlined; will move to a shared theme file when
 * NativeWind comes in (Phase 1 task).
 */
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';

const COLORS = {
  cream: '#FFF8F0',
  nearBlack: '#0d0d0d',
  gold: '#D4A843',
  sand: '#e8e0d4',
  midGray: '#777',
  lightGray: '#aaa',
};

const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  'https://www.beanumber.org';

interface KidResponse {
  reserved: boolean;
  record_id?: string;
  child_id?: string;
  display_name?: string;
  first_name?: string;
  age?: number;
  grade_class?: string;
  shirt_number?: number;
  photo_url?: string;
  photo_urls?: string[];
  home_village?: string;
  family_context?: string;
  loves?: string;
  child_quote?: string;
  teacher_name?: string;
  teacher_quote?: string;
  name_meaning?: string;
  notes?: string;
  student_of_month?: string;
  student_of_month_reason?: string;
  departed_at?: string;
  departure_note?: string;
}

export default function App() {
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kid, setKid] = useState<KidResponse | null>(null);

  const handleSubmit = async () => {
    const n = parseInt(number, 10);
    if (!number || isNaN(n) || n <= 0) {
      setError('Type a shirt number to meet your kid.');
      return;
    }
    setError(null);
    setKid(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/children/${n}`);
      if (res.status === 404) {
        setError(
          `We don't have a #${n} yet. Double-check the number on the back of your shirt — it's on the inside label.`
        );
        return;
      }
      if (!res.ok) {
        setError('Something went wrong. Try again in a moment.');
        return;
      }
      const data = (await res.json()) as KidResponse;
      setKid(data);
    } catch (err) {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setKid(null);
    setNumber('');
    setError(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {!kid && (
            <View style={styles.entryBlock}>
              <Text style={styles.eyebrow}>Be A Number</Text>
              <Text style={styles.headline}>Type your number.</Text>
              <Text style={styles.subhead}>
                The number on the back of your shirt is a real kid at the
                campus. Type it to meet them.
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
                editable={!loading}
              />

              {error && <Text style={styles.error}>{error}</Text>}

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  (pressed || loading) && styles.buttonPressed,
                ]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.nearBlack} />
                ) : (
                  <Text style={styles.buttonLabel}>Meet your kid</Text>
                )}
              </Pressable>
            </View>
          )}

          {kid && kid.reserved && (
            <View style={styles.kidBlock}>
              <View style={styles.kidContent}>
                <Text style={styles.eyebrow}>Reserved</Text>
                <Text style={styles.kidName}>Shirt #{number} is reserved</Text>
                <Text style={styles.kidBio}>
                  This number is held for a future live auction. The winning
                  bidder will be matched to a child at the campus.
                </Text>
                <Pressable style={styles.secondaryButton} onPress={handleClear}>
                  <Text style={styles.secondaryButtonLabel}>Try another number</Text>
                </Pressable>
              </View>
            </View>
          )}

          {kid && !kid.reserved && (
            <View style={styles.kidBlock}>
              {kid.photo_url && (
                <Image
                  source={{ uri: kid.photo_url }}
                  style={styles.kidPhoto}
                  resizeMode="cover"
                />
              )}
              <View style={styles.kidNumberBadge}>
                <Text style={styles.kidNumberBadgeText}>
                  #{kid.shirt_number ?? number}
                </Text>
              </View>

              <View style={styles.kidContent}>
                <Text style={styles.kidEyebrow}>Meet</Text>
                <Text style={styles.kidName}>{kid.display_name}</Text>
                {kid.name_meaning && (
                  <Text style={styles.kidMeaning}>{kid.name_meaning}</Text>
                )}

                {(kid.age || kid.grade_class) && (
                  <Text style={styles.kidMeta}>
                    {[
                      kid.age ? `Age ${kid.age}` : null,
                      kid.grade_class || null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                )}

                {kid.child_quote && (
                  <Text style={styles.kidQuote}>
                    &ldquo;{kid.child_quote}&rdquo;
                  </Text>
                )}

                {kid.home_village && (
                  <KidFact label="Home" value={kid.home_village} />
                )}
                {kid.family_context && (
                  <KidFact label="Family" value={kid.family_context} />
                )}
                {kid.loves && (
                  <KidFact
                    label={`About ${kid.first_name || 'them'}`}
                    value={kid.loves}
                  />
                )}
                {kid.teacher_quote && (
                  <View style={styles.teacherBlock}>
                    <Text style={styles.kidFactLabel}>
                      From {kid.first_name || 'their'} teacher
                    </Text>
                    <Text style={styles.kidQuote}>
                      &ldquo;{kid.teacher_quote}&rdquo;
                    </Text>
                    {kid.teacher_name && (
                      <Text style={styles.teacherName}>— {kid.teacher_name}</Text>
                    )}
                  </View>
                )}
                {kid.notes && !kid.loves && (
                  <KidFact
                    label={`More about ${kid.first_name || 'them'}`}
                    value={kid.notes}
                  />
                )}

                <Pressable style={styles.secondaryButton} onPress={handleClear}>
                  <Text style={styles.secondaryButtonLabel}>
                    Meet another kid
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function KidFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kidFact}>
      <Text style={styles.kidFactLabel}>{label}</Text>
      <Text style={styles.kidFactValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.cream },
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 64,
  },
  entryBlock: {
    minHeight: 500,
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    color: COLORS.gold,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  headline: {
    fontSize: 42,
    fontWeight: '600',
    color: COLORS.nearBlack,
    lineHeight: 48,
    marginBottom: 16,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  subhead: {
    fontSize: 17,
    color: COLORS.midGray,
    lineHeight: 26,
    marginBottom: 40,
  },
  input: {
    fontSize: 28,
    color: COLORS.nearBlack,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.sand,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 16,
    fontVariant: ['tabular-nums'],
  },
  error: {
    fontSize: 14,
    color: '#a02020',
    marginBottom: 12,
  },
  button: {
    backgroundColor: COLORS.gold,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.nearBlack,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  kidBlock: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.sand,
    marginTop: 8,
  },
  kidPhoto: {
    width: '100%',
    aspectRatio: 4 / 5,
    backgroundColor: '#f5f0e8',
  },
  kidNumberBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  kidNumberBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.gold,
  },
  kidContent: { padding: 24 },
  kidEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: COLORS.gold,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  kidName: {
    fontSize: 32,
    fontWeight: '600',
    color: COLORS.nearBlack,
    lineHeight: 38,
    marginBottom: 6,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  kidMeaning: {
    fontSize: 15,
    color: COLORS.midGray,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  kidMeta: {
    fontSize: 16,
    color: COLORS.midGray,
    marginBottom: 16,
  },
  kidQuote: {
    fontSize: 20,
    fontStyle: 'italic',
    color: COLORS.nearBlack,
    lineHeight: 28,
    marginBottom: 16,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  kidFact: { marginBottom: 16 },
  kidFactLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: COLORS.gold,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  kidFactValue: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
  },
  kidBio: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
    marginBottom: 16,
  },
  teacherBlock: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.gold,
    paddingLeft: 16,
    marginBottom: 16,
  },
  teacherName: {
    fontSize: 13,
    color: COLORS.midGray,
    marginTop: 4,
  },
  secondaryButton: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: COLORS.sand,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.nearBlack,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
});
