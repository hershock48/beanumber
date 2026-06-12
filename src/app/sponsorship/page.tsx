'use client';

/**
 * /sponsorship — the campus exploration page.
 *
 * This page does NOT take payment. Per the core model: the brand
 * mechanic is shirt → number → kid. Sponsorships funnel through the
 * Number pages (or through /meet/[childId] when someone discovers a
 * kid here and wants to start a relationship with that specific kid
 * without a shirt). The picker that used to live here has been
 * removed — it created a "skip the shirt, pick a child" flow that
 * conflicted with both the brand voice and §0b of core_model.md
 * ("we do not match buyers to children").
 *
 * What this page is now:
 *   1. A way for visitors to MEET the campus before they commit.
 *   2. A way for people who already have a Shirt to read the stories
 *      of the kids they might be connected to.
 *   3. A way for sponsors who want to add a second relationship
 *      (Mary's flow) to discover other kids and click through to
 *      /meet/[id] where the sponsor button lives.
 *
 * Cards link to /meet/[recordId]. Sponsorship CTAs live on /[N]
 * pages (for owners of that Number) and on /meet/[id] (for visitors
 * who want to add a relationship to a specific named kid). This page
 * is the discovery surface — not the checkout.
 */

import { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { BANNavigationClient as BANNavigation } from '@/components/BANNavigationClient';
import { BANFooter } from '@/components/BANFooter';

/**
 * Mount-time count-up. Runs on hydration regardless of scroll
 * position so the number actually animates.
 */
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
      const eased = 1 - (1 - progress) * (1 - progress);
      setCount(Math.round(eased * end));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [end, duration]);

  return count;
}

const CURRENT_ENROLLMENT = 65;
const CAMPUS_CAPACITY = 380;

function EnrollmentStat() {
  const count = useCountUp(CURRENT_ENROLLMENT);
  return (
    <>
      <div
        className="text-4xl text-[#D4A843] tabular-nums"
        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
      >
        {count}
        <span className="text-2xl text-[#bbb] font-normal"> / {CAMPUS_CAPACITY}</span>
      </div>
      <p className="text-[#777] text-sm mt-1">Children enrolled at the campus</p>
    </>
  );
}

interface AvailableChild {
  recordId: string;
  id: string;
  displayName: string;
  age?: string;
  location?: string;
  loves?: string;
  childQuote?: string;
  familyContext?: string;
  photo?: {
    url: string;
    filename: string;
  };
}

