/**
 * <Text /> — the single text primitive.
 *
 * Every string in the app renders through this. It enforces:
 *   - one of nine named text styles (displayXL, h1, h2, h3, body,
 *     bodySmall, caption, overline, textLink) — you cannot pass a
 *     raw fontSize or fontFamily
 *   - the right color from the tokens (ink, umber, cream, gold)
 *   - text-transform + letter spacing where the style requires it
 *
 * If you find yourself reaching for RN's built-in <Text>, one of two
 * things is true: this file is missing a style you need (add it to
 * theme.ts first), or you're violating the design system.
 */
import React from 'react';
import {
  Text as RNText,
  TextProps as RNTextProps,
  TextStyle,
} from 'react-native';
import {
  COLORS,
  TEXT_STYLES,
  TextStyleKey,
} from '../../lib/theme';

type TextColor =
  | 'ink'
  | 'umber'
  | 'cream'
  | 'gold'
  | 'success'
  | 'error'
  | 'stone';

const COLOR_MAP: Record<TextColor, string> = {
  ink: COLORS.ink,
  umber: COLORS.umber,
  cream: COLORS.cream,
  gold: COLORS.gold,
  success: COLORS.success,
  error: COLORS.error,
  stone: COLORS.stone,
};

interface Props extends Omit<RNTextProps, 'style'> {
  variant?: TextStyleKey;
  color?: TextColor;
  align?: 'left' | 'center' | 'right';
  /** Escape hatch for one-off layout tweaks (margin, width, etc.). */
  style?: TextStyle;
}

export function Text({
  variant = 'body',
  color = 'ink',
  align,
  style,
  children,
  ...rest
}: Props) {
  const spec = TEXT_STYLES[variant];
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: spec.fontFamily,
          fontSize: spec.fontSize,
          lineHeight: spec.lineHeight,
          color: COLOR_MAP[color],
          ...(spec.letterSpacing ? { letterSpacing: spec.letterSpacing } : null),
          ...(spec.textTransform
            ? { textTransform: spec.textTransform }
            : null),
          ...(align ? { textAlign: align } : null),
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
