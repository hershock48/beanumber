/**
 * <Postmark /> — the rubber-stamp roundel.
 *
 * Letters are this product's soul, and real mail carries postmarks.
 * A small ink stamp — kid's number in the middle, HOPE BRIDGE ·
 * OMORO DISTRICT · UGANDA around the ring — slightly rotated like it
 * was pressed by hand, at 45% opacity like it half-dried. Pure
 * typography, zero photographs, instantly postal.
 *
 * Sits in the penpal thread header. Decorative — hidden from
 * accessibility.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Path,
  Text as SvgText,
  TextPath,
} from 'react-native-svg';
import { COLORS, TEXT_STYLES } from '../../lib/theme';

interface Props {
  shirtNumber: number;
  size?: number;
}

export function Postmark({ shirtNumber, size = 64 }: Props) {
  const s = size;
  const c = s / 2;
  const ringR = s * 0.36; // radius of the text ring's baseline path

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: s, height: s, transform: [{ rotate: '-8deg' }], opacity: 0.45 }}
    >
      <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
        <Defs>
          {/* Full circle path the ring text rides on, starting at the
              left midpoint so the text arcs over the top. */}
          <Path
            id="ring"
            d={`M ${c - ringR}, ${c} a ${ringR},${ringR} 0 1,1 ${
              ringR * 2
            },0 a ${ringR},${ringR} 0 1,1 -${ringR * 2},0`}
          />
        </Defs>
        <Circle
          cx={c}
          cy={c}
          r={s * 0.47}
          stroke={COLORS.ink}
          strokeWidth={1.4}
          fill="none"
        />
        <Circle
          cx={c}
          cy={c}
          r={s * 0.27}
          stroke={COLORS.ink}
          strokeWidth={0.8}
          fill="none"
        />
        <SvgText
          fill={COLORS.ink}
          fontSize={s * 0.088}
          letterSpacing={0.8}
          fontFamily={TEXT_STYLES.overline.fontFamily}
        >
          <TextPath href="#ring" startOffset="2%">
            HOPE BRIDGE · OMORO DISTRICT · UGANDA ·
          </TextPath>
        </SvgText>
        <SvgText
          x={c}
          y={c + s * 0.055}
          fill={COLORS.ink}
          fontSize={s * 0.16}
          fontFamily={TEXT_STYLES.h3.fontFamily}
          textAnchor="middle"
        >
          {`#${shirtNumber}`}
        </SvgText>
      </Svg>
    </View>
  );
}
