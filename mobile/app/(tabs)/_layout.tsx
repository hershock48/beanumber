/**
 * Bottom tab layout. Four tabs that read as the spine of the app:
 *   - Home: the number entry (front door, the brand mechanic)
 *   - Newsfeed: campus updates
 *   - Browse: scroll the roster of kids (Phase 1.3 will populate)
 *   - About: who BAN is
 *
 * No icons yet — labels only — until we settle on icon style.
 * Replace with proper SF Symbols / Material icons in Phase 1.3.
 */
import { Tabs } from 'expo-router';
import { COLORS } from '../../lib/theme';
import { tap } from '../../lib/haptics';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.cream },
        headerShadowVisible: false,
        headerTitleStyle: {
          color: COLORS.nearBlack,
          fontFamily: 'Lora_600SemiBold',
          fontSize: 18,
        },
        tabBarStyle: {
          backgroundColor: COLORS.cream,
          borderTopColor: COLORS.sand,
          borderTopWidth: 1,
          height: 84,
          paddingTop: 8,
          paddingBottom: 28,
        },
        tabBarActiveTintColor: COLORS.gold,
        tabBarInactiveTintColor: COLORS.midGray,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        },
      }}
      screenListeners={{
        tabPress: () => tap(),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', headerShown: false }}
      />
      <Tabs.Screen
        name="news"
        options={{ title: 'Campus' }}
      />
      <Tabs.Screen
        name="browse"
        options={{ title: 'Browse' }}
      />
      <Tabs.Screen
        name="about"
        options={{ title: 'About' }}
      />
    </Tabs>
  );
}
