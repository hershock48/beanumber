/**
 * <LetterJourney /> — the four-dot path a penpal note travels.
 *
 *   Sent → Reviewed → Translated → In {kid}'s hands
 *
 * Rendered under the sponsor's MOST RECENT note while it's still in
 * flight (stage < 4). The psychology is the pizza-tracker effect:
 * a letter that takes two weeks to arrive feels broken when the app
 * is silent, and feels ALIVE when you can watch it move. Every stage
 * here is a real human doing a real thing — Kevin reads it, the
 * campus team receives it, a teacher translates it, a kid holds it.
 * The stepper is just those people made visible.
 *
 * Visual: dots joined by hairlines. Done dots fill gold, the current
 * dot gets a gold ring, future dots are sand. Label under the
 * current dot only — one line, umber caption. No animation; the
 * movement IS the state change between visits.
 */
import React from 'react';
import { View } from 'react-native';
import { COLORS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../design/Text';

interface Props {
  /** 1–4, from the thread API. */
  stage: number;
  kidFirstName: string;
}

const DOT = 10;
const RING = 16;

export function LetterJourney({ stage, kidFirstName }: Props) {
  const labels = [
    'Sent',
    'Reviewed',
    'Translated',
    `In ${kidFirstName}’s hands`,
  ];
  const current = Math.min(Math.max(stage, 1), 4);

  return (
    <View
      style={{ marginTop: SPACING.s, marginBottom: SPACING.s }}
      accessibilityLabel={`Your note is at step ${current} of 4: ${labels[current - 1]}`}
    >
      {/* Dots + connectors */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {[1, 2, 3, 4].map(step => {
          const done = step < current;
          const isCurrent = step === current;
          return (
            <React.Fragment key={step}>
              {step > 1 ? (
                <View
                  style={{
                    flex: 1,
                    height: 1,
                    backgroundColor: done || isCurrent ? COLORS.gold : COLORS.sand,
                  }}
                />
              ) : null}
              <View
                style={{
                  width: RING,
                  height: RING,
                  borderRadius: RING / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: isCurrent ? 1.5 : 0,
                  borderColor: COLORS.gold,
                }}
              >
                <View
                  style={{
                    width: DOT,
                    height: DOT,
                    borderRadius: DOT / 2,
                    backgroundColor: done || isCurrent ? COLORS.gold : COLORS.sand,
                  }}
                />
              </View>
            </React.Fragment>
          );
        })}
      </View>

      {/* Current-stage label */}
      <Text
        variant="caption"
        color="umber"
        style={{
          marginTop: SPACING.xs,
          fontFamily: TEXT_STYLES.caption.fontFamily,
        }}
      >
        {labels[current - 1]}
        {current === 3 ? ' — travels with the Sunday batch' : ''}
      </Text>
    </View>
  );
}
