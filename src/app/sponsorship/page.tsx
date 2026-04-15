'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';

interface AvailableChild {
  recordId: string;
  id: string;
  displayName: string;
  age?: string;
  location?: string;
  photo?: {
    url: string;
    filename: string;
  };
}

interface ApiResponse {
  success: boolean;
  data?: {
    children: AvailableChild[];
    total: number;
  };
  error?: string;
}

export default function SponsorshipPage() {
  const searchParams = useSearchParams();

  // URL params set by the shirt success page and the /children/[number] page.
  //   ?child=X         — preselected child id (ChildID field in Airtable)
  //   ?name=Y          — cosmetic display name
  //   ?from_shirt=cs_… — the Stripe shirt checkout session id, threaded
  //                      through so we can attribute shirt→sponsor conversion.
  const preselectedChildId = searchParams.get('child');
  const referringShirtSessionId = searchParams.get('from_shirt');

  const [children, setChildren] = useState<AvailableChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sponsoringId, setSponsoringId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAvailableChildren() {
      try {
        const response = await fetch('/api/sponsorship/available');
        const data: ApiResponse = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to load available children');
        }
        setChildren(data.data?.children || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }
    fetchAvailableChildren();
  }, []);

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

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/sponsorship" />

      {/* Hero */}
      <section className="pt-24 pb-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">Sponsorship</p>
          <h1
            className="text-4xl md:text-5xl text-[#0d0d0d] mb-4"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
          >
            Continue Their Story
          </h1>
          <p className="text-lg text-[#777] max-w-2xl mx-auto leading-relaxed">
            Your shirt connected you to a child in Northern Uganda. For $25 a month,
            you stay connected to their name, their face, their journey through
            school and life.
          </p>
        </div>
      </section>

      {/* What You Receive */}
      <section className="pb-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white border border-[#e8e0d4] overflow-hidden">
            {/* Price header */}
            <div className="bg-[#0d0d0d] border-b border-[#222] px-8 py-8 text-center">
              <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-2">Child Sponsorship</p>
              <div className="flex items-baseline justify-center gap-1">
                <span
                  className="text-5xl text-[#FFF8F0]"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
                >
                  $25
                </span>
                <span className="text-[#777] text-lg">/month</span>
              </div>
              <p className="text-[#777] text-sm mt-2">Your shirt covered month one. Keep going. Cancel anytime.</p>
            </div>

            {/* What your child receives */}
            <div className="px-8 py-8 border-b border-[#e8e0d4]">
              <h2
                className="text-xl text-[#0d0d0d] mb-5"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                What your sponsorship provides
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { icon: '📚', title: 'Education', desc: 'School tuition, uniforms, books, and supplies' },
                  { icon: '🍽️', title: 'Daily meals', desc: 'Nutritious food to support healthy growth' },
                  { icon: '🏥', title: 'Medical care', desc: 'Regular check-ups and access to the on-site clinic' },
                  { icon: '🤝', title: 'Mentorship', desc: 'A personal mentor and a safe community to grow in' },
                ].map(item => (
                  <div key={item.title} className="flex gap-4 items-start">
                    <span className="text-2xl mt-0.5">{item.icon}</span>
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
                    icon: '👤',
                    title: 'Matched to a specific child',
                    desc: 'You\u2019re tied to one child by their shirt number. Their name, photo, age, and story are yours once your shirt arrives and you enter your number.',
                  },
                  {
                    icon: '📰',
                    title: 'A monthly newsletter from the campus',
                    desc: 'Each month our team in Gulu sends a note from the ground \u2014 what the kids have been up to, stories from the school, photos from the week.',
                  },
                  {
                    icon: '📸',
                    title: 'Photos of your child every few months',
                    desc: 'Current photos taken at school and around the campus, so you can watch them grow over the year.',
                  },
                  {
                    icon: '✉️',
                    title: 'A handwritten letter once a year',
                    desc: 'Your child writes to you, usually timed with the Ugandan school calendar. You\u2019ll get the scanned original and can write back anytime.',
                  },
                  {
                    icon: '📋',
                    title: 'A year-end report card',
                    desc: 'Grades, attendance, and teacher comments \u2014 real proof of their progress, once a year.',
                  },
                  {
                    icon: '💻',
                    title: 'Online sponsor portal',
                    desc: 'Log in anytime with your sponsor code to see every update, photo, and letter in one place.',
                  },
                ].map(item => (
                  <div key={item.title} className="flex gap-4 items-start">
                    <span className="text-xl mt-0.5 w-8 text-center flex-shrink-0">{item.icon}</span>
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

      {/* Children Awaiting Sponsors */}
      <section className="pb-16 px-6">
        <div className="max-w-6xl mx-auto">
          {(() => {
            // When a specific child was preselected (from /shirts/success or
            // /children/[number]), focus the page on that single child if we
            // can find them. Fall back to the full list if not.
            const focused =
              preselectedChildId && children.find(c => c.id === preselectedChildId);
            if (focused) {
              return (
                <>
                  <h2
                    className="text-3xl text-[#0d0d0d] mb-2 text-center"
                    style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                  >
                    You&rsquo;re sponsoring {focused.displayName}
                  </h2>
                  <p className="text-[#777] text-center mb-10 max-w-lg mx-auto">
                    {referringShirtSessionId
                      ? "Your shirt covered their first month. Keep going \u2014 $25/month, cancel anytime."
                      : `Confirm below to sponsor ${focused.displayName} monthly for $25. Cancel anytime.`}
                  </p>
                </>
              );
            }
            return (
              <>
                <h2
                  className="text-3xl text-[#0d0d0d] mb-2 text-center"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  Children Waiting for a Sponsor
                </h2>
                <p className="text-[#777] text-center mb-10 max-w-lg mx-auto">
                  Each of these children is enrolled in our program and ready to be matched with a sponsor like you.
                </p>
              </>
            );
          })()}

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-pulse space-y-3">
                <div className="h-6 w-48 bg-[#e8e0d4] mx-auto"></div>
                <div className="h-4 w-64 bg-[#e8e0d4] mx-auto"></div>
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
          ) : children.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-white border border-[#e8e0d4] p-8 max-w-lg mx-auto">
                <h3
                  className="text-2xl text-[#0d0d0d] mb-3"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  All children are sponsored!
                </h3>
                <p className="text-[#777] mb-6 leading-relaxed">
                  Every child in our current program has a sponsor. New children are being enrolled regularly.
                  Leave your email and we&rsquo;ll let you know as soon as a child is available.
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {(preselectedChildId && children.some(c => c.id === preselectedChildId)
                ? children.filter(c => c.id === preselectedChildId)
                : children
              ).map((child) => (
                <div
                  key={child.recordId}
                  className="bg-white border border-[#e8e0d4] overflow-hidden hover:shadow-lg transition-all"
                >
                  {/* Photo */}
                  <div className="aspect-[4/5] relative bg-[#f5f0e8]">
                    {child.photo?.url ? (
                      <Image
                        src={child.photo.url}
                        alt={`Photo of ${child.displayName}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-5xl mb-2 opacity-40">👤</div>
                          <p className="text-[#aaa] text-sm">Photo coming soon</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-6">
                    <h3
                      className="text-xl text-[#0d0d0d] mb-1"
                      style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                    >
                      {child.displayName}
                    </h3>
                    <div className="flex items-center gap-2 text-[#777] text-sm mb-5">
                      {child.age && <span>Age {child.age}</span>}
                      {child.age && child.location && <span className="text-[#ccc]">&middot;</span>}
                      {child.location && <span>{child.location}</span>}
                    </div>

                    <button
                      onClick={() => handleSponsor(child)}
                      disabled={sponsoringId === child.recordId}
                      className="block w-full py-3 bg-[#D4A843] text-[#0d0d0d] text-center font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {sponsoringId === child.recordId
                        ? 'Starting...'
                        : `Sponsor ${child.displayName.split(' ')[0]} \u00b7 $25/mo`}
                    </button>
                    <p className="text-center text-xs text-[#999] mt-3">
                      Cancel anytime. Secure checkout via Stripe.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
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
                title: 'Get a shirt',
                desc: '$25 gets you a heavyweight shirt and sponsors a child for your first month.',
              },
              {
                step: 'II',
                title: 'Meet your child',
                desc: 'Enter your shirt number on the site. See their name, their photo, their story.',
              },
              {
                step: 'III',
                title: 'Continue for $25/month',
                desc: 'Keep going with secure, automatic monthly giving. Adjust or cancel at any time (no questions asked).',
              },
              {
                step: 'IV',
                title: 'Stay connected all year',
                desc: 'Monthly campus newsletters, photos of your child every few months, a handwritten letter once a year, and a year-end report card \u2014 all in your sponsor portal.',
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

      {/* FAQ */}
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
                q: 'How much of my $25 goes directly to my child?',
                a: 'Be A Number operates at 96.7% program efficiency. The vast majority of your sponsorship goes directly to education, meals, healthcare, and community programs that serve your child.',
              },
              {
                q: 'How often will I hear about my child?',
                a: 'About one touchpoint a month. Every month, a newsletter from our team on the campus in Gulu \u2014 stories, photos from the week, what your $25s are collectively doing. Every few months, a photo of your specific child. Once a year, a handwritten letter from them and a year-end report card aligned with the Ugandan school calendar. Everything lands in your sponsor portal; you\u2019ll also get an email when something new is posted.',
              },
              {
                q: 'Can I write to my child?',
                a: 'Yes! You can send letters and messages through the sponsor portal. Our field team in Uganda delivers them to your child, and your child writes back.',
              },
              {
                q: 'What if I need to cancel?',
                a: 'We understand that circumstances change. You can adjust your giving amount or cancel at any time with no penalty. If you cancel, we\u2019ll work to find your child a new sponsor so their education isn\u2019t interrupted.',
              },
              {
                q: 'Is my donation tax-deductible?',
                a: 'Yes. Be A Number is a registered 501(c)(3) nonprofit organization. You\u2019ll receive a year-end giving statement for your tax records.',
              },
              {
                q: 'Can I visit my sponsored child?',
                a: 'We welcome sponsor visits! We have an international lodge on our campus in Northern Uganda. Contact us to plan a trip. Meeting your child in person is an incredible experience.',
              },
            ].map(item => (
              <div key={item.q} className="border-b border-[#e8e0d4] pb-5">
                <h3 className="font-semibold text-[#0d0d0d] mb-2">{item.q}</h3>
                <p className="text-[#777] text-sm leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="pb-20 px-6">
        <div className="max-w-2xl mx-auto bg-[#0d0d0d] p-10 text-center">
          <h2
            className="text-3xl text-[#FFF8F0] mb-3"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Ready to change a life?
          </h2>
          <p className="text-[#777] mb-6 leading-relaxed">
            Every child deserves someone in their corner. For less than a dollar a day,
            you can be that person.
          </p>
          <a
            href="#top"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="inline-block px-8 py-4 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors"
          >
            Choose a Child to Sponsor
          </a>
        </div>
      </section>

      <BANFooter />
    </div>
  );
}
