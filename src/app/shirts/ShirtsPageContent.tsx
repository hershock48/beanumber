'use client';

import { useState, useEffect } from 'react';

import { BANNavigationClient as BANNavigation } from '@/components/BANNavigationClient';
import { BANFooter } from '@/components/BANFooter';
import { Logo } from '@/components/Logo';
import { CartProvider, useCart } from '@/components/CartContext';
import { CartDrawer, CartButton } from '@/components/CartDrawer';

/* ── Color palette + per-color theme ────────────────────────── */

// Each shirt design is available in the same palette. Ordered neutrals first
// (most common) then accent tones for visual rhythm on the selector.
// 2026 lineup: four colorways, each its own product. Same design across all.
const COLORS = ['Onyx', 'Meadow', 'Blossom', 'Sky'] as const;
type ColorName = (typeof COLORS)[number];

type ShirtTheme = {
  /** Body color of the shirt as rendered in the mockup. */
  shirt: string;
  /** Swatch color (matches body for solid colorways). */
  swatch: string;
  /** Print ink color — auto-contrasted: white on Onyx, black on the pastels. */
  vinyl: string;
  /** Muted foreground for any secondary marks. */
  muted: string;
  /** Preview-card background — warm cream so pastels don't blend into white. */
  cardBg: string;
  /** Subtle card border. */
  cardBorder: string;
};

