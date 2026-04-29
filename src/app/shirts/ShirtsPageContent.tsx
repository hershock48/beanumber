'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { Logo } from '@/components/Logo';
import { CartProvider, useCart } from '@/components/CartContext';
import { CartDrawer, CartButton } from '@/components/CartDrawer';

/* ── Color palette + per-color theme ────────────────────────── */

// Each shirt design is available in the same palette. Ordered neutrals first
// (most common) then accent tones for visual rhythm on the selector.
const COLORS = ['Black', 'Grey', 'Pink', 'Yellow'] as const;
type ColorName = (typeof COLORS)[number];

type ShirtTheme = {
  /** Body color of the shirt as rendered in the mockup. */
  shirt: string;
  /** Swatch shown in the color picker (may differ slightly for visibility). */
  swatch: string;
  /** HTV vinyl color for the printed artwork — auto-contrasted for legibility. */
  vinyl: string;
  /** Muted foreground used for the small "beanumber.org" text on the back. */
  muted: string;
  /** Preview-card background — warmer tan for white shirts so they don't vanish. */
  cardBg: string;
  /** Subtle border color for the preview card, tuned to the card background. */
  cardBorder: string;
};

// HTV is chosen per shirt color to stay legible on the mockup. In production
// Kevin can print whatever vinyl he prefers — these values are representative.
const THEMES: Record<ColorName, ShirtTheme> = {
  Black:  { shirt: '#111111', swatch: '#111111', vinyl: '#ffffff', muted: 'rgba(255,255,255,0.3)', cardBg: '#ffffff', cardBorder: '#e8e0d4' },
  Grey:   { shirt: '#8a8a8a', swatch: '#9a9a9a', vinyl: '#ffffff', muted: 'rgba(255,255,255,0.3)', cardBg: '#ffffff', cardBorder: '#e8e0d4' },
  Pink:   { shirt: '#f4b8c4', swatch: '#f4b8c4', vinyl: '#2a1520', muted: 'rgba(0,0,0,0.35)', cardBg: '#ffffff', cardBorder: '#e8e0d4' },
  Yellow: { shirt: '#f3d35b', swatch: '#f3d35b', vinyl: '#141414', muted: 'rgba(0,0,0,0.35)', cardBg: '#ffffff', cardBorder: '#e8e0d4' },
};

// The mission gold stays constant; it's the brand accent and reads on any body.
const GOLD = '#D4A843';

/* ── Inline shirt design components ─────────────────────────── */

type DesignMode = 'flat' | 'tee';

type DesignProps = {
  theme: ShirtTheme;
  mode?: DesignMode;
  className?: string;
};

/* ── Tee silhouette ─────────────────────────────────────────── */

/**
 * SVG outline of a crew-neck tee. Used as the primary preview so buyers see
 * the design *on a shirt* rather than floating inside a rectangle. The
 * viewBox is 300 × 380 and children are placed in absolute % coords that
 * map onto the body region (roughly x ∈ [24%, 76%], y ∈ [18%, 92%]).
 */
function TeeOutline({ theme, side }: { theme: ShirtTheme; side: 'front' | 'back' }) {
  // Deeper neckline on the front; subtle dip on the back.
  const neckCurve = side === 'front' ? 'Q 150 72 175 28' : 'Q 150 42 175 28';
  const path = `M 60 28 L 125 28 ${neckCurve} L 240 28 L 272 84 L 258 104 L 232 96 L 232 352 L 68 352 L 68 96 L 42 104 L 28 84 Z`;

  return (
    <svg
      viewBox="0 0 300 380"
      className="absolute inset-0 w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.08))' }}
      aria-hidden
    >
      <path d={path} fill={theme.shirt} />
      {/* Subtle seam suggestion along the neckline for definition. */}
      <path
        d={
          side === 'front'
            ? 'M 127 30 Q 150 66 173 30'
            : 'M 128 30 Q 150 40 172 30'
        }
        fill="none"
        stroke={theme.muted}
        strokeWidth={1}
      />
    </svg>
  );
}

/**
 * Shared container that switches between a plain rectangle (flat mode) and
 * a tee silhouette (tee mode) while keeping the design overlay markup stable.
 */
