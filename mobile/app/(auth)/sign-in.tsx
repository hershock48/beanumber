/**
 * Sign-in screen — brief section 3.6, screen 2 of the onboarding
 * flow (QR scan → install → sign-in → reveal → conversion).
 *
 * Copy:
 *   Headline is context-aware. If the app was opened via
 *   /meet/[N], say "First — keep #N yours." with the specific
 *   number. Otherwise "First — keep your progress." One line of
 *   dynamic copy, everything else is static.
 *
 * Buttons:
 *   Sign in with Apple  → mandated pure-black button, rendered by
 *                         expo-apple-authentication's native
 *                         component. Only shown on iOS.
 *   Continue with Google → cream + ink outline, per the design
 *                          system.
 *
 * "No passwords. Nothing to remember." at the bottom.
 *
 * On success, `useAuth` state updates → the tabs guard sees
 * isSignedIn === true → sign-in screen unmounts and the user lands
 * back on Home. If they opened via a /meet/[N] deep link, we push
 * to meet/[N] immediately after sign-in so the reveal fires.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Text } from '../../components/design/Text';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import {
  extractMeetShirtNumber,
  getInitialMeetShirtNumber,
} from '../../lib/deepLink';

// Dev bypass — visible only when EXPO_PUBLIC_MOBILE_DEV_AUTH=1 in the
// client env AND the server has MOBILE_DEV_AUTH=1 set. Both are cleaned
// up before App Store submission. Purpose: preview the app inside
// Expo Go (which can't run expo-apple-authentication).
const DEV_AUTH_ENABLED =
  process.env.EXPO_PUBLIC_MOBILE_DEV_AUTH === '1';
const DEV_AUTH_EMAIL =
  process.env.EXPO_PUBLIC_MOBILE_DEV_AUTH_EMAIL || 'kevin@beanumber.org';

export default function SignInScreen() {
  const { signInWithApple, signInWithGoogle, signInAsDev, isSignedIn, isLoading } =
    useAuth();
  const [meetNumber, setMeetNumber] = useState<number | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busyProvider, setBusyProvider] = useState<
    'apple' | 'google' | 'dev' | null
  >(null);

  // Read the /meet/[N] shirt number from the initial URL (or any
  // subsequent link event while this screen is visible).
  useEffect(() => {
    let mounted = true;
    getInitialMeetShirtNumber().then(n => {
      if (mounted && n) setMeetNumber(n);
    });
    const sub = Linking.addEventListener('url', (evt: { url: string }) => {
      const n = extractMeetShirtNumber(evt.url);
      if (mounted && n) setMeetNumber(n);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Is Sign in with Apple available on this device?
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then((v: boolean) => setAppleAvailable(v))
      .catch(() => setAppleAvailable(false));
  }, []);

  // Once signed in, leave the sign-in screen. If the user came from a
  // /meet/[N] deep link, push to that screen so the reveal moment
  // fires. Otherwise land on the tabs (Home).
  useEffect(() => {
    if (!isSignedIn) return;
    if (meetNumber) {
      router.replace(`/meet/${meetNumber}`);
    } else {
      router.replace('/');
    }
  }, [isSignedIn, meetNumber]);

  const handleApple = async () => {
    setBusyProvider('apple');
    try {
      await signInWithApple();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      // ERR_CANCELED / ERR_REQUEST_CANCELED are silent — the user just
      // dismissed the sheet. Only surface unexpected errors.
      if (!/cancel/i.test(msg)) {
        Alert.alert('Apple sign-in didn’t complete', msg);
      }
    } finally {
      setBusyProvider(null);
    }
  };

  const handleGoogle = async () => {
    setBusyProvider('google');
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      if (!/cancel/i.test(msg)) {
        Alert.alert('Google sign-in didn’t complete', msg);
      }
    } finally {
      setBusyProvider(null);
    }
  };

  const handleDev = async () => {
    setBusyProvider('dev');
    try {
      await signInAsDev(DEV_AUTH_EMAIL);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dev sign-in failed.';
      Alert.alert('Dev sign-in failed', msg);
    } finally {
      setBusyProvider(null);
    }
  };

  const headline = meetNumber
    ? `#${meetNumber} is a kid. Sign in to meet them.`
    : 'Sign in to meet your kid.';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text variant="h1" align="center" style={styles.headline}>
            {headline}
          </Text>
          <Text
            variant="body"
            color="umber"
            align="center"
            style={styles.subhead}
          >
            Every Be A Number shirt has a kid on the other end. Sign in
            and the number reveals who.
          </Text>
        </View>

        <View style={styles.buttons}>
          {Platform.OS === 'ios' && appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={RADIUS.button}
              style={styles.appleButton}
              onPress={handleApple}
            />
          ) : null}

          <Pressable
            onPress={handleGoogle}
            disabled={isLoading || busyProvider !== null}
            style={({ pressed }) => [
              styles.googleButton,
              pressed && styles.googleButtonPressed,
              (isLoading || busyProvider !== null) && { opacity: 0.4 },
            ]}
          >
            {busyProvider === 'google' ? (
              <ActivityIndicator color={COLORS.ink} />
            ) : (
              <Text
                variant="body"
                color="ink"
                style={{ fontFamily: 'Inter_600SemiBold', fontSize: 17 }}
              >
                Continue with Google
              </Text>
            )}
          </Pressable>

          {DEV_AUTH_ENABLED ? (
            <Pressable
              onPress={handleDev}
              disabled={isLoading || busyProvider !== null}
              style={({ pressed }) => [
                styles.devButton,
                pressed && { opacity: 0.6 },
                (isLoading || busyProvider !== null) && { opacity: 0.4 },
              ]}
            >
              {busyProvider === 'dev' ? (
                <ActivityIndicator color={COLORS.umber} />
              ) : (
                <Text
                  variant="caption"
                  color="umber"
                  style={{ fontFamily: 'Inter_500Medium' }}
                >
                  Dev sign-in ({DEV_AUTH_EMAIL})
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>

        <Text
          variant="caption"
          color="umber"
          align="center"
          style={styles.footer}
        >
          No passwords. Nothing to remember.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.zone,
    paddingBottom: SPACING.xxl,
    justifyContent: 'space-between',
  },
  header: {
    gap: SPACING.l,
  },
  headline: {
    // Slight negative letter spacing on the h1 lands like on the web.
    letterSpacing: -0.5,
  },
  subhead: {
    maxWidth: 340,
    alignSelf: 'center',
  },
  buttons: {
    gap: SPACING.m,
  },
  appleButton: {
    width: '100%',
    height: 52,
  },
  googleButton: {
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: COLORS.cream,
    borderColor: COLORS.ink,
    borderWidth: 1,
    borderRadius: RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonPressed: {
    backgroundColor: COLORS.paper,
  },
  devButton: {
    marginTop: SPACING.s,
    paddingVertical: SPACING.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    // sits under the button stack
  },
});
