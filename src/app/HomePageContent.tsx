'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { BANNavigationClient as BANNavigation } from '@/components/BANNavigationClient';
import { BANFooter } from '@/components/BANFooter';
import { Logo } from '@/components/Logo';
import {
  gradeLabelForSponsor,
  isGradeCode,
  type GradeCode,
} from '@/lib/grades';

// ---------------------------------------------------------------------------
// Animated count-up hook — starts as soon as the component mounts on the
// client. The previous version was gated on an IntersectionObserver
// threshold, which left the stats permanently at 0 for users whose
// initial viewport happened to put the stats just below the trigger
// line. The animation is short enough that running unconditionally
// on mount is fine; if the user scrolls down later the numbers are
// already at their final value.
// ---------------------------------------------------------------------------
function useCountUp(end: number, duration = 1800) {
  const [count, setCount] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setCount(Math.round(eased * end));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [end, duration]);

  return { count };
}

interface Child {
  id: string;
  child_id: string;
  first_name: string;
  last_initial?: string;
  display_name?: string;
  age?: number;
  grade_class?: string;
  photo_url?: string;
  fun_fact?: string;
  months_waiting?: number;
  sponsor_count?: number;
  shirt_number_start?: number;
  shirt_number_end?: number;
}

/**
 * Inner content — needs Suspense around it because useSearchParams
 * triggers a CSR bailout in Next 16 unless wrapped.
 */
