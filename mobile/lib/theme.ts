/**
 * BAN mobile design system — canonical tokens ported from
 * `docs/fable-5-output/3.8-design-tokens.json`.
 *
 * Precedence rule from the Fable handoff: where any mockup or
 * annotation disagrees with these values, the tokens win. When we
 * disagree with the tokens, we edit the tokens first, then this file.
 *
 * Light-mode first. Dark mode ships after the whole app is on TestFlight.
 */

// ─── COLOR ────────────────────────────────────────────────────────────

export const COLORS = {
  // Primary palette
  gold: '#D4A843',
  ink: '#0d0d0d',
  cream: '#fafafa',

  // Warm neutral scale (Paper → Charcoal)
  paper: '#f4f1ea',
  sand: '#e8e3d9',
  stone: '#b6ad9e',
  umber: '#6f6759',
  charcoal: '#3a352b',

  // Semantic
  success: '#3E6B4F',
  error: '#B4573F',
  info: '#6E7E8B',

  // Aliases
  unreadDot: '#D4A843',
  divider: 'rgba(58,53,43,0.10)',
  backdrop: 'rgba(58,53,43,0.40)',
  sheetHandle: 'rgba(58,53,43,0.30)',
  placeholderText: 'rgba(58,53,43,0.60)',

  // Apple sign-in — the only sanctioned pure black in the product
  appleSignInBlack: '#000000',
} as const;

export const DARK_COLORS = {
  gold: '#E5B858',
  background: '#1a1a1a',
  card: '#252525',
  cardBorder: '#3a352b',
  textPrimary: '#f5f5f5',
  textSecondary: '#b0a996',
  success: '#55876B',
  error: '#CE7257',
  info: '#8B9CAA',
  unreadDot: '#E5B858',
} as const;

// ─── TYPOGRAPHY ───────────────────────────────────────────────────────

/**
 * Font family names as loaded via @expo-google-fonts.
 * Every text style resolves to one of these strings.
 */
export const FONT_FAMILIES = {
  loraRegular: 'Lora_400Regular',
  loraMedium: 'Lora_500Medium',
  loraSemiBold: 'Lora_600SemiBold',
  loraItalic: 'Lora_400Regular_Italic',
  interRegular: 'Inter_400Regular',
  interMedium: 'Inter_500Medium',
  interSemiBold: 'Inter_600SemiBold',
} as const;

export type TextStyleKey =
  | 'displayXL'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodySmall'
  | 'caption'
  | 'overline'
  | 'textLink';

interface TextStyleSpec {
  fontFamily: string;
  fontSize: number;
  lineHeight: number; // absolute px, not multiplier
  letterSpacing?: number;
  textTransform?: 'uppercase' | 'none';
}

export const TEXT_STYLES: Record<TextStyleKey, TextStyleSpec> = {
  // Reserved: kid's name on reveal landed state ONLY
  displayXL: {
    fontFamily: FONT_FAMILIES.loraRegular,
    fontSize: 44,
    lineHeight: 44 * 1.15,
  },
  // Screen titles, kid names on their profile
  h1: {
    fontFamily: FONT_FAMILIES.loraMedium,
    fontSize: 32,
    lineHeight: 32 * 1.15,
  },
  // Section headers on emotional surfaces
  h2: {
    fontFamily: FONT_FAMILIES.loraRegular,
    fontSize: 24,
    lineHeight: 24 * 1.3,
  },
  // Sub-section headers, sheet titles, buyer-home section headers
  h3: {
    fontFamily: FONT_FAMILIES.interSemiBold,
    fontSize: 20,
    lineHeight: 20 * 1.3,
  },
  // Default reading copy
  body: {
    fontFamily: FONT_FAMILIES.interRegular,
    fontSize: 17,
    lineHeight: 17 * 1.55,
  },
  bodySmall: {
    fontFamily: FONT_FAMILIES.interRegular,
    fontSize: 15,
    lineHeight: 15 * 1.55,
  },
  caption: {
    fontFamily: FONT_FAMILIES.interRegular,
    fontSize: 13,
    lineHeight: 13 * 1.4,
  },
  overline: {
    fontFamily: FONT_FAMILIES.interMedium,
    fontSize: 11,
    lineHeight: 11 * 1.4,
    letterSpacing: 0.55, // 0.05em at 11px
    textTransform: 'uppercase',
  },
  // Inline section links — 17 Semibold is reserved for ghost buttons
  textLink: {
    fontFamily: FONT_FAMILIES.interSemiBold,
    fontSize: 15,
    lineHeight: 15,
  },
};

// ─── SPACING ──────────────────────────────────────────────────────────

export const SPACING = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
  screen: 48,
  zone: 64,
  /** Rule from consistency pass: 32 between sections app-wide. */
  section: 32,
} as const;

// ─── RADIUS ───────────────────────────────────────────────────────────

export const RADIUS = {
  chip: 4,
  listPhoto: 8,
  smallCard: 8,
  input: 12,
  card: 12,
  button: 12,
  cardLarge: 16,
  sheetTop: 24,
  pill: 999,
} as const;

// ─── ELEVATION ────────────────────────────────────────────────────────

// React Native shadows split into iOS (shadow*) and Android (elevation).
// Values transcribed from the tokens' CSS box-shadow spec.
export const ELEVATION = {
  e0: {},
  e1: {
    shadowColor: '#1e1408',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  e2: {
    shadowColor: '#1e1408',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  e3: {
    shadowColor: '#1e1408',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
} as const;

// ─── MOTION ───────────────────────────────────────────────────────────

export const MOTION = {
  easing: {
    // Standard ease-out. React Native's Easing.bezier(0.4, 0, 0.2, 1).
    standard: [0.4, 0, 0.2, 1] as const,
  },
  spring: {
    // For delight moments only (reveal, notification arrival).
    tension: 180,
    friction: 22,
    mass: 1,
  },
  duration: {
    micro: 200, // state changes, taps
    standard: 350, // screen transitions, card expand
    emphasized: 800, // reveal, notification landing
  },
  skeleton: {
    // Cream → paper shimmer at ~60 BPM.
    from: COLORS.cream,
    to: COLORS.paper,
    bpm: 60,
  },
} as const;

// ─── DOT SIZES ────────────────────────────────────────────────────────

export const DOT_SIZE = {
  sm: 6, // tab-bar icon overlay
  md: 8, // kid-card photo overlay
} as const;

// ─── HAPTIC PATTERN NAMES ─────────────────────────────────────────────

// Symbolic names — actual impl lives in lib/haptics.ts.
export const HAPTIC = {
  touch: 'light',
  milestone: 'light',
  completion: 'success',
  landed: 'light',
  error: 'error',
} as const;

// ─── TYPE HELPERS ─────────────────────────────────────────────────────

export type ColorKey = keyof typeof COLORS;
export type SpacingKey = keyof typeof SPACING;
export type RadiusKey = keyof typeof RADIUS;
export type ElevationKey = keyof typeof ELEVATION;
