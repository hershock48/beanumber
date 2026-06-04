/**
 * TodayPanel — small editorial unit on the home screen, above the
 * number entry. Shows a daily moment: the current campus context
 * line plus a small "kid of the day" stub. Pulls a deterministic
 * pick of the day from the roster so it's the same kid for
 * everyone today, different tomorrow. Lightweight — one fetch on
 * mount, then idle.
 *
 * Phase 2 backs this with a real /api/today endpoint that the
 * campus team can curate. For now it derives from existing data.
 */
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { COLORS, FONT, SIZES, SPACING } from '../lib/theme';
import { tap as hapticTap } from '../lib/haptics';
import { getCampusContextLine } from '../lib/campus';

const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  'https://www.beanumber.org';

interface RosterChild {
  id: string;
  first_name: string;
  display_name?: string;
  photo_url?: string;
  shirt_number_start?: number;
}

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function TodayPanel() {
  const [kid, setKid] = useState<RosterChild | null>(null);
  const [campus, setCampus] = useState(getCampusContextLine());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/children`);
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.children || []).filter(
          (c: RosterChild) => !!c.photo_url && !!c.shirt_number_start
        );
        if (list.length === 0 || cancelled) return;
        const idx = dayOfYear(new Date()) % list.length;
        setCampus(getCampusContextLine());
        setKid(list[idx]);
      } catch {}
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const open = () => {
    if (!kid?.shirt_number_start) return;
    hapticTap();
    router.push(`/children/${kid.shirt_number_start}`);
  };

  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.liveDot} />
          <Text style={styles.headerLabel}>Hope Bridge, right now</Text>
        </View>
        <Text style={styles.time}>{campus.time}</Text>
      </View>
      <Text style={styles.doing}>{campus.doing}</Text>

      {kid && (
        <Pressable style={styles.kidRow} onPress={open}>
          <Image
            source={{ uri: kid.photo_url }}
            style={styles.kidPhoto}
            resizeMode="cover"
          />
          <View style={styles.kidText}>
            <Text style={styles.kidLabel}>Meet today</Text>
            <Text style={styles.kidName}>{kid.display_name || kid.first_name}</Text>
            <Text style={styles.kidNumber}>
              On shirt #{kid.shirt_number_start} &nbsp;→
            </Text>
          </View>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.sand,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  liveDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: COLORS.gold, marginRight: SPACING.sm,
  },
  headerLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 2,
    color: COLORS.gold, textTransform: 'uppercase',
  },
  time: {
    fontSize: 12, fontWeight: '700',
    color: COLORS.nearBlack, letterSpacing: 0.3,
  },
  doing: {
    fontSize: SIZES.bodyLg, color: COLORS.bodyTextLight,
    fontFamily: FONT.serifItalic, fontStyle: 'italic',
    marginBottom: SPACING.md,
  },
  kidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.sandLight,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  kidPhoto: {
    width: 60, height: 60,
    backgroundColor: COLORS.sand,
  },
  kidText: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  kidLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2,
    color: COLORS.gold, textTransform: 'uppercase',
    marginBottom: 2,
  },
  kidName: {
    fontSize: 17, color: COLORS.nearBlack,
    fontFamily: FONT.serif, marginBottom: 2,
  },
  kidNumber: {
    fontSize: 12, color: COLORS.midGray,
  },
});
