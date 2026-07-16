import Link from 'next/link';
import type { Metadata } from 'next';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';

export const metadata: Metadata = {
  title: 'Gift a Sponsorship',
  description:
    'Sponsor a child in someone else’s honor. They meet a real kid at the campus in Northern Uganda — a name, a face, a story. No pressure to continue, just an invitation.',
};

export default function GiftLandingPage() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/gift" />

      <main className="max-w-4xl mx-auto px-5 py-12 md:py-20">
        <div className="text-center mb-10 md:mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-5">Give</p>
          <h1
            className="text-4xl md:text-5xl lg:text-6xl text-[#0d0d0d] mb-5 leading-tight"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Give someone a child to know.
          </h1>
          <p className="text-lg text-[#666] max-w-2xl mx-auto leading-relaxed">
            A real kid at the campus in Northern Uganda. A name, a face, a year you walk through together.
            Choose how it arrives.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Gift Sponsorship — live */}
          <Link
            href="/gift/sponsorship"
            className="group block bg-white border border-[#e8e0d4] hover:border-[#D4A843] transition-colors p-7 md:p-8"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
              Send now
            </p>
            <h2
              className="text-2xl md:text-3xl text-[#0d0d0d] mb-3"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Gift a sponsorship.
            </h2>
            <p className="text-[#666] leading-relaxed mb-6">
              $25 supports a child&rsquo;s first month at the campus. The person you&rsquo;re gifting to
              gets an email introducing them to a specific kid whose first month they&rsquo;re covering.
              They can stay at $25/month if they want to &mdash; entirely their choice, no obligation.
            </p>
            <div className="flex items-baseline gap-1 mb-5">
              <span
                className="text-3xl text-[#D4A843]"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
              >
                $25
              </span>
              <span className="text-[#aaa] text-sm">&middot; one-time</span>
            </div>
            <p className="text-sm font-bold uppercase tracking-wider text-[#0d0d0d] group-hover:text-[#D4A843] transition-colors">
              Start a gift &rarr;
            </p>
          </Link>

          {/* Gift Shirt — coming soon */}
          <div className="block bg-white border border-[#e8e0d4] p-7 md:p-8 opacity-70">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#aaa] mb-3">
              Coming soon
            </p>
            <h2
              className="text-2xl md:text-3xl text-[#0d0d0d] mb-3"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Gift a shirt.
            </h2>
            <p className="text-[#666] leading-relaxed mb-6">
              The full BAN experience as a gift: a numbered shirt shipped to your recipient, with a
              specific kid&rsquo;s number pressed on the back. We&rsquo;re building this for the holiday window &mdash;
              check back, or grab the digital gift sponsorship for now.
            </p>
            <div className="flex items-baseline gap-1 mb-5">
              <span
                className="text-3xl text-[#888]"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
              >
                $25
              </span>
              <span className="text-[#aaa] text-sm">&middot; ships to recipient</span>
            </div>
            <p className="text-sm font-bold uppercase tracking-wider text-[#aaa]">
              In development
            </p>
          </div>
        </div>

        {/* How it works */}
        <section className="mt-16 md:mt-24 bg-white border border-[#e8e0d4] p-7 md:p-10">
          <h2
            className="text-2xl text-[#0d0d0d] mb-6 text-center"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            How a gift sponsorship works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-7 md:gap-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#D4A843] mb-2">Step 1</p>
              <p
                className="text-lg text-[#0d0d0d] mb-2"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                You give $25.
              </p>
              <p className="text-sm text-[#666] leading-relaxed">
                Pick who it&rsquo;s for, write a quick note if you want, and check out. The first month is
                covered immediately.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#D4A843] mb-2">Step 2</p>
              <p
                className="text-lg text-[#0d0d0d] mb-2"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                They meet a child.
              </p>
              <p className="text-sm text-[#666] leading-relaxed">
                We email your recipient a number and a link. They click through and meet the specific kid
                that number belongs to &mdash; name, face, story.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#D4A843] mb-2">Step 3</p>
              <p
                className="text-lg text-[#0d0d0d] mb-2"
                style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
              >
                They decide.
              </p>
              <p className="text-sm text-[#666] leading-relaxed">
                $25/month to stay with the child all year, or just keep the introduction. The relationship
                belongs to them now &mdash; no pressure, no guilt-trip, cancel anytime.
              </p>
            </div>
          </div>
        </section>

        <p className="text-center text-xs text-[#aaa] mt-10 max-w-2xl mx-auto leading-relaxed">
          Your $25 is tax-deductible. If your recipient continues at $25/month, those donations are their own
          and they receive separate receipts.
        </p>
      </main>

      <BANFooter />
    </div>
  );
}
