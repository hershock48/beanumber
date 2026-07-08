/**
 * Auth group layout — hosts the sign-in screen and any future
 * onboarding flow. No headers, no back navigation — sign-in is a
 * modal-shaped experience rather than something a user "goes back"
 * from. Route guard in (tabs)/_layout.tsx pushes signed-out users
 * here; a successful sign-in flips the state, which re-renders the
 * guard and lands them in the tabs.
 */
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        animation: 'fade',
      }}
    />
  );
}
