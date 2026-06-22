/**
 * Public campus newsfeed — the dedicated home for the campus
 * newsletter. Same content that renders on every kid's /[N] page,
 * but framed for readers who don't have a specific kid yet:
 * legacy donors, search visitors, people researching BAN before
 * they buy.
 *
 * The kid-page newsfeed handles the "I have a relationship with
 * this kid" audience. /news handles the "I care about the campus
 * but don't have a number yet" audience. Both surfaces pull from
 * the same getRecentCampusNewsletters fetcher.
 *
 * Email send loop directs legacy donors here so they don't have
 * to type a random number into a slot machine.
 */

import Link from 'next/link';
import type { Metadata } from 'next';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { CampusNewsfeed } from '@/app/children/[number]/CampusNewsfeed';
import { getRecentCampusNewsletters } from '@/lib/newsletter-feed';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Campus news | Be A Number',
  description:
    'Monthly updates from the campus in Omoro District, Northern Uganda — what the school, clinic, and kids are doing this month.',
  openGraph: {
    title: 'Campus news | Be A Number',
    description:
      'Monthly updates from the campus in Omoro District, Northern Uganda.',
  },
};

export default async function NewsPage() {
  const newsletters = await getRecentCampusNewsletters();
  const hasContent = newsletters.length > 0;

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/news" />

      {/* Top conversion strip — quick path to the shirt for /news
          readers who haven't bought yet. Sits above the page
          header so it catches them before they invest in the read. */}
      <div className="bg-white border-y border-[#e8e0d4]">
        <div className="max-w-5xl mx-auto px-5 py-2.5 flex items-center justify-center gap-2 flex-wrap text-sm text-[#444]">
          <span>Don&rsquo;t have your Shirt yet?</span>
          <Link
            href="/shirts"
            className="font-bold text-[#D4A843] hover:text-[#0d0d0d] transition-colors"
          >
            Order here →
          </Link>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-5 py-10 md:py-16">
        {/* Header */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-[#aaa] hover:text-[#D4A843] transition-colors mb-8"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          Back to home
        </Link>

        <div className="max-w-2xl mb-10 md:mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
            From the campus
          </p>
          <h1
            className="text-4xl md:text-5xl text-[#0d0d0d] leading-tight mb-4"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            What&rsquo;s happening on the ground.
          </h1>
          <p className="text-lg text-[#555] leading-relaxed">
            One letter a month from Kevin and the team in Omoro
            District. The school, the clinic, the cooks, the kids
            &mdash; what&rsquo;s actually moving in Northern Uganda
            right now.
          </p>
        </div>

        {/* Feed */}
        {hasContent ? (
          <CampusNewsfeed firstName="the campus" newsletters={newsletters} />
        ) : (
          <div className="bg-white border border-[#e8e0d4] p-8 md:p-12 text-center">
            <p
              className="text-2xl text-[#0d0d0d] leading-snug mb-2"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              The first letter is on the way.
            </p>
            <p className="text-[#666] leading-relaxed max-w-md mx-auto">
              Once the first newsletter goes out, it&rsquo;ll live
              here and on every kid&rsquo;s page on the site.
            </p>
          </div>
        )}

        {/* Bottom CTAs — relationship paths into the rest of BAN */}
        <section className="mt-16 md:mt-20 grid md:grid-cols-2 gap-4 md:gap-5">
          <Link
            href="/shirts"
            className="block bg-white border border-[#e8e0d4] p-6 md:p-7 hover:border-[#D4A843] transition-colors group"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
              Be a Number
            </p>
            <p
              className="text-xl text-[#0d0d0d] leading-snug mb-2"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Get a Shirt. Meet your kid.
            </p>
            <p className="text-sm text-[#666] leading-relaxed mb-3">
              Every Shirt has a Number printed on the back. That
              Number belongs to a real kid at the campus. Yours
              becomes yours when the Shirt arrives.
            </p>
            <p className="text-sm font-bold text-[#D4A843] group-hover:text-[#0d0d0d] transition-colors">
              Shop the Shirts →
            </p>
          </Link>

          <Link
            href="/shirts"
            className="block bg-white border border-[#e8e0d4] p-6 md:p-7 hover:border-[#D4A843] transition-colors group"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-2">
              Become a sponsor
            </p>
            <p
              className="text-xl text-[#0d0d0d] leading-snug mb-2"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              $25/month keeps a kid in school.
            </p>
            <p className="text-sm text-[#666] leading-relaxed mb-3">
              Every Shirt carries a Number, every Number is a Child.
              Get a Shirt to meet yours and start a $25/month
              sponsorship. Cancel anytime.
            </p>
            <p className="text-sm font-bold text-[#D4A843] group-hover:text-[#0d0d0d] transition-colors">
              Get a Shirt →
            </p>
          </Link>
        </section>
      </main>

      <BANFooter />
    </div>
  );
}