function DesignContainer({
  theme,
  mode,
  side,
  className = '',
  children,
}: {
  theme: ShirtTheme;
  mode: DesignMode;
  side: 'front' | 'back';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative aspect-[3/4] ${className}`}
      style={{
        backgroundColor: mode === 'flat' ? theme.shirt : 'transparent',
        containerType: 'inline-size',
      }}
    >
      {mode === 'tee' && <TeeOutline theme={theme} side={side} />}
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

/* ── Shirt design components ────────────────────────────────── */

/**
 * Universal front used on every shirt. Small # mark + "beanumber.org" in
 * small caps centered ~3 inches below the neckline. In tee mode the mark
 * sits lower on the mockup (below the SVG neckline); in flat mode it sits
 * higher (closer to the top of the box).
 */
function SharedFront({ theme, mode = 'tee', className = '' }: DesignProps) {
  const top = mode === 'tee' ? '28%' : '17%';
  const width = mode === 'tee' ? '10%' : '14%';

  return (
    <DesignContainer theme={theme} mode={mode} side="front" className={className}>
      <div
        className="absolute left-1/2 flex flex-col items-center"
        style={{ top, width, transform: 'translateX(-50%)' }}
      >
        <Logo variant="micro" className="w-full" style={{ color: theme.vinyl }} />
        <span
          className="font-semibold uppercase"
          style={{
            color: theme.vinyl,
            fontSize: mode === 'tee' ? 'clamp(3px, 1.4cqw, 6px)' : 'clamp(4px, 1.8cqw, 8px)',
            letterSpacing: '0.18em',
            marginTop: '8%',
          }}
        >
          beanumber.org
        </span>
      </div>
    </DesignContainer>
  );
}

/**
 * Flagship front — small cross mark on the chest at the same size and
 * placement as the # mark on every other shirt, with beanumber.org below.
 */
function FlagshipFront({ theme, mode = 'tee', className = '' }: DesignProps) {
  const top = mode === 'tee' ? '28%' : '17%';
  const width = mode === 'tee' ? '10%' : '14%';

  return (
    <DesignContainer theme={theme} mode={mode} side="front" className={className}>
      <div
        className="absolute left-1/2 flex flex-col items-center"
        style={{ top, width, transform: 'translateX(-50%)' }}
      >
        <Logo variant="cross" className="w-full" style={{ color: theme.vinyl }} />
        <span
          className="font-semibold uppercase"
          style={{
            color: theme.vinyl,
            fontSize: mode === 'tee' ? 'clamp(3px, 1.4cqw, 6px)' : 'clamp(4px, 1.8cqw, 8px)',
            letterSpacing: '0.18em',
            marginTop: '8%',
          }}
        >
          beanumber.org
        </span>
      </div>
    </DesignContainer>
  );
}

/** Large # logo with BEANUMBER lettering — Flagship back. Same vinyl
 *  color as the front so Kevin only cuts one sheet per shirt. */
function FlagshipBack({ theme, mode = 'tee', className = '' }: DesignProps) {
  // Back print is typically ~10–12" wide on a ~20" body, so ~55% of body
  // ≈ 28% of the container.
  const top = mode === 'tee' ? '30%' : '25%';
  const width = mode === 'tee' ? '28%' : '50%';

  return (
    <DesignContainer theme={theme} mode={mode} side="back" className={className}>
      <div
        className="absolute left-1/2"
        style={{ top, width, transform: 'translateX(-50%)' }}
      >
        <Logo variant="primary" className="w-full" style={{ color: theme.vinyl }} />
      </div>
    </DesignContainer>
  );
}

/**
 * Shared layout for the three text-back designs (Thank you / Do Not Fear /
 * Peacemaker). Lora serif, LEFT-aligned inside the back body area, stacked
 * across multiple lines like the Peacemaker production photo.
 */
function TextBack({
  theme,
  mode = 'tee',
  lines,
  weight = 700,
  scale = 1,
  className = '',
}: DesignProps & { lines: string[]; weight?: number; scale?: number }) {
  // In tee mode the text is positioned within the back body region (body
  // runs ~23% → 77% horizontally, ~18% → 92% vertically). In flat mode the
  // whole box is usable; we still left-align but with a generous margin.
  // The *block* is centered horizontally on the shirt back (transform
  // -50%), but the text inside the block is left-aligned so each line
  // starts at the same x — matching the Peacemaker production photo.
  //
  // `scale` shrinks text for longer words (e.g. "Everything / Hallelujah.")
  // so they don't overflow the shirt body.
  const topPos = mode === 'tee' ? '23%' : '14%';
  const teeSize = 12 * scale;
  const teeMax = Math.round(64 * scale);
  const flatSize = 12.5 * scale;
  const flatMax = Math.round(80 * scale);
  const fontSize = mode === 'tee'
    ? `clamp(22px, ${teeSize}cqw, ${teeMax}px)`
    : `clamp(26px, ${flatSize}cqw, ${flatMax}px)`;

  return (
    <DesignContainer theme={theme} mode={mode} side="back" className={className}>
      <div
        className="absolute text-left"
        style={{
          left: '50%',
          top: topPos,
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-lora), Georgia, serif',
          fontWeight: weight,
          color: theme.vinyl,
          fontSize,
          lineHeight: 1.45,
          letterSpacing: '-0.01em',
        }}
      >
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </DesignContainer>
  );
}

function ThankYouBack(props: DesignProps) {
  return <TextBack {...props} lines={['Thank', 'you.']} weight={600} />;
}

function DoNotFearBack(props: DesignProps) {
  return <TextBack {...props} lines={['Do', 'Not', 'Fear.']} />;
}

function PeacemakerBack(props: DesignProps) {
  return <TextBack {...props} lines={['Peace', 'maker.']} />;
}

/**
 * Everything Hallelujah back — small centered text repeated 5 times down the
 * spine of the shirt, each block the same size as the front chest logo.
 */
function EverythingHallelujahBack({ theme, mode = 'tee', className = '' }: DesignProps) {
  // Tee mode: small like the front chest logo. Flat/hover mode: scaled up
  // so the text is actually readable when someone hovers to inspect.
  // On mobile tee mode, make it wider + fewer reps so the text is legible.
  // On desktop tee the original proportions work fine.
  const blockWidth = mode === 'tee' ? '23%' : '36%';
  const fontSize = mode === 'tee'
    ? 'clamp(4px, 2.3cqw, 10px)'
    : 'clamp(6px, 3.4cqw, 16px)';
  // Spread the 5 repetitions evenly down the back body area
  const startTop = mode === 'tee' ? 20 : 10;
  const gap = mode === 'tee' ? 13 : 16;

  return (
    <DesignContainer theme={theme} mode={mode} side="back" className={className}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="absolute text-center uppercase"
          style={{
            left: '50%',
            top: `${startTop + i * gap}%`,
            transform: 'translateX(-50%)',
            width: blockWidth,
            fontFamily: 'var(--font-lora), Georgia, serif',
            fontWeight: 700,
            color: theme.vinyl,
            fontSize,
            lineHeight: 1.3,
            letterSpacing: '0.08em',
          }}
        >
          <div>Everything</div>
          <div>Hallelujah</div>
        </div>
      ))}
    </DesignContainer>
  );
}

/**
 * Nigeria back — "NIGERIA" in tracked uppercase Lora centered on the back,
 * with a thin cross centered below the text.
 */
function NigeriaBack({ theme, mode = 'tee', className = '' }: DesignProps) {
  const topPos = mode === 'tee' ? '28%' : '20%';
  const fontSize = mode === 'tee' ? 'clamp(16px, 9cqw, 47px)' : 'clamp(22px, 10.5cqw, 68px)';
  const crossSize = mode === 'tee' ? 'clamp(20px, 10cqw, 54px)' : 'clamp(28px, 12cqw, 76px)';

  return (
    <DesignContainer theme={theme} mode={mode} side="back" className={className}>
      <div
        className="absolute flex flex-col items-center"
        style={{
          left: '50%',
          top: topPos,
          transform: 'translateX(-50%)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-lora), Georgia, serif',
            fontWeight: 700,
            color: theme.vinyl,
            fontSize,
            letterSpacing: '0.06em',
            textAlign: 'center',
          }}
        >
          NIGERIA
        </div>
        <svg
          viewBox="0 0 40 56"
          style={{ width: crossSize, marginTop: '12%' }}
          aria-hidden
        >
          <rect x="18" y="0" width="4" height="56" fill={theme.vinyl} />
          <rect x="4" y="18" width="32" height="4" fill={theme.vinyl} />
        </svg>
      </div>
    </DesignContainer>
  );
}


/* ── Shirt data ─────────────────────────────────────────────── */

type Shirt = {
  id: string;
  name: string;
  tagline: string;
  price: number;
  description: string;
  Front: React.ComponentType<DesignProps>;
  Back: React.ComponentType<DesignProps>;
  badge: string | null;
  specs: string;
};

const SHIRTS_SOURCE: Shirt[] = [
  {
    id: 'flagship',
    name: 'The Flagship',
    tagline: 'The one that started it all',
    price: 25,
    description: 'This is the shirt that started Be A Number. Before there were any designs there was one idea: put a number on a shirt, connect that number to a real child, and see what happens. What happened was people showed up. Your $25 gets you the shirt and sponsors a child for your first month. The number you receive is assigned by order and belongs to a real kid in Northern Uganda. This is the original.',
    Front: FlagshipFront,
    Back: FlagshipBack,
    badge: 'Original',
    specs: 'S – 2XL · Unisex · Heavyweight cotton',
  },
  {
    id: 'do-not-fear',
    name: 'Do Not Fear.',
    tagline: 'A reminder you can wear',
    price: 25,
    description: '"Do not fear" appears over 100 times in the Bible. More than any other repeated command. Not because it\'s easy, but because God knows we need to hear it constantly. Whatever you\'re afraid of is not bigger than the God who said it. Move forward. Trust in love.',
    Front: SharedFront,
    Back: DoNotFearBack,
    badge: 'Courage',
    specs: 'S – 2XL · Unisex · Heavyweight cotton',
  },
  {
    id: 'peacemaker',
    name: 'Peacemaker.',
    tagline: 'Blessed are those who show up',
    price: 25,
    description: '"Blessed are the peacemakers. But woe to those who manipulate religion and the very name of God for their own military, economic and political gain." That\'s Pope Leo XIV, speaking in Cameroon on his first trip as pope. When the world pushed back, he didn\'t flinch. He said "I have no fear." This shirt is for the person who heard that and meant it.',
    Front: SharedFront,
    Back: PeacemakerBack,
    badge: 'Conviction',
    specs: 'S – 2XL · Unisex · Heavyweight cotton',
  },
  {
    id: 'everything-hallelujah',
    name: 'Everything Hallelujah.',
    tagline: 'The whole thing, all of it',
    price: 25,
    description: 'Through the good and the bad. Everything hallelujah. Not just praise when things are easy. Praise when they\'re not. Praise when it doesn\'t make sense yet. When the news is bad, when the money is short, when someone you love is suffering and you can\'t fix it. Hallelujah anyway. That\'s the whole point.',
    Front: SharedFront,
    Back: EverythingHallelujahBack,
    badge: 'Praise',
    specs: 'S – 2XL · Unisex · Heavyweight cotton',
  },
];

/** Fisher-Yates shuffle — used for both shirts and colors. */
function shuffle<T>(src: T[]): T[] {
  const arr = [...src];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Assign a different preview color to each shirt so the page reads as a
 * collection, not six identical black tees. Shuffles the five colors and
 * cycles through them so no two adjacent shirts share a color.
 */
function assignPreviewColors(count: number): ColorName[] {
  const shuffled = shuffle([...COLORS]);
  return Array.from({ length: count }, (_, i) => shuffled[i % shuffled.length]);
}

/* ── Per-shirt card (owns color + size state) ───────────────── */

const SIZES = ['S', 'M', 'L', 'XL', '2XL'];
// Default preview color when the user hasn't chosen yet. Black is the safest
// showcase for light artwork and matches the design mockups' original intent.
const DEFAULT_PREVIEW_COLOR: ColorName = 'Black';

/**
 * Single preview slot that shows a shirt silhouette by default and reveals
 * the flat, detailed design on hover (desktop) or tap (mobile). The two
 * views are stacked absolutely so the cross-fade is purely opacity-based.
 */
function PreviewMockup({
  Design,
  theme,
  label,
}: {
  Design: React.ComponentType<DesignProps>;
  theme: ShirtTheme;
  label: 'Front' | 'Back';
}) {
  const [tapped, setTapped] = useState(false);

  return (
    <div
      className="p-2 sm:p-4 flex flex-col items-center border transition-colors duration-300"
      style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
    >
      <div
        className="group relative w-full cursor-pointer select-none"
        role="button"
        tabIndex={0}
        aria-label={`${label} view — tap to toggle design detail`}
        onClick={() => setTapped((t) => !t)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setTapped((t) => !t);
          }
        }}
        onMouseLeave={() => setTapped(false)}
      >
        {/* Tee silhouette — default visible; fades out on hover/tap */}
        <div
          className={`transition-opacity duration-300 ${
            tapped ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
          }`}
        >
          <Design theme={theme} mode="tee" className="w-full rounded-sm transition-colors duration-300" />
        </div>

        {/* Flat detail — hidden by default; fades in on hover/tap */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            tapped ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Design theme={theme} mode="flat" className="w-full rounded-sm transition-colors duration-300" />
        </div>

        {/* Subtle hint chip — visible when NOT hovered/tapped */}
        <div
          className={`absolute bottom-2 right-2 text-[9px] font-semibold uppercase tracking-wider px-2 py-1 bg-white/80 backdrop-blur-sm border border-[#e8e0d4] text-[#888] transition-opacity duration-200 ${
            tapped ? 'opacity-0' : 'opacity-70 group-hover:opacity-0'
          }`}
        >
          Tap for detail
        </div>
      </div>
      <p className="text-xs text-[#999] mt-3 font-bold uppercase tracking-wider">{label}</p>
    </div>
  );
}

function ShirtCard({ shirt, reversed, initialColor }: { shirt: Shirt; reversed: boolean; initialColor: ColorName }) {
  const [selectedColor, setSelectedColor] = useState<ColorName | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Unchecked by default. Opting in converts this purchase into a monthly
  // sponsorship from day one — the $25 today IS month one, then $25/month.
  const [continueMonthly, setContinueMonthly] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const { addItem } = useCart();

  const previewTheme = THEMES[selectedColor ?? initialColor];
  const Front = shirt.Front;
  const Back = shirt.Back;

  function handleAddToCart() {
    if (!selectedColor) {
      setError('Please select a color.');
      return;
    }
    if (!selectedSize) {
      setError('Please select a size.');
      return;
    }

    setError(null);
    addItem({
      shirtId: shirt.id,
      shirtName: shirt.name,
      color: selectedColor,
      size: selectedSize,
      continueMonthly,
      price: shirt.price,
    });

    // Flash confirmation, then reset selections for another add
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
    setContinueMonthly(false);
  }

  return (
    <div className="scroll-mt-24" id={shirt.id}>
      <div className={`flex flex-col ${reversed ? 'md:flex-row-reverse' : 'md:flex-row'} gap-6 md:gap-14 items-center`}>
        {/* Title block — visible on mobile ABOVE the mockups so the buyer
            knows what they're looking at before scrolling past the image.
            Hidden on desktop where the side-by-side layout makes it redundant. */}
        <div className="md:hidden w-full">
          <div className="flex items-center gap-3 mb-2">
            {shirt.badge && (
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 bg-[#D4A843]/10 text-[#D4A843] border border-[#D4A843]/20">
                {shirt.badge}
              </span>
            )}
            <span className="text-xs text-[#aaa] uppercase tracking-wider">Available in 4 colors</span>
          </div>
          <h2
            className="text-3xl text-[#0d0d0d] mb-1"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {shirt.name}
          </h2>
          <p className="text-sm text-[#777] italic mb-0">{shirt.tagline}</p>
        </div>

        {/* Mockup previews */}
        <div className="flex-1 w-full">
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <PreviewMockup Design={Front} theme={previewTheme} label="Front" />
            <PreviewMockup Design={Back} theme={previewTheme} label="Back" />
          </div>
          {!selectedColor && (
            <p className="text-xs text-[#aaa] text-center mt-3 italic">
              Showing in {initialColor} — pick a color below to preview.
            </p>
          )}
          {/* Inside-collar detail: mini mockup of the actual stamp the buyer
              will find inside the neck. Uses a mono type to mimic the stamped
              look, with a clear "sample" caption so no one expects #0007. */}
          <div className="mt-3 sm:mt-5 bg-white border border-dashed border-[#e8e0d4] px-3 sm:px-5 py-3 sm:py-4 flex items-center gap-3 sm:gap-5">
            {/* Stamp mockup — centered inside a faux collar tape. */}
            <div
              className="flex-none bg-[#faf6ee] border border-[#e8e0d4] px-3 py-2 text-center"
              style={{
                fontFamily: '"Courier New", ui-monospace, SFMono-Regular, monospace',
                color: '#2a2a2a',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.02)',
              }}
              aria-hidden
            >
              <div className="text-[9px] uppercase tracking-[0.25em] text-[#888] leading-none mb-1">
                Order&nbsp;#
              </div>
              <div className="text-lg leading-none font-bold tracking-[0.15em] text-[#1a1a1a]">
                0007
              </div>
            </div>
            <div className="text-xs text-[#777] leading-snug">
              <p className="font-semibold text-[#555] mb-0.5">
                Stamped on the inside collar.
              </p>
              <p className="text-[#999]">
                Sample shown — your number is assigned at checkout and printed
                inside the neck, like a numbered edition.
              </p>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 w-full">
          {/* Desktop title — hidden on mobile where it appears above the mockups */}
          <div className="hidden md:block">
            <div className="flex items-center gap-3 mb-2">
              {shirt.badge && (
                <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 bg-[#D4A843]/10 text-[#D4A843] border border-[#D4A843]/20">
                  {shirt.badge}
                </span>
              )}
              <span className="text-xs text-[#aaa] uppercase tracking-wider">Available in 4 colors</span>
            </div>
            <h2
              className="text-3xl md:text-4xl text-[#0d0d0d] mb-1"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {shirt.name}
            </h2>
            <p className="text-sm text-[#777] italic mb-4">{shirt.tagline}</p>
          </div>
          <p
            className="text-2xl text-[#D4A843] mb-4"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
          >
            ${shirt.price}
          </p>
          <p className="text-sm sm:text-base text-[#666] leading-relaxed mb-2">
            {shirt.description}
          </p>
          <p className="text-xs text-[#aaa] mb-0">{shirt.specs}</p>

          {/* Buy controls */}
          <div className="mt-6">
            {/* Unisex fit callout — small, clean, hard to miss */}
            <div className="inline-block border border-[#e8e0d4] bg-white px-3 py-1.5 mb-5">
              <span className="text-[11px] text-[#888] uppercase tracking-[0.15em] font-semibold">Unisex fit</span>
            </div>

            {/* Color selector */}
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-xs text-[#999] uppercase tracking-wider font-bold">Color</p>
              {selectedColor && (
                <p className="text-xs text-[#666]">{selectedColor}</p>
              )}
            </div>
            <div className="flex gap-2.5 mb-5">
              {COLORS.map((name) => {
                const theme = THEMES[name];
                const active = selectedColor === name;
                return (
                  <button
                    key={name}
                    onClick={() => { setSelectedColor(name); setError(null); }}
                    aria-label={name}
                    title={name}
                    className={`w-9 h-9 rounded-full border transition-all cursor-pointer ${
                      active
                        ? 'border-[#0d0d0d] ring-2 ring-offset-2 ring-[#0d0d0d]'
                        : 'border-[#ddd] hover:border-[#999]'
                    }`}
                    style={{ backgroundColor: theme.swatch }}
                  />
                );
              })}
            </div>

            {/* Size selector */}
            <p className="text-xs text-[#999] uppercase tracking-wider font-bold mb-2">Size</p>
            <div className="flex gap-2 mb-4">
              {SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => { setSelectedSize(size); setError(null); }}
                  className={`w-12 h-10 text-sm font-semibold border transition-all cursor-pointer ${
                    selectedSize === size
                      ? 'bg-[#0d0d0d] text-white border-[#0d0d0d]'
                      : 'bg-white text-[#555] border-[#e8e0d4] hover:border-[#999]'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>

            {error && (
              <p className="text-sm text-red-600 mb-3">{error}</p>
            )}

            {/* Monthly sponsorship opt-in. Unchecked by default — the
                shirt always stands on its own. Checking it converts the
                purchase into a monthly sponsorship from day one ($25 today
                = month one, then $25/month). Built as a full-width card
                instead of a text checkbox so it actually gets read. */}
            <button
              type="button"
              onClick={() => setContinueMonthly(v => !v)}
              aria-pressed={continueMonthly}
              className={`w-full text-left mb-4 border transition-all cursor-pointer relative p-4 sm:p-5 ${
                continueMonthly
                  ? 'border-[#D4A843] bg-[#D4A843]/5 shadow-sm'
                  : 'border-[#e8e0d4] bg-white hover:border-[#D4A843]/50'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Gold checkbox indicator — visual state only; the whole
                    card is the click target. */}
                <span
                  aria-hidden
                  className={`mt-0.5 flex-shrink-0 w-5 h-5 border flex items-center justify-center transition-colors ${
                    continueMonthly
                      ? 'bg-[#D4A843] border-[#D4A843]'
                      : 'bg-white border-[#c9bfae]'
                  }`}
                >
                  {continueMonthly && (
                    <svg viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5 text-[#0d0d0d]">
                      <path d="M5 10l3.5 3.5L15 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <p
                      className="text-base text-[#0d0d0d]"
                      style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                    >
                      Stay in their life.
                    </p>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#D4A843] whitespace-nowrap">
                      +$25/mo
                    </p>
                  </div>
                  <p className="text-sm text-[#555] leading-snug mb-2">
                    The shirt is how you meet them. $25 a month is how you stay &mdash;
                    letters, photos, report cards, report from the ground.
                  </p>
                  <p className="text-xs text-[#999] leading-snug">
                    Your $25 today covers the shirt and month one. Billed $25/month after that. Cancel anytime from your sponsor portal.
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={handleAddToCart}
              className={`w-full sm:w-auto px-10 py-4 font-bold uppercase tracking-wider text-sm transition-colors inline-flex items-center justify-center gap-3 cursor-pointer ${
                justAdded
                  ? 'bg-[#2a7a2a] text-white'
                  : 'bg-[#D4A843] text-[#0d0d0d] hover:bg-[#c49a3a]'
              }`}
            >
              <span>
                {justAdded
                  ? 'Added!'
                  : continueMonthly
                    ? 'Add Shirt + Sponsor · $25'
                    : 'Add to Cart · $25'}
              </span>
              {justAdded && (
                <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-white">
                  <path d="M5 10l3.5 3.5L15 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>

            <p className="text-xs text-[#bbb] mt-3">
              {continueMonthly
                ? '$25 today. $25/month after. Cancel anytime.'
                : 'Your $25 covers the shirt and their first month.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page content ────────────────────────────────────────────── */

/** Captures ?ref= from the URL and stores it in CartContext for checkout. */
function RefCapture() {
  const searchParams = useSearchParams();
  const { setRefCode } = useCart();
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) setRefCode(ref);
  }, [searchParams, setRefCode]);
  return null;
}

export default function ShirtsPageContent() {
  // Shuffle order and preview colors once on mount so every visitor sees
  // a different arrangement. Prevents any design from being permanently
  // buried and makes the page feel like a real collection.
  const [shirts] = useState(() => shuffle(SHIRTS_SOURCE));
  const [previewColors] = useState(() => assignPreviewColors(SHIRTS_SOURCE.length));

  return (
    <CartProvider>
    <RefCapture />
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/shirts" />

      {/* Hero */}
      <section className="py-12 md:py-28 px-5">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">The Collection</p>
          <h1
            className="text-4xl md:text-5xl lg:text-6xl text-[#0d0d0d] mb-6"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Every shirt has a number.
          </h1>
          <p className="text-lg text-[#777] max-w-xl mx-auto leading-relaxed">
            Heavyweight blanks in four colors. HTV vinyl. Handmade to order.
            Each design carries a different part of the story.
          </p>
        </div>
      </section>

      {/* Shirt Grid */}
      <section className="px-5 pb-24">
        <div className="max-w-6xl mx-auto space-y-16 md:space-y-28">
          {shirts.map((shirt, i) => (
            <ShirtCard key={shirt.id} shirt={shirt} reversed={i % 2 !== 0} initialColor={previewColors[i]} />
          ))}
        </div>
      </section>

      {/* How the number works */}
      <section className="py-16 px-5 bg-white border-t border-[#e8e0d4]">
        <div className="max-w-3xl mx-auto">
          <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-10 text-center">
            <h2
              className="text-2xl text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              How the number works
            </h2>
            <p className="text-[#777] leading-relaxed max-w-lg mx-auto">
              Every shirt carries a unique number connected to a real child in Northern Uganda.
              Your $25 covers the shirt and sponsors that child for your first month.
              When it arrives, come here, enter your number, and meet them.
              Continue for $25/month to stay connected to their story.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-5 bg-white border-t border-[#e8e0d4]">
        <div className="max-w-3xl mx-auto">
          <h2
            className="text-3xl text-[#0d0d0d] mb-14 text-center"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Questions
          </h2>

          <div className="space-y-8">
            {[
              {
                q: 'What actually happens when I buy a shirt?',
                a: 'Your order number becomes your shirt number, and that number belongs to a real child enrolled in our program in Northern Uganda. When your shirt arrives, you\'ll come back to the site, enter your number, and meet them: their name, their face, their story. Your $25 covers the shirt and their first month of school, meals, and medical care. If you continue at $25/month, you stay connected to that child all year \u2014 a monthly campus newsletter, photos of your child through the year, a handwritten letter from them, and a year-end report card.',
              },
              {
                q: 'Where does the $25 actually go?',
                a: 'Your child\'s sponsorship funds education, daily meals, medical care through the on-site clinic, and mentorship. But it also supports the community infrastructure around them: the 60 women in vocational training, the 700+ patients served through medical outreach, the construction apprenticeships. It\'s not just one child; it\'s the ecosystem that keeps them safe.',
              },
              {
                q: 'Can I pick my number?',
                a: 'No. And that\'s by design. Numbers are assigned in order so every child gets matched, not just the ones with the best photos. The whole idea of Be A Number is turning something impersonal (being reduced to a number) into something deeply personal. Your number isn\'t random. It\'s someone\'s name waiting to be learned.',
              },
              {
                q: 'Who\'s on the ground doing this work?',
                a: 'Our partner is Youth Development Organisation Uganda (YDO), led by Simon Peter Wilobo in Gulu District. YDO was born out of Northern Uganda\'s post-conflict recovery and has deep roots in the community. Every program (education, health, vocational training, child protection) is designed and run by Ugandan leadership. Be A Number provides the systems architecture, funding, and international bridge. The community owns the work.',
              },
              {
                q: 'What if I just want a shirt and don\'t want to sponsor?',
                a: 'Every shirt still carries a number, and that number still belongs to a child. But continuing the sponsorship at $25/month after your first month is completely your choice (no pressure, no guilt, cancel anytime). Some people buy the shirt, meet their child, and can\'t stop. Some wear the shirt and let it start conversations. Both matter.',
              },
              {
                q: 'Can I actually visit?',
                a: 'Yes. We have an international lodge on our campus in Northern Uganda built specifically for sponsor visits and university cohorts. Meeting your child in person is something we actively encourage (not a theoretical perk buried in fine print). Contact us and we\'ll help you plan the trip.',
              },
            ].map(item => (
              <div key={item.q} className="border-b border-[#e8e0d4] pb-6">
                <h3 className="font-semibold text-[#0d0d0d] mb-2">{item.q}</h3>
                <p className="text-[#777] text-sm leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <BANFooter />
      <CartDrawer />
      <CartButton />
    </div>
    </CartProvider>
  );
}