function HomePageInner() {
  const [searchNumber, setSearchNumber] = useState('');
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Welcome state: user just signed in via magic link, the callback
  // redirected them to /?welcome=1&n=N. We prefill the Number input
  // with their Number, focus it, show a "Welcome back" treatment,
  // and forward just_signed_in=1 when they submit — so the kid
  // page&rsquo;s ClaimGate &ldquo;first sign-in&rdquo; branch still fires.
  const welcomeFlow = searchParams.get('welcome') === '1';
  const welcomePrefill = searchParams.get('n') || '';

  useEffect(() => {
    if (!welcomeFlow) return;
    if (welcomePrefill) setSearchNumber(welcomePrefill);
    // Microtask delay so the input mounts before we try to focus it.
    const id = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(id);
  }, [welcomeFlow, welcomePrefill]);

  // Ref + helper for the children carousel. Kids without profile photos are
  // filtered out — a face is the whole point of the section — and the
  // remaining cards live in a horizontally-snapping scroll container with
  // arrow controls on md+ screens (mobile users swipe natively).
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const scrollCarousel = (direction: 'left' | 'right') => {
    const el = carouselRef.current;
    if (!el) return;
    // Scroll by ~80% of the visible container so the next card snaps cleanly
    // to the leading edge instead of leaving a sliver of the previous card.
    const delta = el.clientWidth * 0.8;
    el.scrollBy({ left: direction === 'right' ? delta : -delta, behavior: 'smooth' });
  };
  // Shuffled client-side after fetch so every visit surfaces different kids.
  const [childrenWithPhotos, setChildrenWithPhotos] = useState<Child[]>([]);

  useEffect(() => {
    fetch('/api/children')
      .then(res => res.json())
      .then(data => {
        const all = (data.children || []) as Child[];
        setChildren(all);
        // Shuffle the subset that have photos (Fisher-Yates)
        const arr = all.filter(c => !!c.photo_url);
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        setChildrenWithPhotos(arr);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const n = searchNumber.trim();
    if (!n) return;
    // Forward just_signed_in=1 when the user is completing the
    // welcome-flow handoff. Lets the kid page&rsquo;s ClaimGate render
    // the &ldquo;you just signed in&rdquo; treatment instead of the
    // returning-visitor treatment.
    const suffix = welcomeFlow ? '?just_signed_in=1' : '';
    router.push(`/children/${n}${suffix}`);
  };

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/" transparent />

      {/* ========== HERO ========== */}
      <section className="relative -mt-[72px] pt-[72px] min-h-[90vh] flex items-center">
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/homepage/hero-community-group.jpg"
            alt="Children in Africa"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0d0d0d]/70 via-[#0d0d0d]/40 to-[#0d0d0d]/80" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-5 py-24 text-center">
          <Logo className="h-36 w-36 sm:h-44 sm:w-44 md:h-52 md:w-52 text-[#FFF8F0] mx-auto mb-10 drop-shadow-xl" />
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-[#FFF8F0] mb-6 leading-tight tracking-tight"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            One shirt. One kid.<br />
            Open the bag to meet them.
          </h1>
          <div className="mb-10" />
          <p className="text-lg md:text-xl text-[#FFF8F0]/80 mb-12 max-w-xl mx-auto leading-snug italic">
            The shirt is how you meet them.<br />
            $25 a month is how you stay.
          </p>

          {/* Welcome chip — appears only when the user has just
              completed the magic-link sign-in. The callback redirects
              to /?welcome=1&n=N and we render this band to make the
              hand-off feel personal: &ldquo;you&rsquo;re signed in, here&rsquo;s your
              Number, hit Find.&rdquo; The chip frames the Number input as
              the gateway ritual instead of a generic search box. */}
          {welcomeFlow && (
            <div className="max-w-md mx-auto mb-5">
              <div className="bg-[#D4A843]/15 border border-[#D4A843]/40 px-4 py-3 text-[#FFF8F0] text-sm text-center">
                <span className="block text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-1">
                  Welcome back
                </span>
                <span className="text-[#FFF8F0]/90">
                  Your Number is loaded. Hit Find to go to your kid.
                </span>
              </div>
            </div>
          )}

          {/* Search box wrapped in a relative shimmer host. A single
              diagonal gold sweep fires ~1.2s after mount so the user
              has time to read the headline before the affordance
              announces itself. One pass, no loop — a marketing hero
              shouldn't feel like a banner ad. Same shimmer language
              we use on the in-page "Sponsoring monthly?" banner, so
              the visual gesture stays consistent across the site. */}
          <form
            onSubmit={handleSearch}
            className="ban-search-shimmer-host flex max-w-md mx-auto shadow-2xl rounded-sm overflow-hidden relative"
          >
            <style>{`
              @keyframes banSearchShimmer {
                0% {
                  transform: translateX(-120%) skewX(-18deg);
                  opacity: 0;
                }
                15% { opacity: 1; }
                85% { opacity: 1; }
                100% {
                  transform: translateX(120%) skewX(-18deg);
                  opacity: 0;
                }
              }
              .ban-search-shimmer-host::after {
                content: '';
                position: absolute;
                top: 0;
                bottom: 0;
                left: 0;
                width: 40%;
                background: linear-gradient(
                  90deg,
                  transparent 0%,
                  rgba(255, 230, 150, 0.0) 20%,
                  rgba(255, 230, 150, 0.85) 50%,
                  rgba(255, 230, 150, 0.0) 80%,
                  transparent 100%
                );
                pointer-events: none;
                animation: banSearchShimmer 1.8s ease-out 1.2s both;
                /* On top of the input + button (which sit at z-10),
                   so the highlight actually paints over their
                   opaque backgrounds. mix-blend-mode: screen
                   lightens whatever's beneath rather than
                   obscuring it, so the input text and Find label
                   stay readable as the sweep passes. */
                mix-blend-mode: screen;
                z-index: 30;
              }
            `}</style>
            <input
              ref={searchInputRef}
              type="text"
              value={searchNumber}
              onChange={e => setSearchNumber(e.target.value)}
              placeholder="Your Shirt Number"
              className="relative z-10 flex-1 px-6 py-4 text-base text-[#0d0d0d] bg-white placeholder-[#999] focus:outline-none"
            />
            <button
              type="submit"
              className="relative z-10 px-8 py-4 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors"
            >
              Find
            </button>
          </form>

          <p className="text-sm text-[#FFF8F0]/40 mt-8">
            {"Don't have a Number yet? "}
            <Link href="/shirts" className="text-[#D4A843]/80 underline underline-offset-2 hover:text-[#D4A843]">
              Get a Shirt
            </Link>
          </p>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          <div className="w-5 h-9 rounded-full border border-[#FFF8F0]/20 flex items-start justify-center p-2">
            <div className="w-0.5 h-2 bg-[#FFF8F0]/30 rounded-full animate-bounce" />
          </div>
        </div>
      </section>

      {/* ========== TRUST BAR ========== */}
      <section className="bg-white border-b border-[#e8e0d4] py-5">
        <div className="max-w-5xl mx-auto px-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-sm text-[#999]">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4A843]" />
            501(c)(3) Registered
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4A843]" />
            $25/month Sponsorship
          </span>
        </div>
      </section>

      {/* ========== THE CHILDREN ========== */}
      <section className="py-24 px-5 bg-[#FFF8F0]">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">The Children</p>
          <h2
            className="text-3xl md:text-4xl text-[#0d0d0d] mb-8 leading-snug"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            They have names and stories.
          </h2>
          <p className="text-[#777] max-w-lg mx-auto leading-relaxed text-lg">
            Every Number on every Shirt belongs to a Child like the ones below. Your Shirt starts their year
            at the campus. Stay with them for $25/month to finish it &mdash; write to your Kid and see their
            handwritten replies, photos of your Kid through the year, a year-end report card, and the monthly
            campus newsletter.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block w-8 h-8 border-2 border-[#D4A843]/20 border-t-[#D4A843] rounded-full animate-spin" />
          </div>
        ) : childrenWithPhotos.length === 0 ? (
          <div className="text-center py-16 bg-white border border-[#e8e0d4] max-w-md mx-auto">
            <p className="text-[#0d0d0d] text-lg mb-2 font-medium">New profiles coming soon.</p>
            <p className="text-[#999] text-sm mb-8 px-6">
              Get a shirt now and we&rsquo;ll introduce you to your child as soon as their profile is ready.
            </p>
            <Link
              href="/shirts"
              className="inline-block px-6 py-3 bg-[#D4A843] text-[#0d0d0d] font-bold text-sm uppercase tracking-wider hover:bg-[#c49a3a] transition-colors"
            >
              Get a Shirt
            </Link>
          </div>
        ) : (
          <div className="relative max-w-6xl mx-auto">
            {/* Arrow controls — desktop only. Mobile users swipe the native scroll. */}
            <button
              type="button"
              onClick={() => scrollCarousel('left')}
              aria-label="Previous children"
              className="hidden md:flex absolute -left-2 lg:-left-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 items-center justify-center bg-white border border-[#e8e0d4] text-[#0d0d0d] hover:border-[#D4A843] hover:text-[#D4A843] transition-colors shadow-sm"
            >
              <span className="text-2xl leading-none" aria-hidden="true">&lsaquo;</span>
            </button>
            <button
              type="button"
              onClick={() => scrollCarousel('right')}
              aria-label="Next children"
              className="hidden md:flex absolute -right-2 lg:-right-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 items-center justify-center bg-white border border-[#e8e0d4] text-[#0d0d0d] hover:border-[#D4A843] hover:text-[#D4A843] transition-colors shadow-sm"
            >
              <span className="text-2xl leading-none" aria-hidden="true">&rsaquo;</span>
            </button>

            {/*
              Horizontal snap-scroll track. The negative horizontal margin on
              mobile lets cards bleed to the screen edge so the first and last
              don't feel boxed-in by the section's padding; on md+ we reset it.
              The scrollbar-hiding utility pair (Firefox + WebKit) keeps the
              visual clean without disabling keyboard scroll.
            */}
            <div
              ref={carouselRef}
              className="flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-6 -mx-5 px-5 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {childrenWithPhotos.map(child => {
                const displayName = child.display_name || child.first_name;
                const photoUrl = child.photo_url as string;
                return (
                  // Passive card — no link. The carousel is social
                  // proof / texture, not a kid-browser. The brand
                  // mechanic (core_model.md §0) is: shirt → reveal
                  // → kid. Letting a visitor click into a specific
                  // kid&rsquo;s bio before they have a shirt turns the
                  // funnel into the conventional pick-a-kid model
                  // BAN deliberately isn&rsquo;t. The single CTA below
                  // routes everyone to /shirts.
                  <div
                    key={child.id || child.child_id}
                    className="snap-start shrink-0 w-[280px] sm:w-[320px] bg-white overflow-hidden border border-[#e8e0d4]"
                  >
                    <div className="aspect-[4/5] bg-[#f5f0e8] overflow-hidden relative">
                      <img
                        src={photoUrl}
                        alt={displayName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-5">
                      <h3
                        className="text-xl text-[#0d0d0d] mb-1"
                        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                      >
                        {displayName}
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-[#999]">
                        {child.age && <span>Age {child.age}</span>}
                        {child.age && child.grade_class && <span className="text-[#ccc]">&middot;</span>}
                        {child.grade_class && (
                          <span>
                            {isGradeCode(child.grade_class)
                              ? gradeLabelForSponsor(child.grade_class as GradeCode)
                              : child.grade_class /* legacy fallback */}
                          </span>
                        )}
                      </div>
                      {child.fun_fact && (
                        <p className="text-sm text-[#777] italic mt-3 line-clamp-2">
                          &ldquo;{child.fun_fact}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Single funnel CTA below the carousel — replaces the
                per-card &ldquo;Meet them&rdquo; links so the only path to a
                specific kid&rsquo;s page is buying a shirt. */}
            <div className="mt-10 md:mt-12 text-center">
              <p className="text-base md:text-lg text-[#444] max-w-2xl mx-auto leading-relaxed">
                These are real children at a small school in Northern Uganda.{' '}
                <Link
                  href="/shirts"
                  className="text-[#D4A843] font-bold hover:underline whitespace-nowrap"
                >
                  Get a shirt to meet one of them &rarr;
                </Link>
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="py-24 px-5 bg-white border-t border-[#e8e0d4]">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6 text-center">How It Works</p>
          <h2
            className="text-3xl md:text-4xl text-[#0d0d0d] mb-20 text-center"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            It starts with a shirt.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
            <div className="text-center">
              <div className="w-14 h-14 bg-[#D4A843]/10 border border-[#D4A843]/20 flex items-center justify-center mx-auto mb-6">
                <span className="text-[#D4A843] font-bold text-lg" style={{ fontFamily: 'var(--font-lora), serif' }}>I</span>
              </div>
              <h3 className="text-lg font-semibold text-[#0d0d0d] mb-3">Get a Shirt</h3>
              <p className="text-[#777] text-sm leading-relaxed">
                Every Shirt has a Number, and every Number belongs to a Child. $25 gets you the Shirt and starts their year at the campus. Your Number is assigned when you order.
              </p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 bg-[#D4A843]/10 border border-[#D4A843]/20 flex items-center justify-center mx-auto mb-6">
                <span className="text-[#D4A843] font-bold text-lg" style={{ fontFamily: 'var(--font-lora), serif' }}>II</span>
              </div>
              <h3 className="text-lg font-semibold text-[#0d0d0d] mb-3">Meet Them</h3>
              <p className="text-[#777] text-sm leading-relaxed">
                Come back here and enter your Number. You&rsquo;ll see their face, learn their name, and read about who they are and what they dream about.
              </p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 bg-[#D4A843]/10 border border-[#D4A843]/20 flex items-center justify-center mx-auto mb-6">
                <span className="text-[#D4A843] font-bold text-lg" style={{ fontFamily: 'var(--font-lora), serif' }}>III</span>
              </div>
              <h3 className="text-lg font-semibold text-[#0d0d0d] mb-3">Stay With Them</h3>
              <p className="text-[#777] text-sm leading-relaxed">
                For $25/month you stay connected. Write to your Kid and see their handwritten replies, photos of your child through the year, a year-end report card, and the monthly campus newsletter.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========== QUOTE BREAK ========== */}
      <section className="py-20 px-5 bg-[#FFF8F0] border-t border-[#e8e0d4]">
        <div className="max-w-3xl mx-auto text-center">
          <Logo variant="cross" className="h-10 w-10 text-[#D4A843] mx-auto mb-8" />
          <blockquote
            className="text-xl md:text-2xl text-[#0d0d0d]/70 leading-relaxed"
            style={{ fontFamily: 'var(--font-lora), serif', fontStyle: 'italic' }}
          >
            &ldquo;You have not lived today until you have done something for someone who can never repay you.&rdquo;
          </blockquote>
          <p className="text-xs text-[#999] uppercase tracking-[0.3em] mt-4">St. John Bosco, Italian priest &amp; educator</p>
        </div>
      </section>

      {/* ========== IMPACT / CAMPUS ========== */}
      <section className="py-24 px-5 bg-white border-t border-[#e8e0d4]">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6 text-center">Where Your Money Goes</p>
          <h2
            className="text-3xl md:text-4xl text-[#0d0d0d] mb-4 text-center"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            A place they can call home.
          </h2>
          <p className="text-[#999] text-center mb-16 max-w-lg mx-auto">
            Six acres in Africa. A school, a medical center, vocational training,
            and 30 people from the community employed to run it. Your $25 keeps it going.
          </p>

          <StatsGrid />

          <div className="text-center mt-10">
            <Link
              href="/impact"
              className="inline-flex items-center gap-2 text-[#D4A843] font-medium text-sm hover:underline underline-offset-4 uppercase tracking-wider"
            >
              Full impact report
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ========== FINAL CTA ========== */}
      <section className="relative py-28 px-5 overflow-hidden">
        <div className="absolute inset-0 bg-[#0d0d0d]" />
        <div className="absolute inset-0 opacity-10">
          <Image
            src="/images/homepage/hero-community-group.jpg"
            alt=""
            fill
            className="object-cover"
          />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <div className="w-8 h-px bg-[#D4A843] mx-auto mb-10" />
          <h2
            className="text-2xl md:text-3xl text-[#FFF8F0] mb-6 leading-snug"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Someone is waiting for you.
          </h2>
          <p className="text-[#999] mb-12 max-w-md mx-auto leading-relaxed">
            A child in Africa with a name, a classroom, and a story that&rsquo;s just getting started. Your shirt is how you meet them.
          </p>

          <div className="flex justify-center">
            <Link
              href="/shirts"
              className="px-8 py-4 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors"
            >
              Get a Shirt
            </Link>
          </div>
        </div>
      </section>

      <BANFooter />
    </div>
  );
}

/**
 * Public export. Wraps the inner component in Suspense so
 * useSearchParams (read inside HomePageInner for the welcome-flow
 * handoff) doesn&rsquo;t bail out of static rendering on the rest of
 * the tree. Fallback is null because the page&rsquo;s above-the-fold
 * hero is server-irrelevant content; the Suspense boundary just
 * exists to satisfy Next 16&rsquo;s search-params rules.
 */
export function HomePageContent() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Stats grid with animated count-up on scroll
// ---------------------------------------------------------------------------
function AnimatedStat({ end, suffix, label }: { end: number; suffix?: string; label: string }) {
  const { count } = useCountUp(end);
  return (
    <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-6 text-center">
      <div
        className="text-3xl md:text-4xl text-[#D4A843] mb-1 tabular-nums"
        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
      >
        {count.toLocaleString()}{suffix || ''}
      </div>
      <div className="text-xs text-[#999] uppercase tracking-wider">{label}</div>
    </div>
  );
}

function StatsGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <AnimatedStat end={380} label="Students" />
      <AnimatedStat end={700} suffix="+" label="Patients Served" />
      <AnimatedStat end={68} label="Adults Trained" />
      <AnimatedStat end={30} label="Local Jobs" />
    </div>
  );
}
