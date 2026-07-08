/**
 * Root layout.
 *
 * Two layers:
 *   1. Outer Stack — pushes detail screens (kid page, composer, etc.)
 *      on top of the tab bar. Standard iOS pattern.
 *   2. Inner (tabs) folder defines the bottom tab bar: Home / Explore
 *      / Notes / Me.
 *
 * Fonts are loaded once here. Every text style in `lib/theme.ts`
 * references one of these families — do not embed font names in
 * component files.
 */
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  Lora_400Regular,
  Lora_500Medium,
  Lora_600SemiBold,
  Lora_400Regular_Italic,
} from '@expo-google-fonts/lora';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { COLORS, TEXT_STYLES } from '../lib/theme';
import { AuthProvider } from '../hooks/useAuth';
import { usePushDeepLinks } from '../hooks/usePushDeepLinks';
import { useWebDeepLinks } from '../hooks/useWebDeepLinks';
import { useDeferredLink } from '../hooks/useDeferredLink';

/**
 * Small inner component so useRouter (inside usePushDeepLinks) sits
 * inside expo-router's context. Renders a fragment — its only job is
 * to attach the notification-tap listeners on mount.
 */
function PushDeepLinkBridge() {
  usePushDeepLinks();
  return null;
}

/**
 * Web-URL bridge — mirrors PushDeepLinkBridge but for
 * https://beanumber.org/... universal links and beanumber://...
 * custom-scheme URLs. Coexists with push handling because the two
 * hook different event sources (see hooks/useWebDeepLinks.ts).
 */
function WebDeepLinkBridge() {
  useWebDeepLinks();
  return null;
}

/**
 * First-open deferred-link resolver. Runs at most once per install,
 * hits /api/mobile/v1/deferred-link/resolve, and routes the app to
 * the shirt-number the user scanned before installing. See
 * hooks/useDeferredLink.ts for the mechanism.
 */
function DeferredLinkBridge() {
  useDeferredLink();
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Lora_400Regular,
    Lora_500Medium,
    Lora_600SemiBold,
    Lora_400Regular_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  // No splash shimmer here — the app icon + system splash covers this.
  // Rendering nothing until fonts land avoids a system-font flash.
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <PushDeepLinkBridge />
          <WebDeepLinkBridge />
          <DeferredLinkBridge />
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: COLORS.cream },
              headerTitleStyle: {
                color: COLORS.ink,
                fontFamily: TEXT_STYLES.h3.fontFamily,
                fontSize: 15,
              },
              headerTintColor: COLORS.ink,
              headerShadowVisible: false,
              contentStyle: { backgroundColor: COLORS.cream },
              headerBackTitle: 'Back',
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="(auth)"
              options={{ headerShown: false, animation: 'fade' }}
            />
            <Stack.Screen
              name="meet/[number]"
              options={{
                headerShown: false,
                animation: 'fade',
                gestureEnabled: false,
              }}
            />
            <Stack.Screen
              name="keep-going/[number]"
              options={{
                headerShown: false,
                animation: 'fade',
                gestureEnabled: false,
              }}
            />
            <Stack.Screen
              name="children/[number]"
              options={{
                title: '',
                headerBackTitle: 'Back',
                headerTransparent: true,
                animation: 'fade',
              }}
            />
            <Stack.Screen
              name="newsletter/[id]"
              options={{
                headerShown: true,
                title: '',
                headerTransparent: true,
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="photo"
              options={{
                presentation: 'transparentModal',
                headerShown: false,
                animation: 'fade',
                contentStyle: { backgroundColor: 'transparent' },
                gestureEnabled: false,
              }}
            />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
