/**
 * Root layout. Two layers:
 *
 *  1. The outer Stack — pushes kid profile screens (with native
 *     transitions) on top of the tab bar. This is the standard
 *     iOS pattern: tabs at the root, push detail pages.
 *
 *  2. The inner (tabs) folder defines the bottom tab bar (Home,
 *     Newsfeed, Browse, About).
 *
 * Lora font loaded once at root and used everywhere via theme.ts.
 */
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Lora_600SemiBold,
  Lora_700Bold,
  Lora_400Regular_Italic,
  Lora_600SemiBold_Italic,
} from '@expo-google-fonts/lora';
import { COLORS } from '../lib/theme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Lora_600SemiBold,
    Lora_700Bold,
    Lora_400Regular_Italic,
    Lora_600SemiBold_Italic,
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="children/[number]"
            options={{
              title: '',
              headerBackTitle: 'Back',
              animation: 'fade',
            }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
