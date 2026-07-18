/**
 * /meet/[number] — the reveal moment screen.
 *
 * State machine:
 *   idle       — button rendered, kid data fetched in background,
 *                ambient glow pulsing
 *   holding    — user's finger is down, ring filling, milestones firing
 *   revealing  — ring completed, transitioning to landed state
 *                (button + number crossfade out, glow expands and fades,
 *                photo enters, name types on, CTAs stage in)
 *   failed     — network problem before ring completion (button greyed,
 *                copy replaces subhead, retry link)
 *
 * The kid fetch begins on mount so by the time the ring completes at
 * ~2.8s the kid data is guaranteed to be resolved. If the fetch fails
 * before ring completion, we transition to failed. If it's still
 * pending at ring completion, we stretch the reveal glow beat up to
 * 600ms extra to cover the tail (per the 3.2 anti-pattern rule: no
 * loading spinner — the transition IS the loading state).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../../lib/theme';
import { Text } from '../../components/design/Text';
import { HoldButton } from '../../components/reveal/HoldButton';
import { AmbientGlow } from '../../components/reveal/AmbientGlow';
import { KidReveal } from '../../components/reveal/KidReveal';
import { BackChip } from '../../components/design/BackChip';
import {
  claimNumber,
  getMobileKid,
  MobileKidDetail,
  ApiError,
  NumberClaimedError,
} from '../../lib/api';
import { revealCompletion } from '../../lib/haptics';

type Phase = 'idle' | 'holding' | 'revealing' | 'failed';

export default function MeetScreen() {
  const params = useLocalSearchParams<{ number: string }>();
  const number = parseInt(params.number || '', 10);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('idle');
  const [kid, setKid] = useState<MobileKidDetail | null>(null);
  const [fetchError, setFetchError] = useState<ApiError | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const kidPromise = useRef<Promise<MobileKidDetail> | null>(null);

  // Fade layers for the pre-hold → reveal crossfade.
  const buttonLayerOpacity = useSharedValue(1);
  const revealLayerOpacity = useSharedValue(0);

  // Kick off the kid fetch on mount so it races the 2.8s hold.
  useEffect(() => {
    if (!Number.isFinite(number) || number <= 0) {
      setFetchError(new ApiError('Invalid shirt number', 400));
      setPhase('failed');
      return;
    }
    kidPromise.current = getMobileKid(number);
    kidPromise.current
      .then(k => {
        setKid(k);
      })
      .catch((err: ApiError) => {
        setFetchError(err);
        // Only transition to failed if we're still on the button — if
        // the user has already started the hold, we let the ring finish
        // and show the failure at reveal time instead of yanking mid-hold.
        if (phase === 'idle') {
          setPhase('failed');
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number]);

  // Ring completed → transition to reveal.
  const handleRingComplete = useCallback(async () => {
    // Wait for the kid fetch if it's still in flight. Cap at +600ms of
    // extra glow so we don't stall forever on a slow network.
    if (!kid && kidPromise.current) {
      const timeout = new Promise<null>(res => setTimeout(() => res(null), 600));
      const winner = await Promise.race([kidPromise.current, timeout]);
      if (!winner) {
        setPhase('failed');
        return;
      }
    }
    if (fetchError) {
      setPhase('failed');
      return;
    }
    setPhase('revealing');
    revealCompletion();

    // Crossfade: button layer out, reveal layer in.
    buttonLayerOpacity.value = withTiming(0, {
      duration: 400,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    revealLayerOpacity.value = withTiming(1, { duration: 700 });
  }, [kid, fetchError, buttonLayerOpacity, revealLayerOpacity]);

  const handleProgress = useCallback((p: number) => {
    setHoldProgress(p);
    if (p > 0 && phase === 'idle') {
      setPhase('holding');
    } else if (p === 0 && phase === 'holding') {
      setPhase('idle');
    }
  }, [phase]);

  const retryFetch = useCallback(() => {
    setFetchError(null);
    setPhase('idle');
    kidPromise.current = getMobileKid(number);
    kidPromise.current
      .then(k => setKid(k))
      .catch((err: ApiError) => {
        setFetchError(err);
        setPhase('failed');
      });
  }, [number]);

  // ── Claim — the explicit "Keep #N" moment ────────────────────────
  // NEVER automatic: a shared /meet link must not steal the number
  // from the person actually holding the shirt. The viewer taps, the
  // server binds (or blocks), and the screen re-frames around the
  // new relationship.
  const [claiming, setClaiming] = useState(false);
  const handleClaim = useCallback(async () => {
    if (!kid || claiming) return;
    setClaiming(true);
    try {
      const result = await claimNumber(number);
      // Locally reflect the new role so the CTAs re-frame instantly.
      setKid(prev =>
        prev
          ? {
              ...prev,
              viewer: {
                ...prev.viewer,
                roleForKid: result.role,
                canClaim: false,
                canReadUpdates: true,
                // Fresh holders can read their (empty) thread and
                // write the included letter — server grants the same.
                canReadNotes: true,
                canWriteNotes: true,
                freeLetter:
                  result.role === 'monthly' ? null : 'available',
              },
            }
          : prev
      );
      // Fresh holders get the conversion moment; a bound monthly row
      // goes straight to the kid page with the composer open.
      if (result.role === 'monthly') {
        router.replace(`/children/${number}?compose=1`);
      } else {
        router.replace(`/keep-going/${number}`);
      }
    } catch (err) {
      if (err instanceof NumberClaimedError) {
        Alert.alert(
          `#${number} is already spoken for`,
          `Someone else has already claimed this number. If you're the one holding the shirt, email kevin@beanumber.org — a person answers, and we'll get it sorted.`
        );
        setKid(prev =>
          prev
            ? { ...prev, viewer: { ...prev.viewer, canClaim: false } }
            : prev
        );
      } else {
        Alert.alert(
          "That didn't go through",
          'Check your connection and try again in a moment.'
        );
      }
    } finally {
      setClaiming(false);
    }
  }, [kid, claiming, number, router]);

  const buttonLayerStyle = useAnimatedStyle(() => ({
    opacity: buttonLayerOpacity.value,
  }));
  const revealLayerStyle = useAnimatedStyle(() => ({
    opacity: revealLayerOpacity.value,
  }));

  // ─── Landed / revealing render ──────────────────────────────────────
  const showReveal = phase === 'revealing';

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: COLORS.cream }}
      edges={['top', 'bottom']}
    >
      {/* Escape hatch — visible until the reveal starts. A mistyped
          number or a broken fetch must never trap anyone on the
          ceremony screen (swipe-back is disabled here on purpose,
          so this chip is the ONLY way out). Hidden during the
          reveal itself: at that point the ceremony owns the screen
          and its own CTAs handle where you go next. */}
      {!showReveal ? <BackChip /> : null}

      {/* Button layer — pre-hold + holding + failed */}
      <Animated.View
        pointerEvents={showReveal ? 'none' : 'auto'}
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
          },
          buttonLayerStyle,
        ]}
      >
        {/* Ambient glow — sits BEHIND the button. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <AmbientGlow intensity={holdProgress} />
        </View>

        {/* "This is #48." headline */}
        <Text
          variant="h1"
          color="ink"
          align="center"
          style={{ marginBottom: SPACING.xxl }}
        >
          This is #{number}.
        </Text>

        {/* The HoldButton itself */}
        <HoldButton
          number={number}
          onComplete={handleRingComplete}
          onProgressChange={handleProgress}
          disabled={phase === 'failed'}
        />

        {/* Subhead / status line */}
        <View
          style={{
            marginTop: SPACING.xxl,
            paddingHorizontal: SPACING.xl,
            alignItems: 'center',
          }}
        >
          {phase === 'failed' ? (
            <>
              <Text variant="body" color="umber" align="center">
                Reconnect to meet #{number}.
              </Text>
              <View style={{ marginTop: SPACING.m }}>
                <Text
                  variant="textLink"
                  color="ink"
                  onPress={retryFetch}
                  style={{ textDecorationLine: 'underline' }}
                >
                  Retry
                </Text>
              </View>
            </>
          ) : (
            <Text variant="body" color="umber" align="center">
              Hold to meet them.
            </Text>
          )}
        </View>
      </Animated.View>

      {/* Reveal layer — kid photo + name + CTAs */}
      {kid && showReveal ? (
        <Animated.View
          style={[
            { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
            revealLayerStyle,
          ]}
        >
          <KidReveal
            kid={{
              firstName: kid.firstName,
              age: kid.ageYears ?? undefined,
              grade: kid.gradeLabel ?? undefined,
              shirtNumber: kid.shirtNumber,
              photoUrl: kid.photoUrl ?? undefined,
              intro: kid.intro ?? undefined,
              location: kid.location || 'Hope Bridge Primary · Omoro District, Uganda',
            }}
            // CTA ladder, in order of the viewer's relationship:
            //   unclaimed number  → "Keep #N" (explicit claim — the
            //                       shirt-holder moment)
            //   monthly sponsor   → straight to the composer
            //   everyone else     → the conversion ask
            primaryLabel={
              kid.viewer.canClaim
                ? claiming
                  ? 'Making it yours…'
                  : `Keep #${number} — it's yours`
                : kid.viewer.canWriteNotes
                  ? `Send ${kid.firstName} a note`
                  : `Yes, sponsor ${kid.firstName}`
            }
            // The claim CTA says what claiming UNLOCKS — Kevin's
            // test-drive note: "sign in to claim" and "then you get
            // the penpal thing" were invisible. One quiet caption
            // fixes both.
            primaryCaption={
              kid.viewer.canClaim
                ? `Claiming makes this Number yours — and the letter that came with your shirt is ready to send. ${kid.firstName} writes back.`
                : undefined
            }
            onPrimaryPress={() => {
              if (kid.viewer.canClaim) {
                void handleClaim();
              } else if (kid.viewer.canWriteNotes) {
                router.push(`/children/${number}?compose=1`);
              } else {
                router.push(`/keep-going/${number}`);
              }
            }}
            secondaryLabel={`Look around ${kid.firstName}'s page`}
            onSecondaryPress={() => {
              router.push(`/children/${number}`);
            }}
          />
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}
