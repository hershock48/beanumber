/**
 * SponsorSheet — bottom modal that slides up when a user taps
 * "Sponsor [Name]" on a kid profile. Shows the pool-funding
 * framing, the math, and a "Continue" button that opens the
 * Stripe Checkout in the in-app browser. Closes by tapping the
 * scrim or dragging down.
 *
 * Phase 3 replaces the in-app browser handoff with @stripe/
 * stripe-react-native's native payment sheet — until then, the
 * web Stripe Checkout is good enough and shares billing
 * machinery with the rest of the org.
 */
import { useEffect } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';
import { COLORS, FONT, SIZES, SPACING } from '../lib/theme';
import { press as hapticPress, tap as hapticTap } from '../lib/haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function SponsorSheet({
  visible,
  onClose,
  firstName,
  shirtNumber,
}: {
  visible: boolean;
  onClose: () => void;
  firstName: string;
  shirtNumber: number;
}) {
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 250 });
      translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
    }
  }, [visible, opacity, translateY]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const dismiss = () => {
    hapticTap();
    onClose();
  };

  const proceed = async () => {
    hapticPress();
    const url = `https://www.beanumber.org/sponsorship?child=${shirtNumber}`;
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        controlsColor: COLORS.gold,
      });
    } catch {}
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable style={styles.scrimPressable} onPress={dismiss} />
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <View style={styles.grabber} />

          <Text style={styles.eyebrow}>Stay with {firstName}</Text>
          <Text style={styles.headline}>$25 a month keeps the campus running.</Text>
          <Text style={styles.body}>
            Your $25 goes into the pool that funds Hope Bridge — school
            fees, the cooks, the on-site clinic, teachers&rsquo; salaries.
            Every kid at the campus gets the same. {firstName} is the
            face of your relationship, not their budget.
          </Text>

          <View style={styles.mathRow}>
            <View style={styles.mathItem}>
              <Text style={styles.mathLabel}>Your monthly</Text>
              <Text style={styles.mathValue}>$25</Text>
            </View>
            <View style={styles.mathItem}>
              <Text style={styles.mathLabel}>Stripe fee (nonprofit)</Text>
              <Text style={styles.mathValue}>$0.85</Text>
            </View>
            <View style={styles.mathItem}>
              <Text style={styles.mathLabel}>To Hope Bridge</Text>
              <Text style={[styles.mathValue, styles.mathValueAccent]}>$24.15</Text>
            </View>
          </View>

          <Pressable style={styles.primaryButton} onPress={proceed}>
            <Text style={styles.primaryButtonLabel}>Continue</Text>
          </Pressable>
          <Text style={styles.finePrint}>
            $25/month · cancel anytime · tax-deductible to the extent allowed
            by law
          </Text>
          <Pressable style={styles.dismissRow} onPress={dismiss}>
            <Text style={styles.dismissLabel}>Not right now</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(13, 13, 13, 0.5)',
    justifyContent: 'flex-end',
  },
  scrimPressable: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: COLORS.cream,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xxl,
  },
  grabber: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.sand,
    alignSelf: 'center', marginBottom: SPACING.lg,
  },
  eyebrow: {
    fontSize: 11, fontWeight: '700', color: COLORS.gold,
    textTransform: 'uppercase', letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  headline: {
    fontSize: SIZES.heading2, color: COLORS.nearBlack,
    fontFamily: FONT.serif, lineHeight: 34,
    marginBottom: SPACING.md,
  },
  body: {
    fontSize: SIZES.bodyLg, color: COLORS.bodyTextLighter,
    lineHeight: 26, marginBottom: SPACING.lg,
  },
  mathRow: {
    backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.sand,
    padding: SPACING.md, marginBottom: SPACING.lg,
  },
  mathItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  mathLabel: {
    fontSize: 13, color: COLORS.midGray,
  },
  mathValue: {
    fontSize: 14, fontWeight: '700', color: COLORS.nearBlack,
    fontVariant: ['tabular-nums'],
  },
  mathValueAccent: { color: COLORS.gold },
  primaryButton: {
    backgroundColor: COLORS.gold,
    paddingVertical: 18, alignItems: 'center',
  },
  primaryButtonLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.nearBlack,
    textTransform: 'uppercase', letterSpacing: 2,
  },
  finePrint: {
    marginTop: SPACING.sm,
    fontSize: 11, color: COLORS.lightGray, textAlign: 'center',
  },
  dismissRow: { marginTop: SPACING.lg, alignSelf: 'center', paddingVertical: SPACING.sm },
  dismissLabel: { fontSize: 13, color: COLORS.midGray, textDecorationLine: 'underline' },
});
