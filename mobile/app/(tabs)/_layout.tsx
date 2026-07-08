/**
 * Bottom tab layout — Home / Explore / Notes / Me.
 *
 * Design system: filled icon + ink label on active, line icon + umber
 * label on inactive. Never gold on the tab bar. Unread indicator is
 * a gold dot at icon top-right; never a numeric badge.
 *
 * Auth guard: signed-out users get pushed to /(auth)/sign-in. The
 * check waits for the initial hydration pass to finish so we don't
 * flash-redirect a user whose token is still being loaded from
 * SecureStore.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Tabs, router } from 'expo-router';
import { COLORS, TEXT_STYLES, DOT_SIZE } from '../../lib/theme';
import { light } from '../../lib/haptics';
import { useAuth } from '../../hooks/useAuth';

interface TabIconProps {
  focused: boolean;
  color: string;
  size: number;
  unread?: boolean;
}

/** Small, symbolic icon primitives — SVG-free to skip the extra dep at
 * this size. Swap for SF Symbols proper when we're on TestFlight and
 * can rely on symbolic icons rendering natively. */
function HomeIcon({ focused, color }: TabIconProps) {
  return (
    <View
      style={{
        width: 22,
        height: 20,
        borderTopWidth: focused ? 0 : 1.5,
        borderLeftWidth: focused ? 0 : 1.5,
        borderRightWidth: focused ? 0 : 1.5,
        borderBottomWidth: focused ? 0 : 1.5,
        borderColor: color,
        backgroundColor: focused ? color : 'transparent',
        borderRadius: 2,
      }}
    />
  );
}

function ExploreIcon({ focused, color }: TabIconProps) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.5,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 2,
          height: 8,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

function NotesIcon({ focused, color, unread }: TabIconProps) {
  return (
    <View>
      <View
        style={{
          width: 22,
          height: 16,
          borderRadius: 2,
          borderWidth: focused ? 0 : 1.5,
          backgroundColor: focused ? color : 'transparent',
          borderColor: color,
        }}
      />
      {unread ? (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: DOT_SIZE.sm,
            height: DOT_SIZE.sm,
            borderRadius: DOT_SIZE.sm / 2,
            backgroundColor: COLORS.unreadDot,
          }}
        />
      ) : null}
    </View>
  );
}

function MeIcon({ focused, color }: TabIconProps) {
  return (
    <View
      style={{
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          borderWidth: focused ? 0 : 1.5,
          backgroundColor: focused ? color : 'transparent',
          borderColor: color,
        }}
      />
      <View
        style={{
          marginTop: 2,
          width: 18,
          height: 10,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          borderWidth: focused ? 0 : 1.5,
          backgroundColor: focused ? color : 'transparent',
          borderColor: color,
        }}
      />
    </View>
  );
}

export default function TabsLayout() {
  const { isSignedIn, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isSignedIn) {
      router.replace('/(auth)/sign-in');
    }
  }, [isSignedIn, isLoading]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.cream,
          borderTopColor: COLORS.divider,
          borderTopWidth: 1,
          height: 84,
          paddingTop: 8,
          paddingBottom: 28,
        },
        tabBarActiveTintColor: COLORS.ink,
        tabBarInactiveTintColor: COLORS.umber,
        tabBarLabelStyle: {
          fontFamily: TEXT_STYLES.overline.fontFamily,
          fontSize: TEXT_STYLES.overline.fontSize,
          letterSpacing: TEXT_STYLES.overline.letterSpacing,
          textTransform: 'uppercase',
          marginTop: 4,
        },
      }}
      screenListeners={{
        tabPress: () => light(),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: props => <HomeIcon {...props} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: props => <ExploreIcon {...props} />,
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: 'Penpal',
          tabBarIcon: props => <NotesIcon {...props} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarIcon: props => <MeIcon {...props} />,
        }}
      />
    </Tabs>
  );
}
