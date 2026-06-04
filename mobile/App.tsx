/**
 * BAN mobile app — root component.
 *
 * v0.1 milestone: the number entry screen. Type a shirt number, tap
 * the button, navigate to the kid page (not yet wired). This is the
 * front door — the brand mechanic preserved from the website. See
 * docs/claude/app_build.md sections 4.1 and 10 for full spec.
 *
 * Brand palette inlined here for v0.1; will move to a shared theme
 * file when we add NativeWind in the next step.
 */
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const COLORS = {
  cream: '#FFF8F0',
  nearBlack: '#0d0d0d',
  gold: '#D4A843',
  sand: '#e8e0d4',
  midGray: '#777',
  lightGray: '#aaa',
};

export default function App() {
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const n = parseInt(number, 10);
    if (!number || isNaN(n) || n <= 0) {
      setError('Type a shirt number to meet your kid.');
      return;
    }
    setError(null);
    // TODO Phase 1: navigate to kid profile screen for shirt #n.
    // For v0.1 this just confirms the input.
    setError(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
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
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleSubmit}
          >
            <Text style={styles.buttonLabel}>Meet your kid</Text>
          </Pressable>

          <Text style={styles.footnote}>
            v0.1 — scaffolding only. Kid page wiring in Phase 1.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.cream },
  container: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 28,
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
    // Lora serif comes in with custom font loading in Phase 1.
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
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.nearBlack,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  footnote: {
    marginTop: 32,
    fontSize: 11,
    color: COLORS.lightGray,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
