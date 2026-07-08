/**
 * <Input /> — the two-variant text input primitive.
 *
 * Per token F2 resolution:
 *   - `field` variant: cream bg, 1px ink outline, r=12, padding=14, for
 *     single-line or short fields (auth email, receipt address, etc.)
 *   - `writingSurface` variant: paper bg, no border, r=12, padding=16,
 *     minHeight=220, for the note composer only
 *
 * No third variant may be improvised. If you need a new input shape,
 * add it to the tokens first.
 */
import React, { useState } from 'react';
import { TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { COLORS, RADIUS, SPACING, TEXT_STYLES } from '../../lib/theme';

type Variant = 'field' | 'writingSurface';

interface Props extends Omit<TextInputProps, 'style'> {
  variant?: Variant;
  containerStyle?: ViewStyle;
}

export function Input({
  variant = 'field',
  containerStyle,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);

  if (variant === 'writingSurface') {
    return (
      <TextInput
        {...rest}
        placeholderTextColor={COLORS.placeholderText}
        multiline
        textAlignVertical="top"
        onFocus={e => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            backgroundColor: COLORS.paper,
            borderRadius: RADIUS.input,
            padding: SPACING.l,
            minHeight: 220,
            fontFamily: TEXT_STYLES.body.fontFamily,
            fontSize: TEXT_STYLES.body.fontSize,
            lineHeight: TEXT_STYLES.body.lineHeight,
            color: COLORS.ink,
          },
          containerStyle,
        ]}
      />
    );
  }

  // Field variant.
  return (
    <View
      style={[
        {
          backgroundColor: COLORS.cream,
          borderRadius: RADIUS.input,
          borderWidth: focused ? 2 : 1,
          borderColor: COLORS.ink,
          padding: 14 - (focused ? 1 : 0), // preserve inner size across widths
        },
        containerStyle,
      ]}
    >
      <TextInput
        {...rest}
        placeholderTextColor={COLORS.placeholderText}
        onFocus={e => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          fontFamily: TEXT_STYLES.body.fontFamily,
          fontSize: TEXT_STYLES.body.fontSize,
          lineHeight: TEXT_STYLES.body.lineHeight,
          color: COLORS.ink,
          padding: 0, // container handles padding
        }}
      />
    </View>
  );
}