// Per-shirt themes. `vinyl` is named for backwards compatibility with the
// HTV-era code that wrote ink color to Airtable's Vinyl Front/Back fields;
// production is now screen-printed but the semantics are identical.
const THEMES: Record<ColorName, ShirtTheme> = {
  Onyx:    { shirt: '#1a1a1a', swatch: '#1a1a1a', vinyl: '#ffffff', muted: 'rgba(255,255,255,0.3)', cardBg: '#fffdf8', cardBorder: '#e8e0d4' },
  Meadow:  { shirt: '#c8dfc5', swatch: '#c8dfc5', vinyl: '#1a1a1a', muted: 'rgba(0,0,0,0.35)',   cardBg: '#fffdf8', cardBorder: '#e8e0d4' },
  Blossom: { shirt: '#f3cfd4', swatch: '#f3cfd4', vinyl: '#1a1a1a', muted: 'rgba(0,0,0,0.35)',   cardBg: '#fffdf8', cardBorder: '#e8e0d4' },
  Sky:     { shirt: '#bdd5e5', swatch: '#bdd5e5', vinyl: '#1a1a1a', muted: 'rgba(0,0,0,0.35)',   cardBg: '#fffdf8', cardBorder: '#e8e0d4' },
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
 * SVG outline of a crew-neck tee. Path geometry lifted from the 2026
 * production mockup (340×400 canvas) so the silhouette on /shirts
 * matches what Kevin's been showing partners in the mockup HTML —
 * realistic shoulders, curved sleeves, proportioned body. Children
 * are placed in absolute % coords that map onto the body region.
 */
function TeeOutline({ theme, side }: { theme: ShirtTheme; side: 'front' | 'back' }) {
  // Production body path — same shape on both sides; only the neckline
  // depth differs (front shows a wider crew opening, back is a smaller
  // dip).
  const bodyPath = `
M 135 42
C 150 34 190 34 205 42
C 224 47 248 55 268 64
C 286 72 302 78 312 84
C 318 88 320 96 316 104
C 311 116 304 130 295 142
C 289 150 280 152 272 148
C 269 165 268 200 268 365
C 250 372 90 372 72 365
C 72 200 71 165 68 148
C 60 152 51 150 45 142
C 36 130 29 116 24 104
C 20 96 22 88 28 84
C 38 78 54 72 72 64
C 92 55 116 47 135 42 Z`;
  const neckPath = side === 'front'
    ? 'M 138 44 C 152 36 188 36 202 44 C 210 50 210 64 200 70 C 184 73 156 73 140 70 C 130 64 130 50 138 44 Z'
    : 'M 140 46 C 154 40 186 40 200 46 C 208 50 208 58 200 62 C 184 65 156 65 140 62 C 132 58 132 50 140 46 Z';

  return (
    <svg
      viewBox="0 0 340 400"
      className="absolute inset-0 w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.08))' }}
      aria-hidden
    >
      {/* Soft ground shadow under the shirt — sells the floating-on-table feel. */}
      <ellipse cx="170" cy="380" rx="130" ry="6" fill="rgba(0,0,0,0.06)" />
      {/* Body */}
      <path d={bodyPath} fill={theme.shirt} />
      {/* Neckline opening — translucent darker than body so it reads as
          the inside of the collar on any colorway. */}
      <path d={neckPath} fill="rgba(0,0,0,0.18)" />
      {/* Sleeve cuff suggestion (left + right). */}
      <path d="M 45 138 C 55 144 65 146 70 144" stroke="rgba(0,0,0,0.25)" strokeWidth={1.2} fill="none" />
      <path d="M 295 138 C 285 144 275 146 270 144" stroke="rgba(0,0,0,0.25)" strokeWidth={1.2} fill="none" />
      {/* Outline */}
      <path d={bodyPath} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={1} />
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
 * Globe mark — halftone-dotted Africa-centered globe rendered as a CSS
 * mask so the dot pattern picks up the shirt's ink color (white on Onyx,
 * black on the pastels). Source is the halftone PNG that matches the
 * production screen-print look — solid vector silhouettes were too clean
 * and didn't read as a print. The PNG's alpha channel IS the dot pattern;
 * mask-image clips backgroundColor to those dots.
 */
function GlobeMark({ color, className = '' }: { color: string; className?: string }) {
  const maskStyle: React.CSSProperties = {
    backgroundColor: color,
    width: '100%',
    aspectRatio: '1 / 1',
    WebkitMaskImage: 'url(/shirt-designs/globe-halftone.png)',
    maskImage: 'url(/shirt-designs/globe-halftone.png)',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  };
  return <div className={className} style={maskStyle} aria-label="Be A Number globe" />;
}

/**
 * Back mark — CHANGE THE WORLD + hashtag logo + ORDER # + sample number.
 * Sourced from `/public/shirt-designs/back.svg` and recolored via CSS
 * mask just like the globe. The "0421" in the SVG is a SAMPLE; the real
 * number is heat-pressed per shirt after the order is placed.
 */
function BackMark({ color, className = '' }: { color: string; className?: string }) {
  const maskStyle: React.CSSProperties = {
    backgroundColor: color,
    width: '100%',
    // The back-design SVG is 792 × 936 → aspect-ratio matches.
    aspectRatio: '792 / 936',
    WebkitMaskImage: 'url(/shirt-designs/back.svg)',
    maskImage: 'url(/shirt-designs/back.svg)',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  };
  return <div className={className} style={maskStyle} aria-label="Be A Number — Change The World" />;
}

/**
 * Front design — the heritage Africa-centered globe, centered on the chest.
 * Bigger than the previous # / cross marks because the globe IS the design,
 * not a chest tag above another print.
 */
function GlobeFront({ theme, mode = 'tee', className = '' }: DesignProps) {
  // Sized to match the production print mockup (220/340 of canvas width,
  // 74/400 of canvas height in the reference HTML). The globe is the
  // dominant chest mark, not a small tag above another design.
  const top = mode === 'tee' ? '19%' : '14%';
  const width = mode === 'tee' ? '65%' : '75%';

  return (
    <DesignContainer theme={theme} mode={mode} side="front" className={className}>
      <div
        className="absolute left-1/2"
        style={{ top, width, transform: 'translateX(-50%)' }}
      >
        <GlobeMark color={theme.vinyl} />
      </div>
    </DesignContainer>
  );
}

/**
 * Back design — CHANGE THE WORLD over the hashtag logo over ORDER # over
 * the unique number. Sized to sit in the upper-back yoke area like a
 * conventional screen print.
 */
function NumberBack({ theme, mode = 'tee', className = '' }: DesignProps) {
  // Sized to match the production back-print mockup (174/340 of canvas
  // width, 78/400 of canvas height in the reference HTML). The back
  // composition is wider than tall, so the back mark gets a different
  // width treatment than the front globe.
  const top = mode === 'tee' ? '20%' : '14%';
  const width = mode === 'tee' ? '51%' : '62%';

  return (
    <DesignContainer theme={theme} mode={mode} side="back" className={className}>
      <div
        className="absolute left-1/2"
        style={{ top, width, transform: 'translateX(-50%)' }}
      >
        <BackMark color={theme.vinyl} />
      </div>
    </DesignContainer>
  );
}



/* ── Shirt data ─────────────────────────────────────────────── */

type Shirt = {
  /** URL slug + checkout key. Lowercase colorway name. */
  id: string;
  /** Display name — the colorway. */
  name: string;
  /** The fixed colorway for this product. */
  color: ColorName;
  price: number;
  description: string;
  Front: React.ComponentType<DesignProps>;
  Back: React.ComponentType<DesignProps>;
  badge: string | null;
  specs: string;
};

// 2026 lineup: one design, four colorways, each its own product card.
// Shared description across all four — the shirt is the same; the color
// is the only thing that varies. Names do the differentiation; copy stays
// honest about the product being one shirt.
const SHARED_DESCRIPTION =
  "A heavyweight cotton tee, screen-printed by hand. Every shirt gets a unique number, pressed on after you order. Each is one of a kind. That number belongs to a specific child at our campus in Northern Uganda. Type it into beanumber.org and you'll meet them.";

const SHARED_SPECS = 'Youth S – Adult 2XL · Unisex · Heavyweight cotton';

const SHIRTS_SOURCE: Shirt[] = [
  {
    id: 'onyx',
    name: 'Onyx',
    color: 'Onyx',
    price: 25,
    description: SHARED_DESCRIPTION,
    Front: GlobeFront,
    Back: NumberBack,
    badge: null,
    specs: SHARED_SPECS,
  },
  {
    id: 'meadow',
    name: 'Meadow',
    color: 'Meadow',
    price: 25,
    description: SHARED_DESCRIPTION,
    Front: GlobeFront,
    Back: NumberBack,
    badge: null,
    specs: SHARED_SPECS,
  },
  {
    id: 'blossom',
    name: 'Blossom',
    color: 'Blossom',
    price: 25,
    description: SHARED_DESCRIPTION,
    Front: GlobeFront,
    Back: NumberBack,
    badge: null,
    specs: SHARED_SPECS,
  },
  {
    id: 'sky',
    name: 'Sky',
    color: 'Sky',
    price: 25,
    description: SHARED_DESCRIPTION,
    Front: GlobeFront,
    Back: NumberBack,
    badge: null,
    specs: SHARED_SPECS,
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

/* ── Per-shirt card ─────────────────────────────────────────── */

// Adult run (Bella+Canvas 3001 base). Standard S–2XL.
const ADULT_SIZES = ['S', 'M', 'L', 'XL', '2XL'] as const;

// Youth run, added July 2026 for kid-sized shirts. Stored as literal
// "Youth S" / "Youth M" / "Youth L" strings end-to-end (Zod validators
// on every checkout route accept the same values) so email
// confirmations, packing slips, and admin surfaces just render them
// without any translation layer. Button labels use short "YS/YM/YL"
// for space; the *value* passed on submit is the full string.
const YOUTH_SIZES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Youth S', label: 'YS' },
  { value: 'Youth M', label: 'YM' },
  { value: 'Youth L', label: 'YL' },
  { value: 'Youth XL', label: 'YXL' },
];

/**
 * Single preview slot — design on a tee silhouette, no hover-zoom toggle.
 *
 * The earlier toggle cross-faded between a tee view and a "flat" view on
 * hover/tap. With the halftone print already visible at tee size, the
 * flat-mode "zoom" was doing more harm than good — the design jumped
 * position and the silhouette disappeared into a rectangular swatch,
 * which read as broken rather than informative. Single static view now;
 * the print detail is already on the shirt.
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
  return (
    <div
      className="p-2 sm:p-4 flex flex-col items-center border transition-colors duration-300"
      style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
    >
      <div className="relative w-full select-none">
        <Design theme={theme} mode="tee" className="w-full rounded-sm transition-colors duration-300" />
      </div>
      <p className="text-xs text-[#999] mt-3 font-bold uppercase tracking-wider">{label}</p>
    </div>
  );
}

function ShirtCard({ shirt, reversed }: { shirt: Shirt; reversed: boolean }) {
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const { addItem } = useCart();

  // Each card IS one colorway — no picker. Theme is fixed per shirt.
  const previewTheme = THEMES[shirt.color];
  const Front = shirt.Front;
  const Back = shirt.Back;

  // Memo §1: active-choice two-button pattern. Caller passes intent
  // explicitly so we don't rely on stale React state between click
  // and dispatch.
  function handleAddToCart(continueMonthly: boolean) {
    if (!selectedSize) {
      setError('Please select a size.');
      return;
    }

    setError(null);
    addItem({
      shirtId: shirt.id,
      shirtName: shirt.name,
      color: shirt.color,
      size: selectedSize,
      continueMonthly,
      price: shirt.price,
    });

    // Flash confirmation, then reset for another add
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  }

  return (
    <div className="scroll-mt-24" id={shirt.id}>
      <div className={`flex flex-col ${reversed ? 'md:flex-row-reverse' : 'md:flex-row'} gap-6 md:gap-14 items-center`}>
        {/* Title block — visible on mobile ABOVE the mockups so the buyer
            knows what they're looking at before scrolling past the image.
            Hidden on desktop where the side-by-side layout makes it redundant. */}
        <div className="md:hidden w-full">
          <h2
            className="text-3xl text-[#0d0d0d] mb-0"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {shirt.name}
          </h2>
        </div>

        {/* Mockup previews */}
        <div className="flex-1 w-full">
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <PreviewMockup Design={Front} theme={previewTheme} label="Front" />
            <PreviewMockup Design={Back} theme={previewTheme} label="Back" />
          </div>
          {/* Back-print detail: mini mockup of the order-number stamp that
              gets heat-pressed on the back below the main design. */}
          <div className="mt-3 sm:mt-5 bg-white border border-dashed border-[#e8e0d4] px-3 sm:px-5 py-3 sm:py-4 flex items-center gap-3 sm:gap-5">
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
                Pressed on the back, below the main design.
              </p>
              <p className="text-[#999]">
                Sample shown &mdash; every shirt ships with a unique
                number on the back. You meet the child when it arrives.
              </p>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 w-full">
          {/* Desktop title — hidden on mobile where it appears above the mockups */}
          <div className="hidden md:block">
            <h2
              className="text-3xl md:text-4xl text-[#0d0d0d] mb-1"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {shirt.name}
            </h2>
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

            {/* Color is fixed per shirt — no picker. Show the colorway label
                so the user is clear what they're buying. */}
            <div className="flex items-baseline justify-between mb-5">
              <p className="text-xs text-[#999] uppercase tracking-wider font-bold">Color</p>
              <p className="text-xs text-[#666]">{shirt.color}</p>
            </div>

            {/* Size selector — Adult row + Youth row.
                Rendered as two separate labeled groups so a parent
                buying for a kid can see the youth options clearly and
                a bigger buyer isn't accidentally scanning past them. */}
            <p className="text-xs text-[#999] uppercase tracking-wider font-bold mb-2">Size</p>

            {/* Adult sizes */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-[#aaa] uppercase tracking-[0.12em] font-semibold w-10 shrink-0">Adult</span>
              <div className="flex gap-2 flex-wrap">
                {ADULT_SIZES.map((size) => (
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
            </div>

            {/* Youth sizes */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] text-[#aaa] uppercase tracking-[0.12em] font-semibold w-10 shrink-0">Youth</span>
              <div className="flex gap-2 flex-wrap">
                {YOUTH_SIZES.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => { setSelectedSize(value); setError(null); }}
                    className={`w-12 h-10 text-sm font-semibold border transition-all cursor-pointer ${
                      selectedSize === value
                        ? 'bg-[#0d0d0d] text-white border-[#0d0d0d]'
                        : 'bg-white text-[#555] border-[#e8e0d4] hover:border-[#999]'
                    }`}
                    aria-label={value}
                    title={value}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 mb-3">{error}</p>
            )}

            {/* Memo §1: active-choice pattern. Two side-by-side buttons of
                deliberately unequal visual weight. Primary path is "Shirt +
                Stay" (filled, larger) — this is the highest-converting
                sponsor acquisition path BAN has. Secondary is shirt-only
                (outlined, smaller). The "Stay in their life" explainer
                names what staying actually means so the choice isn't
                opaque. Under the May 2026 stockpile model the subscription
                activates immediately at checkout but the Sponsorship
                record + sponsor code are issued after the shirt ships and
                Kevin records which number went out. */}
            <div className="mb-4 p-4 sm:p-5 border border-[#e8e0d4] bg-[#FFF8F0]">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <p
                  className="text-base text-[#0d0d0d]"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  Become their penpal.
                </p>
                <p className="text-xs font-bold uppercase tracking-wider text-[#D4A843] whitespace-nowrap">
                  +$25/mo
                </p>
              </div>
              <p className="text-sm text-[#555] leading-snug">
                The shirt is how you meet them. Monthly sponsorship is how you
                stay: you get a penpal, monthly photos, report cards, and
                campus updates. $25/month.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-3">
              {/* Primary: Shirt + monthly sponsorship from day one. */}
              <button
                onClick={() => handleAddToCart(true)}
                aria-label="Add shirt and start monthly sponsorship"
                className={`flex-1 sm:flex-[2] px-5 py-4 font-bold uppercase tracking-wider transition-colors inline-flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                  justAdded
                    ? 'bg-[#2a7a2a] text-white'
                    : 'bg-[#D4A843] text-[#0d0d0d] hover:bg-[#c49a3a]'
                }`}
              >
                {justAdded ? (
                  <span className="text-sm flex items-center gap-2">
                    Added!
                    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-white">
                      <path d="M5 10l3.5 3.5L15 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : (
                  <>
                    <span className="text-sm">Shirt + Stay</span>
                    <span className="text-[11px] font-semibold normal-case tracking-normal opacity-80">$25 today, then $25/mo</span>
                  </>
                )}
              </button>

              {/* Secondary: shirt only, one-time. */}
              <button
                onClick={() => handleAddToCart(false)}
                aria-label="Add shirt only, one-time purchase"
                className={`flex-1 px-5 py-4 font-bold uppercase tracking-wider transition-colors inline-flex flex-col items-center justify-center gap-0.5 cursor-pointer border ${
                  justAdded
                    ? 'bg-[#2a7a2a] text-white border-[#2a7a2a]'
                    : 'bg-white text-[#0d0d0d] border-[#0d0d0d] hover:bg-[#FFF8F0]'
                }`}
              >
                {justAdded ? (
                  <span className="text-sm flex items-center gap-2">
                    Added!
                    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-white">
                      <path d="M5 10l3.5 3.5L15 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : (
                  <>
                    <span className="text-sm">Shirt only</span>
                    <span className="text-[11px] font-semibold normal-case tracking-normal opacity-70">$25 once</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-[#bbb]">
              Cancel anytime. Continuing is your choice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page content ────────────────────────────────────────────── */

/** Captures ?ref= from the URL and stores it in CartContext for checkout.
 *
 * Reads window.location in an effect instead of useSearchParams():
 * the hook forces a CSR bailout during SSR in Next 16, and through
 * the page's null Suspense fallback it was shipping /shirts — the
 * primary conversion surface — as completely blank HTML until the
 * JS bundle loaded. A mount-time read is exactly equivalent for a
 * capture-once param. */
function RefCapture() {
  const { setRefCode } = useCart();
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) setRefCode(ref);
  }, [setRefCode]);
  return null;
}

/**
 * Captures ?code= from the URL on mount and stores it in CartContext.
 * Powers the magic-URL flow — e.g. someone tapping a FB-comment
 * reply link like /shirts?code=WIN10 gets the discount applied
 * before they pick a shirt. The actual validation + applicability
 * check runs inside the cart context against the current cart shape.
 */
function PromoCapture() {
  const { setPromoCode } = useCart();
  useEffect(() => {
    // window.location read — same SSR-bailout avoidance as RefCapture.
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) setPromoCode(code);
  }, [setPromoCode]);
  return null;
}

/**
 * Banner at the top of the shirts page when a promo code is set
 * &mdash; whether or not it currently applies to the cart shape.
 * Applicable: gold pill with the code, label, and expiry. Not
 * applicable: same shape but with the reason the cart shape rejects
 * it. Hidden when no code is set at all.
 */
function PromoPill() {
  const { promo, setPromoCode } = useCart();
  if (!promo) return null;
  if (promo.applicable) {
    return (
      <div className="bg-[#D4A843] text-[#0d0d0d] px-5 py-3 text-sm font-semibold">
        <div className="max-w-3xl mx-auto flex items-center justify-center gap-3 flex-wrap">
          <span>
            <span className="uppercase tracking-wider text-xs font-bold mr-2">
              {promo.code.code}
            </span>
            {promo.code.label} applied &middot; {promo.code.expiresLabel}
          </span>
          <button
            type="button"
            onClick={() => setPromoCode(null)}
            aria-label="Remove promo code"
            className="text-[#0d0d0d]/60 hover:text-[#0d0d0d] text-xs underline shrink-0"
          >
            Remove
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-[#fff4e0] border-y border-[#D4A843]/30 text-[#0d0d0d] px-5 py-3 text-sm">
      <div className="max-w-3xl mx-auto flex items-start sm:items-center justify-center gap-3 flex-wrap">
        <span className="text-center sm:text-left">
          <span className="uppercase tracking-wider text-xs font-bold text-[#D4A843] mr-2">
            {promo.rawCode}
          </span>
          <span className="text-[#555]">{promo.reason}</span>
        </span>
        <button
          type="button"
          onClick={() => setPromoCode(null)}
          aria-label="Remove promo code"
          className="text-[#888] hover:text-[#0d0d0d] text-xs underline shrink-0"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export default function ShirtsPageContent() {
  // Shuffle order so every visitor sees a different arrangement — keeps any
  // one colorway from being permanently buried at the bottom of the page.
  const [shirts] = useState(() => shuffle(SHIRTS_SOURCE));

  return (
    <CartProvider>
    <RefCapture />
    <PromoCapture />
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/shirts" />
      <PromoPill />

      {/* Hero */}
      <section className="py-12 md:py-28 px-5">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">The Collection</p>
          <h1
            className="text-4xl md:text-5xl lg:text-6xl text-[#0d0d0d] mb-6 leading-tight"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Pick a Color.<br />
            Get a Number.<br />
            Meet a Kid.
          </h1>
          <p
            className="text-xl text-[#0d0d0d] mt-2 mb-6 italic max-w-xl mx-auto leading-snug"
            style={{ fontFamily: 'var(--font-lora), serif' }}
          >
            The shirt is how you meet them. $25 a month is how you stay.
          </p>
          <p className="text-lg text-[#777] max-w-xl mx-auto leading-relaxed">
            Heavyweight cotton, screen-printed, handmade to order. Every
            Shirt ships with a unique Number pressed on the back &mdash;
            and that Number belongs to a real Kid at the campus
            in Northern Uganda.
          </p>
        </div>
      </section>

      {/* Shirt Grid */}
      <section className="px-5 pb-24">
        <div className="max-w-6xl mx-auto space-y-16 md:space-y-28">
          {shirts.map((shirt, i) => (
            <ShirtCard key={shirt.id} shirt={shirt} reversed={i % 2 !== 0} />
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
              How the Number works
            </h2>
            <p className="text-[#777] leading-relaxed max-w-lg mx-auto">
              Every Shirt carries a unique Number connected to a real Child in Northern Uganda.
              $25 starts their year at the campus &mdash; school, meals, medical care.
              When the Shirt arrives, come here, enter your Number, and meet them.
              $25/month finishes their year and keeps you in their story.
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
                q: 'What actually happens when I buy a Shirt?',
                a: "You pick your color and size, and we ship you a hand-printed Shirt with a unique Number pressed on the back. That Number belongs to a real Child enrolled in our program in Northern Uganda. When the Shirt arrives, you flip it over, read your Number off the back, come back to the site, enter it, and meet them: their name, their face, their story. $25 supports school, meals, and medical care at the campus. $25/month makes it real: you get a penpal, monthly photos, report cards, and campus updates.",
              },
              {
                q: 'Where does the $25 actually go?',
                a: 'Your $25/month supports the campus where your kid goes to school, eats two meals a day, and gets medical care through the on-site clinic. The campus runs on the combined support of every sponsor — that\'s what also keeps the 60 women in vocational training, the medical outreach that has served 700+ patients, and the construction apprenticeships going. You\'re not paying line items on one child\'s bill. You\'re supporting the ecosystem that keeps them in school.',
              },
              {
                q: 'Can I pick my Number?',
                a: 'No. And that\'s by design. Numbers are assigned in order so every Child gets a sponsor, not just the ones with the best photos. The whole idea of Be A Number is turning something impersonal (being reduced to a number) into something deeply personal. Your Number isn\'t random. It\'s someone\'s name waiting to be learned.',
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
