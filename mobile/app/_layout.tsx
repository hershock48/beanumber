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
            name="meet/[number]"
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
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
