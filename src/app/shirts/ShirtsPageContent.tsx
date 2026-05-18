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
 * Globe mark used as a CSS mask so the SVG shape is rendered in the
 * shirt's ink color (white on Onyx, black on the pastels). The SVG
 * itself sits in `/public/shirt-designs/globe.svg` and uses fills
 * we don't actually render — the browser only cares about its
 * alpha channel for masking.
 */
function GlobeMark({ color, className = '' }: { color: string; className?: string }) {
  const maskStyle: React.CSSProperties = {
    backgroundColor: color,
    width: '100%',
    aspectRatio: '1 / 1',
    WebkitMaskImage: 'url(/shirt-designs/globe.svg)',
    maskImage: 'url(/shirt-designs/globe.svg)',
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
  // Sized to match the production print: ~38–42% of chest area, upper-center.
  const top = mode === 'tee' ? '24%' : '17%';
  const width = mode === 'tee' ? '32%' : '46%';

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
  const top = mode === 'tee' ? '20%' : '14%';
  const width = mode === 'tee' ? '30%' : '46%';

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
  "A heavyweight cotton tee, screen-printed by hand. Every shirt gets a unique number, pressed on after you order. Each is one of a kind. That number is matched to a specific child at our campus in Northern Uganda. Type it into beanumber.org and you'll meet them.";

const SHARED_SPECS = 'S – 2XL · Unisex · Heavyweight cotton';

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

const SIZES = ['S', 'M', 'L', 'XL', '2XL'];

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

            {/* Memo §1: active-choice pattern. Two side-by-side buttons of
                deliberately unequal visual weight. Primary path is "Shirt +
                Stay" (filled, larger). Secondary is shirt-only (outlined,
                smaller). Replaces the opt-in toggle + single CTA, which
                implied continuation in its unchecked default state without
                naming it. The explainer block above the buttons keeps the
                "what does staying actually mean" context that the old card
                was carrying — but as visible context, not a toggle. */}
            <div className="mb-4 p-4 sm:p-5 border border-[#e8e0d4] bg-[#FFF8F0]">
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
              <p className="text-sm text-[#555] leading-snug">
                The shirt is how you meet them. $25 a month is how you stay &mdash;
                letters, photos, report cards, report from the ground.
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
              Cancel anytime from your sponsor portal. Continuing is your choice.
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
  // Shuffle order so every visitor sees a different arrangement — keeps any
  // one colorway from being permanently buried at the bottom of the page.
  const [shirts] = useState(() => shuffle(SHIRTS_SOURCE));

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
            Heavyweight blanks in four colors. Screen-printed, handmade to order.
            Each one carries a different child&apos;s number.
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
              How the number works
            </h2>
            <p className="text-[#777] leading-relaxed max-w-lg mx-auto">
              Every shirt carries a unique number connected to a real child in Northern Uganda.
              $25 starts their year at the YDO campus &mdash; school, meals, medical care.
              When the shirt arrives, come here, enter your number, and meet them.
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
                q: 'What actually happens when I buy a shirt?',
                a: 'Your order number becomes your shirt number, and that number belongs to a real child enrolled in our program in Northern Uganda. When your shirt arrives, you\'ll come back to the site, enter your number, and meet them: their name, their face, their story. $25 starts their year at the YDO campus \u2014 school, meals, medical care. $25/month finishes it and keeps you in their story all year: a monthly campus newsletter, photos of your matched child through the year, a handwritten letter from them, and a year-end report card.',
              },
              {
                q: 'Where does the $25 actually go?',
                a: 'Your $25/month supports the YDO campus where your matched child goes to school, eats two meals a day, and gets medical care through the on-site clinic. The campus runs on the combined support of every sponsor — that\'s what also keeps the 60 women in vocational training, the medical outreach that has served 700+ patients, and the construction apprenticeships going. You\'re not paying line items on one child\'s bill. You\'re supporting the ecosystem that keeps them in school.',
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