interface ChildrenApiChild {
  id: string;
  child_id: string;
  first_name: string;
  last_initial?: string;
  display_name?: string;
  age?: number;
  grade_class?: string;
  photo_url?: string;
  fun_fact?: string;
  child_quote?: string;
  family_context?: string;
  home_village?: string;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Small SVG icon components (gold accent, no emoji) ───────────────
function IconBook({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}
function IconBowl({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75c1.5 0 2.5-.75 3.75-.75 1.25 0 2.25.75 3.75.75 1.5 0 2.5-.75 3.75-.75 1.25 0 2.25.75 3.75.75M3 13.5h18M5.25 8.25c0-1.243 1.007-2.25 2.25-2.25h9c1.243 0 2.25 1.007 2.25 2.25v.75c0 .638-.213 1.247-.6 1.75-.387.503-.853.93-1.4 1.25H7.25c-.547-.32-1.013-.747-1.4-1.25a3.245 3.245 0 01-.6-1.75v-.75z" />
    </svg>
  );
}
function IconShield({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 4.971-4.029 9-9 9s-9-4.029-9-9 4.029-9 9-9c1.526 0 2.964.378 4.219 1.046M21 12V6.75" />
    </svg>
  );
}
function IconHeart({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}
function IconUser({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}
function IconNewspaper({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
    </svg>
  );
}
function IconCamera({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z M18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
  );
}
function IconEnvelope({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}
function IconClipboard({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
    </svg>
  );
}
function IconLaptop({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
    </svg>
  );
}

function SponsorshipPageContent() {
  const [children, setChildren] = useState<AvailableChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(3);

  const carouselRef = useRef<HTMLDivElement | null>(null);
  const scrollCarousel = (direction: 'left' | 'right') => {
    const el = carouselRef.current;
    if (!el) return;
    const delta = el.clientWidth * 0.8;
    el.scrollBy({ left: direction === 'right' ? delta : -delta, behavior: 'smooth' });
  };

  useEffect(() => {
    async function fetchChildren() {
      try {
        const response = await fetch('/api/children');
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load children');
        }
        const mapped: AvailableChild[] = (data.children || []).map((c: ChildrenApiChild) => ({
          recordId: c.id,
          id: c.child_id,
          displayName: c.display_name || c.first_name || 'Child',
          age: c.age ? String(c.age) : undefined,
          location: c.home_village || undefined,
          loves: c.fun_fact || undefined,
          childQuote: c.child_quote || undefined,
          familyContext: c.family_context || undefined,
          photo: c.photo_url ? { url: c.photo_url, filename: '' } : undefined,
        }));
        setChildren(mapped);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }
    fetchChildren();
  }, []);

  // Only show children with photos, shuffled for variety on each
  // visit. No preselection logic — there is no "focused" kid since
  // this page no longer accepts a pick.
  const displayChildren = useMemo(() => {
    const withPhotos = children.filter(c => !!c.photo?.url);
    return shuffle(withPhotos);
  }, [children]);

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/sponsorship" />

      {/* ========== HERO ========== */}
      <section className="pt-24 pb-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">The campus</p>
          <h1
            className="text-4xl md:text-5xl text-[#0d0d0d] mb-4"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
          >
            Meet the kids at the campus.
          </h1>
          <p className="text-lg text-[#777] max-w-2xl mx-auto leading-relaxed mb-8">
            Every Shirt has a Number. Every Number is a Child. Read their
            stories below. When you get a Shirt, your Number connects you
            to one of them.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              href="/shirts"
              className="inline-block px-8 py-4 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors"
            >
              Get a Shirt
            </Link>
            <Link
              href="/"
              className="text-sm text-[#777] hover:text-[#D4A843] transition-colors"
            >
              Already have your Number? Find your kid &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ========== INFO BLOCK — sponsorship explained, no checkout ========== */}
      <section className="pb-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white border border-[#e8e0d4] overflow-hidden">
            <div className="bg-[#0d0d0d] border-b border-[#222] px-8 py-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="text-center md:text-left">
                  <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-2">How sponsorship works</p>
                  <div className="flex items-baseline justify-center md:justify-start gap-1">
                    <span
                      className="text-5xl text-[#FFF8F0]"
                      style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
                    >
                      $25
                    </span>
                    <span className="text-[#777] text-lg">/month per kid</span>
                  </div>
                  <p className="text-[#777] text-sm mt-2">Cancel anytime. No questions asked.</p>
                </div>
                <div className="text-center md:text-right">
                  <EnrollmentStat />
                </div>
              </div>
            </div>

            {/* What your sponsorship provides */}
            <div className="px-8 py-8 border-b border-[#e8e0d4]">
              <h2
                className="text-xl text-[#0d0d0d] mb-5"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                What your sponsorship provides
              </h2>
              <div className="grid sm:grid-cols-2 gap-5">
                {[
                  { icon: <IconBook className="w-5 h-5 text-[#D4A843]" />, title: 'Education', desc: 'School tuition, uniforms, books, and supplies' },
                  { icon: <IconBowl className="w-5 h-5 text-[#D4A843]" />, title: 'Daily meals', desc: 'Nutritious food prepared on campus every school day' },
                  { icon: <IconShield className="w-5 h-5 text-[#D4A843]" />, title: 'Medical care', desc: 'Regular check-ups at the on-site clinic' },
                  { icon: <IconHeart className="w-5 h-5 text-[#D4A843]" />, title: 'Mentorship', desc: 'A personal mentor and a safe community to grow in' },
                ].map(item => (
                  <div key={item.title} className="flex gap-4 items-start">
                    <span className="mt-0.5 flex-shrink-0">{item.icon}</span>
                    <div>
                      <p className="font-semibold text-[#0d0d0d] text-sm">{item.title}</p>
                      <p className="text-[#777] text-sm">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* What you receive as a sponsor */}
            <div className="px-8 py-8">
              <h2
                className="text-xl text-[#0d0d0d] mb-5"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                What you&rsquo;ll receive as a sponsor
              </h2>
              <div className="space-y-4">
                {[
                  {
                    icon: <IconUser className="w-5 h-5 text-[#D4A843]" />,
                    title: 'Matched to a specific Child',
                    desc: 'You&rsquo;ll know their name, see their photo, and follow their story. Multiple sponsors can be matched to the same Child. That&rsquo;s how the campus stays funded.',
                  },
                  {
                    icon: <IconNewspaper className="w-5 h-5 text-[#D4A843]" />,
                    title: 'A monthly newsletter from the campus',
                    desc: 'Our team in Gulu sends a note from the ground each month: what the kids have been up to, stories from the school, photos from the week.',
                  },
                  {
                    icon: <IconCamera className="w-5 h-5 text-[#D4A843]" />,
                    title: 'Photos of your Child every few months',
                    desc: 'Current photos taken at school and around the campus, so you can watch them grow.',
                  },
                  {
                    icon: <IconEnvelope className="w-5 h-5 text-[#D4A843]" />,
                    title: 'A handwritten letter once a year',
                    desc: 'Your Child writes to you, timed with the Ugandan school calendar. You get the scanned original and can write back anytime.',
                  },
                  {
                    icon: <IconClipboard className="w-5 h-5 text-[#D4A843]" />,
                    title: 'A year-end report card',
                    desc: 'Grades, attendance, and teacher comments. Real proof of progress.',
                  },
                  {
                    icon: <IconLaptop className="w-5 h-5 text-[#D4A843]" />,
                    title: 'Your kid&rsquo;s page',
                    desc: 'Every update, photo, and letter lands on your kid&rsquo;s own page on the site. Your browser remembers you, no password required.',
                  },
                ].map(item => (
                  <div key={item.title} className="flex gap-4 items-start">
                    <span className="mt-0.5 w-6 flex-shrink-0">{item.icon}</span>
                    <div>
                      <p className="font-semibold text-[#0d0d0d] text-sm">{item.title}</p>
                      <p className="text-[#777] text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== MEET THE KIDS — explore-only, cards link to /meet/[recordId] ========== */}
      <section className="pb-16 px-6">
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-3xl text-[#0d0d0d] mb-2 text-center"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Faces from the campus.
          </h2>
          <p className="text-[#777] text-center mb-10 max-w-lg mx-auto">
            Tap any kid to read their story. When you get a Shirt, your
            Number will connect you to one of them.
          </p>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-pulse space-y-3">
                <div className="h-6 w-48 bg-[#e8e0d4] mx-auto" />
                <div className="h-4 w-64 bg-[#e8e0d4] mx-auto" />
              </div>
              <p className="text-[#aaa] mt-4 text-sm">Loading...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="bg-white border border-[#e8e0d4] p-6 max-w-md mx-auto">
                <p className="text-[#D4A843] font-medium mb-2">Unable to load children</p>
                <p className="text-[#777] text-sm mb-4">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-5 py-2 bg-[#D4A843] text-[#0d0d0d] font-bold text-sm uppercase tracking-wider hover:bg-[#c49a3a] transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : displayChildren.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-white border border-[#e8e0d4] p-8 max-w-lg mx-auto">
                <h3
                  className="text-2xl text-[#0d0d0d] mb-3"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  No kids loaded right now
                </h3>
                <p className="text-[#777] mb-6 leading-relaxed">
                  We&rsquo;re updating our roster. Drop us a note and we&rsquo;ll let you know when more profiles are up.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href="/contact"
                    className="px-6 py-3 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors text-center"
                  >
                    Get Notified
                  </Link>
                  <Link
                    href="/donate"
                    className="px-6 py-3 border border-[#ccc] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#f5f0e8] transition-colors text-center"
                  >
                    Make a Donation
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* --- Quick-browse carousel --- */}
              <div className="relative mb-16">
                <button
                  type="button"
                  onClick={() => scrollCarousel('left')}
                  aria-label="Previous children"
                  className="hidden md:flex absolute -left-2 lg:-left-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center bg-white border border-[#e8e0d4] text-[#0d0d0d] hover:border-[#D4A843] hover:text-[#D4A843] transition-colors shadow-sm"
                >
                  <span className="text-xl leading-none" aria-hidden="true">&lsaquo;</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollCarousel('right')}
                  aria-label="Next children"
                  className="hidden md:flex absolute -right-2 lg:-right-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center bg-white border border-[#e8e0d4] text-[#0d0d0d] hover:border-[#D4A843] hover:text-[#D4A843] transition-colors shadow-sm"
                >
                  <span className="text-xl leading-none" aria-hidden="true">&rsaquo;</span>
                </button>

                <div
                  ref={carouselRef}
                  className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 -mx-5 px-5 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {displayChildren.map((child) => {
                    const firstName = child.displayName?.split(' ')[0] || 'them';
                    return (
                      <button
                        key={child.recordId + '-thumb'}
                        type="button"
                        onClick={() => {
                          // Scroll the expanded card for this kid into view.
                          const idx = displayChildren.indexOf(child);
                          if (idx >= visibleCount) setVisibleCount(idx + 1);
                          setTimeout(() => {
                            const el = document.getElementById('child-' + child.recordId);
                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 100);
                        }}
                        className="snap-start shrink-0 w-[140px] sm:w-[160px] bg-white border border-[#e8e0d4] overflow-hidden hover:border-[#D4A843] transition-colors text-left"
                      >
                        <div className="aspect-square relative bg-[#f5f0e8]">
                          {child.photo?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={child.photo.url}
                              alt={child.displayName}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <IconUser className="w-8 h-8 text-[#ccc]" />
                            </div>
                          )}
                        </div>
                        <div className="px-3 py-2">
                          <p className="text-sm font-semibold text-[#0d0d0d] truncate">{firstName}</p>
                          {child.age && <p className="text-xs text-[#999]">Age {child.age}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* --- Section header + photo --- */}
              <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6 text-center">Change their lives</p>
              <div className="mb-12 overflow-hidden max-w-2xl mx-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/story/kids-hugging.png"
                  alt="Children standing together outside their home in Northern Uganda"
                  className="w-full object-cover"
                />
              </div>

              {/* --- Expanded profile cards (paginated) --- */}
              <div className="space-y-10">
                {displayChildren.slice(0, visibleCount).map((child) => {
                  const firstName = child.displayName?.split(' ')[0] || 'them';
                  return (
                    <div
                      key={child.recordId}
                      id={'child-' + child.recordId}
                      className="bg-white border border-[#e8e0d4] overflow-hidden"
                    >
                      <div className="grid md:grid-cols-2">
                        {/* Photo side */}
                        <div className="aspect-[4/5] md:aspect-auto relative bg-[#f5f0e8]">
                          {child.photo?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={child.photo.url}
                              alt={`Photo of ${child.displayName}`}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="text-center">
                                <IconUser className="w-16 h-16 text-[#ccc] mx-auto mb-2" />
                                <p className="text-[#aaa] text-sm">Photo coming soon</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Info side */}
                        <div className="p-6 md:p-8 flex flex-col justify-center">
                          <h3
                            className="text-2xl md:text-3xl text-[#0d0d0d] mb-1"
                            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                          >
                            {child.displayName}
                          </h3>
                          <div className="flex items-center gap-2 text-[#999] text-sm mb-5">
                            {child.age && <span>Age {child.age}</span>}
                            {child.age && child.location && <span className="text-[#ccc]">&middot;</span>}
                            {child.location && <span>{child.location}</span>}
                          </div>

                          {child.childQuote && (
                            <p
                              className="text-lg text-[#0d0d0d] leading-snug mb-5"
                              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 500, fontStyle: 'italic' }}
                            >
                              &ldquo;{child.childQuote}&rdquo;
                            </p>
                          )}

                          {child.loves && (
                            <div className="mb-5">
                              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                                What {firstName} loves
                              </p>
                              <p className="text-[#555] leading-relaxed">{child.loves}</p>
                            </div>
                          )}

                          {child.familyContext && (
                            <div className="mb-5">
                              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                                Family
                              </p>
                              <p className="text-[#555] leading-relaxed text-sm">{child.familyContext}</p>
                            </div>
                          )}

                          {/* Read-more link to the numberless meet page.
                              Sponsorship CTAs do not live here — they
                              live on /meet/[recordId] (for adding kids
                              to a relationship) or on the visitor's
                              own /[N] page (for owners). */}
                          <div className="mt-auto pt-4">
                            <Link
                              href={`/meet/${child.recordId}`}
                              className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#D4A843] hover:text-[#0d0d0d] transition-colors"
                            >
                              Read {firstName}&rsquo;s story &rarr;
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {visibleCount < displayChildren.length && (
                <div className="text-center mt-10">
                  <button
                    type="button"
                    onClick={() => setVisibleCount(prev => Math.min(prev + 3, displayChildren.length))}
                    className="px-8 py-4 border border-[#e8e0d4] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:border-[#D4A843] hover:text-[#D4A843] transition-colors"
                  >
                    Meet more kids
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ========== HOW IT WORKS — matches /shirts: Pick a Color, Get a Number, Meet a Child ========== */}
      <section className="pb-16 px-6 bg-white border-t border-[#e8e0d4] pt-16">
        <div className="max-w-3xl mx-auto">
          <h2
            className="text-3xl text-[#0d0d0d] mb-10 text-center"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            How it works
          </h2>

          <div className="space-y-8">
            {[
              {
                step: 'I',
                title: 'Pick a Color',
                desc: 'Choose a Shirt at beanumber.org/shirts. Heavyweight cotton, screen-printed by hand, $25 one-time.',
              },
              {
                step: 'II',
                title: 'Get a Number',
                desc: 'Your Shirt ships with a unique Number pressed on the back. That Number is yours.',
              },
              {
                step: 'III',
                title: 'Meet a Child',
                desc: 'Come back to beanumber.org, enter your Number, meet the Child it connects you to. Your browser remembers you on this device, no password to keep track of.',
              },
              {
                step: 'IV',
                title: 'Stay with them',
                desc: '$25/month keeps them in school, fed, and seen by a doctor. Letters, photos, and a year-end report card come back to their page. Cancel anytime.',
              },
            ].map(item => (
              <div key={item.step} className="flex gap-5 items-start">
                <div
                  className="w-10 h-10 bg-[#D4A843] text-[#0d0d0d] flex items-center justify-center font-bold text-sm flex-shrink-0"
                  style={{ fontFamily: 'var(--font-lora), serif' }}
                >
                  {item.step}
                </div>
                <div>
                  <h3 className="font-semibold text-[#0d0d0d] text-lg">{item.title}</h3>
                  <p className="text-[#777] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FAQ ========== */}
      <section className="pb-20 px-6 border-t border-[#e8e0d4] pt-16">
        <div className="max-w-3xl mx-auto">
          <h2
            className="text-3xl text-[#0d0d0d] mb-10 text-center"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: 'Where does my $25 actually go?',
                a: 'Your $25 pools with other sponsors to support education, daily meals, medical care through the on-site clinic, and mentorship for the kids at the YDO campus. It also supports the infrastructure around them: the 60 women in vocational training, the 700+ patients served through medical outreach, the construction apprenticeships. You&rsquo;re not paying line items on one Child&rsquo;s bill. You&rsquo;re supporting the ecosystem that keeps them in school.',
              },
              {
                q: 'What happens if multiple people sponsor the same Child?',
                a: 'That&rsquo;s the model. It costs more than $25/month to fully support a Child&rsquo;s education, meals, and medical care at the campus. We set the price at $25 because it&rsquo;s accessible, and we match multiple sponsors per Child until the campus is fully funded. Every Child at the campus is enrolled and cared for regardless of how many sponsors they have on paper. Your $25 isn&rsquo;t the difference between a Child going to school or not. It&rsquo;s part of the team that makes it possible.',
              },
              {
                q: 'How do I actually become a sponsor?',
                a: 'Get a Shirt at beanumber.org/shirts. When it arrives, flip it over, read the Number off the back, enter it at beanumber.org. You&rsquo;ll meet the Child your Number connects you to and can start a $25/month sponsorship right from their page. Already have a Shirt with a Number? Search your Number at beanumber.org.',
              },
              {
                q: 'Can I pick a specific Child?',
                a: 'Not at checkout. We don&rsquo;t pre-match buyers to kids — the Number on your Shirt does that. But once you&rsquo;re on the campus (meaning, once you have your kid), you can explore any other kid&rsquo;s page from theirs and add a second relationship if you want. Some sponsors do that. Most start with one.',
              },
              {
                q: 'What makes this different from other child sponsorship programs?',
                a: 'Most sponsorship programs are top-down: an international org places staff in a region, runs programs, and sends you a photo twice a year. Be A Number is a community-systems model. We built a six-acre campus in partnership with Acholi leadership on Acholi land. A nursery and primary school, a medical center, vocational training, and a local workforce of 30 community members running everything. Your sponsorship plugs into a system that was designed to outlast any single donor.',
              },
              {
                q: 'Who&rsquo;s on the ground doing this work?',
                a: 'Youth Development Organisation Uganda (YDO), led by Simon Peter Wilobo in Gulu District. YDO was born out of Northern Uganda&rsquo;s post-conflict recovery and has deep roots in the community. Every program is designed and run by Ugandan leadership. Be A Number provides the systems architecture, funding pipeline, and international bridge. The community owns the work.',
              },
              {
                q: 'How often will I hear about my Child?',
                a: 'Roughly one touchpoint a month. A campus newsletter from the team in Gulu every month. Photos of your specific Child every few months. A handwritten letter from them once a year. A year-end report card with grades, attendance, and teacher comments. Everything lands on your kid&rsquo;s page on the site, accessible anytime.',
              },
              {
                q: 'Can I write to my Child?',
                a: 'Yes. Reply to any campus email from us and the message gets routed to your kid. Our field team in Uganda prints and delivers it, and your kid writes back. We scan the original and post it on their page.',
              },
              {
                q: 'What if I need to cancel?',
                a: 'Cancel anytime &mdash; email Kevin@beanumber.org or use the cancel link in any of our emails. No penalty, no guilt, no questions. If you cancel, we work to find your Child additional sponsors so their education continues uninterrupted. Nobody loses their seat because one sponsor left.',
              },
              {
                q: 'Can I actually visit?',
                a: 'Yes. We have an international lodge on the campus in Northern Uganda built specifically for sponsor visits and university cohorts. Meeting your Child in person is something we actively encourage, not a theoretical perk buried in fine print. Contact us and we&rsquo;ll help you plan the trip.',
              },
              {
                q: 'Is my donation tax-deductible?',
                a: 'Yes. Be A Number, International is a registered 501(c)(3) (EIN 93-1948872). You&rsquo;ll receive a year-end giving statement for your records.',
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

      {/* ========== BOTTOM CTA — shirt-first, no kid picker ========== */}
      <section className="pb-20 px-6">
        <div className="max-w-2xl mx-auto bg-[#0d0d0d] p-10 text-center">
          <h2
            className="text-3xl text-[#FFF8F0] mb-3"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Six acres. Thirty staff. Your $25.
          </h2>
          <p className="text-[#777] mb-6 leading-relaxed">
            School, meals, medical care, and mentorship at the YDO campus
            in Omoro District. One Child, one Number, one connection.
          </p>
          <Link
            href="/shirts"
            className="inline-block px-8 py-4 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors"
          >
            Get a Shirt
          </Link>
        </div>
      </section>

      <BANFooter />
    </div>
  );
}

export default function SponsorshipPage() {
  return (
    <Suspense fallback={null}>
      <SponsorshipPageContent />
    </Suspense>
  );
}
