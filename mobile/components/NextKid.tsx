/**
 * NextKid — suggestion card at the bottom of a kid profile. Picks
 * another kid from the roster (excluding the current one) and
 * surfaces them as "Another kid at Hope Bridge." Tap pushes their
 * profile.
 *
 * Brand-safe: it's a meeting nudge, not a comparison. Reinforces
 * the pool-model relationship (everyone matters equally) by
 * surfacing kids beyond whoever you typed in.
 */
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { COLORS, FONT, SIZES, SPACING } from '../lib/theme';
import { tap as hapticTap } from '../lib/haptics';

const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  'https://www.beanumber.org';

interface RosterChild {
  id: string;
  first_name: string;
  display_name?: string;
  photo_url?: string;
  grade_class?: string;
  shirt_number_start?: number;
}

export function NextKid({
  excludeShirtNumber,
  matchGrade,
}: {
  excludeShirtNumber: number;
  matchGrade?: string;
}) {
  const [kid, setKid] = useState<RosterChild | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/children`);
        if (!res.ok) return;
        const data = await res.json();
        let pool: RosterChild[] = (data.children || []).filter(
          (c: RosterChild) =>
            !!c.photo_url &&
            !!c.shirt_number_start &&
            c.shirt_number_start !== excludeShirtNumber
        );
        if (matchGrade) {
          const sameGrade = pool.filter(c => c.grade_class === matchGrade);
          if (sameGrade.length > 0) pool = sameGrade;
        }
        if (pool.length === 0 || cancelled) return;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        setKid(pick);
      } catch {}
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [excludeShirtNumber, matchGrade]);

  if (!kid) return null;

  const open = () => {
    if (!kid.shirt_number_start) return;
    hapticTap();
    router.push(`/children/${kid.shirt_number_start}`);
  };

  return (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.container}>
      <Text style={styles.label}>Another kid at Hope Bridge</Text>
      <Pressable style={styles.row} onPress={open}>
        {kid.photo_url && (
          <Image source={{ uri: kid.photo_url }} style={styles.photo} />
        )}
        <View style={styles.text}>
          <Text style={styles.name}>{kid.display_name || kid.first_name}</Text>
          {kid.grade_class && (
            <Text style={styles.grade}>{kid.grade_class}</Text>
          )}
          <Text style={styles.cta}>Meet {kid.first_name} →</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: 11, fontWeight: '700', letterSpacing: 2,
    color: COLORS.gold, textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.sand,
    padding: SPACING.md,
    alignItems: 'center',
  },
  photo: { width: 72, height: 72, backgroundColor: COLORS.sandLight },
  text: { marginLeft: SPACING.md, flex: 1 },
  name: {
    fontSize: SIZES.heading3, color: COLORS.nearBlack,
    fontFamily: FONT.serif, marginBottom: 2,
  },
  grade: { fontSize: 12, color: COLORS.midGray, marginBottom: 4 },
  cta: {
    fontSize: 12, fontWeight: '700', color: COLORS.gold,
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
});
