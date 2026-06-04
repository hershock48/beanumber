'use client';

import { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';

/**
 * Mount-time count-up. Runs on hydration regardless of scroll
 * position so the number actually animates (the IntersectionObserver
 * variant on the homepage left counters stuck at 0 for users whose
 * viewport happened to put the section just below the trigger line).
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

/**
 * Enrollment progress: current count animated up to today's number,
 * shown against the campus capacity. Tells the real story — the
 * school is built for 380 kids, currently serving 65, and the gap
 * is what sponsorship grows. Update CURRENT_ENROLLMENT when YDO
 * sends the next term-end count.
 */
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
      <p className="text-[#777] text-sm mt-1">children enrolled at the campus</p>
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
  shirtNumber?: number;
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
  shirt_number_start?: number;
}

// ---------------------------------------------------------------------------
// Fisher-Yates shuffle — returns a new array, does not mutate the original.
// ---------------------------------------------------------------------------
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Small SVG icon components (gold accent, no emoji)
// ---------------------------------------------------------------------------
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m18-12L19.5 5.25a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0L3 4.5" />
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
function IconShield({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5" />
    </svg>
  );
}
function IconCamera({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
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
  const searchParams = useSearchParams();

  const preselectedChildId = searchParams.get('child');
  const referringShirtSessionId = searchParams.get('from_shirt');

  const [children, setChildren] = useState<AvailableChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sponsoringId, setSponsoringId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(3);

  // "Your kids" — kids on the back of shirts the visitor has
  // already bought. Returned by /api/sponsor/my-shirts when the
  // ban_buyer_session or sponsor_session cookie identifies them.
  // Empty array = anonymous visitor or no prior shirt purchases.
  const [myShirtKids, setMyShirtKids] = useState<AvailableChild[]>([]);

  const carouselRef = useRef<HTMLDivElement | null>(null);
  const scrollCarousel = (direction: 'left' | 'right') => {
    const el = carouselRef.current;
    if (!el) return;
    const delta = el.clientWidth * 0.8;
    el.scrollBy({ left: direction === 'right' ? delta : -delta, behavior: 'smooth' });
  };

  // Fetch "your kids" alongside the full roster on mount. Failure
  // is silent — anonymous visitors and people without prior shirts
  // just get the standard roster.
  useEffect(() => {
    async function fetchMyShirts() {
      try {
        const res = await fetch('/api/sponsor/my-shirts', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        interface MyShirtKidApi {
          recordId: string;
          childId: string;
          firstName: string;
          displayName: string;
          shirtNumber: number;
          photoUrl: string | null;
        }
        const mapped: AvailableChild[] = ((data.kids as MyShirtKidApi[]) || []).map(k => ({
          recordId: k.recordId,
          id: k.childId,
          displayName: k.displayName || k.firstName || 'Kid',
          shirtNumber: k.shirtNumber,
          photo: k.photoUrl ? { url: k.photoUrl, filename: '' } : undefined,
        }));
        setMyShirtKids(mapped);
      } catch {
        // Quiet — falls back to standard experience.
      }
    }
    fetchMyShirts();
  }, []);

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
          shirtNumber: c.shirt_number_start || undefined,
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

  // Only show children with photos, shuffled. If a specific child was
  // preselected, that child gets pulled to the front regardless.
  const displayChildren = useMemo(() => {
    const withPhotos = children.filter(c => !!c.photo?.url);
    if (preselectedChildId) {
      const target = withPhotos.find(c => c.id === preselectedChildId)
        || children.find(c => c.id === preselectedChildId);
      const rest = shuffle(withPhotos.filter(c => c.id !== preselectedChildId));
      return target ? [target, ...rest] : rest;
    }
    return shuffle(withPhotos);
  }, [children, preselectedChildId]);

  async function handleSponsor(child: AvailableChild) {
    setSponsoringId(child.recordId);
    try {
      const response = await fetch('/api/create-sponsor-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childRecordId: child.recordId,
          childId: child.id,
          childDisplayName: child.displayName,
          referringShirtSessionId: referringShirtSessionId || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start sponsorship');
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Sponsorship error:', err);
      alert(err.message || 'Something went wrong. Please try again.');
      setSponsoringId(null);
    }
  }

  // Focus state: if a preselected child was found
  const focusedChild =
    preselectedChildId ? displayChildren.find(c => c.id === preselectedChildId) : null;

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/sponsorship" />

      {/* ========== HERO ========== */}
      <section className="pt-24 pb-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">Sponsorship</p>
          <h1
            className="text-4xl md:text-5xl text-[#0d0d0d] mb-4"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
          >
            {focusedChild
              ? `Stay in ${focusedChild.displayName.split(' ')[0]}\u2019s life.`
              : 'Pick a number. Stay in their life.'}
          </h1>
          <p className="text-lg text-[#777] max-w-2xl mx-auto leading-relaxed">
            {focusedChild && referringShirtSessionId
              ? `Your shirt started ${focusedChild.displayName.split(' ')[0]}\u2019s year at the campus. $25/month finishes it. Cancel anytime.`
              : '$25 a month supports school, daily meals, medical care, and a personal mentor at the YDO campus in Northern Uganda. You\u2019ll know your matched child by name, see their face, and follow their year.'}
          </p>
        </div>
      </section>

      {/* ========== PRICING BLOCK ========== */}
      <section className="pb-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white border border-[#e8e0d4] overflow-hidden">
            {/* Price header + efficiency stat */}
            <div className="bg-[#0d0d0d] border-b border-[#222] px-8 py-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="text-center md:text-left">
                  <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-2">Child Sponsorship</p>
                  <div className="flex items-baseline justify-center md:justify-start gap-1">
                    <span
                      className="text-5xl text-[#FFF8F0]"
                      style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
                    >
                      $25
                    </span>
                    <span className="text-[#777] text-lg">/month</span>
                  </div>
                  <p className="text-[#777] text-sm mt-2">Cancel anytime. No questions asked.</p>
                </div>
                <div className="text-center md:text-right">
                  <EnrollmentStat />
                </div>
              </div>
            </div>

            {/* What your child receives */}
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
                    title: 'Matched to a specific child',
                    desc: 'You\u2019ll know their name, see their photo, and follow their story. Multiple sponsors can be matched to the same child. That\u2019s how the campus stays funded.',
                  },
                  {
                    icon: <IconNewspaper className="w-5 h-5 text-[#D4A843]" />,
                    title: 'A monthly newsletter from the campus',
                    desc: 'Our team in Gulu sends a note from the ground each month: what the kids have been up to, stories from the school, photos from the week.',
                  },
                  {
                    icon: <IconCamera className="w-5 h-5 text-[#D4A843]" />,
                    title: 'Photos of your child every few months',
                    desc: 'Current photos taken at school and around the campus, so you can watch them grow.',
                  },
                  {
                    icon: <IconEnvelope className="w-5 h-5 text-[#D4A843]" />,
                    title: 'A handwritten letter once a year',
                    desc: 'Your child writes to you, timed with the Ugandan school calendar. You get the scanned original and can write back anytime.',
                  },
                  {
                    icon: <IconClipboard className="w-5 h-5 text-[#D4A843]" />,
                    title: 'A year-end report card',
                    desc: 'Grades, attendance, and teacher comments. Real proof of progress.',
                  },
                  {
                    icon: <IconLaptop className="w-5 h-5 text-[#D4A843]" />,
                    title: 'Online sponsor portal',
                    desc: 'Log in with your sponsor code to see every update, photo, and letter in one place.',
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

      {/* ========== YOUR SHIRTS — defaults the sponsorship to the kid
            on the back of a shirt this visitor has already bought.
            Renders only when /api/sponsor/my-shirts returns matches
            for their session cookie. Standard Fahlo-style mapping:
            the code on the product IS the relationship. ========== */}
      {myShirtKids.length > 0 && (
        <section className="pb-16 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="max-w-3xl mx-auto text-center mb-8">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
                Your shirts
              </p>
              <h2
                className="text-3xl text-[#0d0d0d] mb-3"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                {myShirtKids.length === 1
                  ? `Sponsor the kid on the back of your shirt.`
                  : `Sponsor one of the kids on your shirts.`}
              </h2>
              <p className="text-[#666] leading-relaxed">
                You&rsquo;ve bought {myShirtKids.length === 1 ? 'a shirt' : `${myShirtKids.length} shirts`} already &mdash;{' '}
                {myShirtKids.length === 1 ? 'this is the kid that came with it.' : 'these are the kids that came with them.'}{' '}
                Pick which one to stay close to monthly.
              </p>
            </div>
            <div className={`grid gap-4 ${
              myShirtKids.length === 1
                ? 'max-w-md mx-auto'
                : myShirtKids.length === 2
                  ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto'
                  : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
            }`}>
              {myShirtKids.map(kid => (
                <button
                  key={kid.recordId}
                  type="button"
                  onClick={() => handleSponsor(kid)}
                  disabled={sponsoringId === kid.recordId}
                  className="group relative bg-white border-2 border-[#D4A843]/30 hover:border-[#D4A843] transition-colors text-left overflow-hidden disabled:opacity-60"
                >
                  <div className="aspect-[4/3] bg-[#f5f0e8] overflow-hidden">
                    {kid.photo?.url ? (
                      <img
                        src={kid.photo.url}
                        alt={kid.displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#aaa] text-sm">
                        Photo coming
                      </div>
                    )}
                    {typeof kid.shirtNumber === 'number' && (
                      <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm px-3 py-1.5">
                        <span className="text-sm font-bold text-[#D4A843]">
                          #{kid.shirtNumber}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-1">
                      Shirt #{kid.shirtNumber}
                    </p>
                    <p
                      className="text-xl text-[#0d0d0d] leading-snug mb-3"
                      style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                    >
                      {kid.displayName}
                    </p>
                    <p className="text-sm font-bold text-[#D4A843] group-hover:text-[#0d0d0d] transition-colors">
                      {sponsoringId === kid.recordId
                        ? 'Opening checkout…'
                        : `Sponsor ${kid.displayName.split(' ')[0]} →`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ========== MEET THE KIDS ========== */}
      <section className="pb-16 px-6">
        <div className="max-w-6xl mx-auto">
          {myShirtKids.length > 0 ? (
            <h2
              className="text-2xl md:text-3xl text-[#0d0d0d] mb-2 text-center"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Or pick someone new.
            </h2>
          ) : focusedChild ? (
            <>
              <h2
                className="text-3xl text-[#0d0d0d] mb-2 text-center"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                You&rsquo;re sponsoring {focusedChild.displayName}
              </h2>
              <p className="text-[#777] text-center mb-10 max-w-lg mx-auto">
                {referringShirtSessionId
                  ? "Your shirt started their year at the campus. Keep going. $25/month, cancel anytime."
                  : `Confirm below to sponsor ${focusedChild.displayName} for $25/month. Cancel anytime.`}
              </p>
            </>
          ) : (
            <>
              <h2
                className="text-3xl text-[#0d0d0d] mb-2 text-center"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                Skip the shirt, pick a child.
              </h2>
              <p className="text-[#777] text-center mb-10 max-w-lg mx-auto">
                $25/month supports school, daily meals, medical care through the on-site clinic, and a mentor who knows your matched child by name. You get letters, photos, and a year-end report card.
              </p>
            </>
          )}

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
                  No children loaded right now
                </h3>
                <p className="text-[#777] mb-6 leading-relaxed">
                  We&rsquo;re updating our roster. Drop us a note and we&rsquo;ll connect you with a child to sponsor.
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
                          // If the card isn't visible yet, expand to show it
                          const idx = displayChildren.indexOf(child);
                          if (idx >= visibleCount) setVisibleCount(idx + 1);
                          // Scroll after a tick so the DOM has rendered
                          setTimeout(() => {
                            const el = document.getElementById('child-' + child.recordId);
                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 100);
                        }}
                        className="snap-start shrink-0 w-[140px] sm:w-[160px] bg-white border border-[#e8e0d4] overflow-hidden hover:border-[#D4A843] transition-colors text-left"
                      >
                        <div className="aspect-square relative bg-[#f5f0e8]">
                          {child.photo?.url ? (
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

                          <div className="mt-auto pt-4 space-y-3">
                            <button
                              onClick={() => handleSponsor(child)}
                              disabled={sponsoringId === child.recordId}
                              className="block w-full py-3 bg-[#D4A843] text-[#0d0d0d] text-center font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {sponsoringId === child.recordId
                                ? 'Starting...'
                                : `Sponsor ${firstName} \u00b7 $25/mo`}
                            </button>
                            <div className="flex items-center justify-between text-xs text-[#999]">
                              <span>Cancel anytime. Secure checkout via Stripe.</span>
                              {child.shirtNumber && (
                                <Link
                                  href={`/children/${child.shirtNumber}`}
                                  className="text-[#D4A843] hover:underline"
                                >
                                  Full profile &rarr;
                                </Link>
                              )}
                            </div>
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

      {/* ========== HOW IT WORKS ========== */}
      <section className="pb-16 px-6 bg-white border-t border-[#e8e0d4] pt-16">
        <div className="max-w-3xl mx-auto">
          <h2
            className="text-3xl text-[#0d0d0d] mb-10 text-center"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            How It Works
          </h2>

          <div className="space-y-8">
            {[
              {
                step: 'I',
                title: 'Choose a child',
                desc: 'Browse the children above. Pick the one you want to walk with. Hit sponsor.',
              },
              {
                step: 'II',
                title: '$25/month supports the campus',
                desc: 'School fees, daily meals, medical care, and mentorship at the YDO campus in Omoro District. Secure checkout via Stripe.',
              },
              {
                step: 'III',
                title: 'Get your sponsor portal',
                desc: 'A sponsor code arrives by email. Log in anytime to see updates, photos, and letters from your child.',
              },
              {
                step: 'IV',
                title: 'Stay connected all year',
                desc: 'Monthly newsletters from the campus, photos every few months, a handwritten letter once a year, and a year-end report card.',
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
                a: 'Your $25 pools with other sponsors to support education, daily meals, medical care through the on-site clinic, and mentorship for the children at the YDO campus. It also supports the infrastructure around them: the 60 women in vocational training, the 700+ patients served through medical outreach, the construction apprenticeships. You\u2019re not paying line items on one child\u2019s bill. You\u2019re supporting the ecosystem that keeps them in school.',
              },
              {
                q: 'What happens if multiple people sponsor the same child?',
                a: 'That\u2019s the model. It costs more than $25/month to fully support a child\u2019s education, meals, and medical care at the campus. We set the price at $25 because it\u2019s accessible, and we match multiple sponsors per child until the campus is fully funded. Every child at the campus is enrolled and cared for regardless of how many sponsors they have on paper. Your $25 isn\u2019t the difference between a child going to school or not. It\u2019s part of the team that makes it possible.',
              },
              {
                q: 'Do I need to buy a shirt first?',
                a: 'No. The shirt is one way in. You can also sponsor directly from this page. If you did buy a shirt, it started your matched child\u2019s year at the campus and the number on the tag connects you to them. If you didn\u2019t, pick a child above and you\u2019re in the same place.',
              },
              {
                q: 'What makes this different from other child sponsorship programs?',
                a: 'Most sponsorship programs are top-down: an international org places staff in a region, runs programs, and sends you a photo twice a year. Be A Number is a community-systems model. We built a six-acre campus in partnership with Acholi leadership on Acholi land. A nursery and primary school, a medical center, vocational training, and a local workforce of 30 community members running everything. Your sponsorship plugs into a system that was designed to outlast any single donor.',
              },
              {
                q: 'Who\u2019s on the ground doing this work?',
                a: 'Youth Development Organisation Uganda (YDO), led by Simon Peter Wilobo in Gulu District. YDO was born out of Northern Uganda\u2019s post-conflict recovery and has deep roots in the community. Every program is designed and run by Ugandan leadership. Be A Number provides the systems architecture, funding pipeline, and international bridge. The community owns the work.',
              },
              {
                q: 'How often will I hear about my child?',
                a: 'Roughly one touchpoint a month. A campus newsletter from the team in Gulu every month. Photos of your specific child every few months. A handwritten letter from them once a year. A year-end report card with grades, attendance, and teacher comments. Everything lands in your sponsor portal, accessible anytime.',
              },
              {
                q: 'Can I write to my child?',
                a: 'Yes. Send letters and messages through the sponsor portal. Our field team in Uganda prints and delivers them. Your child writes back, and we scan the original for you.',
              },
              {
                q: 'What if I need to cancel?',
                a: 'Cancel anytime from your sponsor portal. No penalty, no guilt, no questions. If you cancel, we work to find your child additional sponsors so their education continues uninterrupted. Nobody loses their seat because one sponsor left.',
              },
              {
                q: 'Can I actually visit?',
                a: 'Yes. We have an international lodge on the campus in Northern Uganda built specifically for sponsor visits and university cohorts. Meeting your child in person is something we actively encourage, not a theoretical perk buried in fine print. Contact us and we\u2019ll help you plan the trip.',
              },
              {
                q: 'Is my donation tax-deductible?',
                a: 'Yes. Be A Number, International is a registered 501(c)(3) (EIN 93-1948872). You\u2019ll receive a year-end giving statement for your records.',
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

      {/* ========== BOTTOM CTA ========== */}
      <section className="pb-20 px-6">
        <div className="max-w-2xl mx-auto bg-[#0d0d0d] p-10 text-center">
          <h2
            className="text-3xl text-[#FFF8F0] mb-3"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Six acres. Thirty staff. Your $25.
          </h2>
          <p className="text-[#777] mb-6 leading-relaxed">
            School, meals, medical care, and mentorship at the YDO campus in Omoro District.
            One child, one number, one connection.
          </p>
          <a
            href="#top"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="inline-block px-8 py-4 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors"
          >
            Choose a Child
          </a>
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
