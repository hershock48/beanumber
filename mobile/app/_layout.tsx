/**
 * Root layout. Bootstraps the Lora font, sets the navigation
 * stack chrome, holds the safe area provider.
 *
 * No tab bar at this level — the home screen (number entry) is
 * the entry, and tapping anything pushes a screen. We can add a
 * bottom tab navigator once Phase 2 (sponsor portal) lands and
 * we have a "My Kids" tab that competes for attention with Home.
 */
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Lora_600SemiBold, Lora_700Bold, Lora_400Regular_Italic } from '@expo-google-fonts/lora';
import { useEffect } from 'react';
import { COLORS } from '../lib/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Lora_600SemiBold,
    Lora_700Bold,
    Lora_400Regular_Italic,
  });

  useEffect(() => {
    if (fontsLoaded) {
      // Splash auto-hides when first frame paints; nothing to do
      // here once fonts are ready.
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.cream },
          headerTitleStyle: {
            color: COLORS.nearBlack,
            fontFamily: 'Lora_600SemiBold',
            fontSize: 18,
          },
          headerTintColor: COLORS.nearBlack,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: COLORS.cream },
          headerBackTitle: 'Back',
        }}
      >
        <Stack.Screen
          name="index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="children/[number]"
          options={{
            title: '',
            headerBackTitle: 'Home',
          }}
        />
        <Stack.Screen
          name="news"
          options={{
            title: 'From the campus',
          }}
        />
        <Stack.Screen
          name="about"
          options={{
            title: 'About',
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
