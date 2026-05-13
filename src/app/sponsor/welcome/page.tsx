import type { Metadata } from 'next';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { ConfettiBurst } from '@/components/ConfettiBurst';
import { ShareButton } from './ShareButton';

export const metadata: Metadata = {
  title: "Welcome, sponsor | Be A Number",
  description: "Your monthly sponsorship is active. Watch your inbox.",
};

export default function SponsorWelcomePage() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <ConfettiBurst />
      <BANNavigation currentPath="/sponsor/welcome" />

      <main className="py-24 px-6">
        <div className="max-w-2xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">
              Sponsorship Active
            </p>
            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-6 leading-tight"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              You just changed a life.
            </h1>

            <p className="text-lg text-[#555] leading-relaxed mb-6">
              Your sponsorship is active. Within the next business day you&rsquo;ll
              receive an email from Kevin with your sponsor code, your child&rsquo;s
              profile, and a link to the sponsor portal.
            </p>

            <p className="text-[#777] leading-relaxed">
              Keep an eye on your inbox. The first monthly campus newsletter will
              land soon, and photos of your child start arriving over the coming
              months. A handwritten letter from them and a year-end report card
              follow once a year.
            </p>
          </div>

          {/* What your $25 supports each month */}
          <div className="bg-white border border-[#e8e0d4] p-7 md:p-8 mb-8">
            <h3
              className="text-lg text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              What your $25 supports each month
            </h3>
            <div className="space-y-3 text-[#555] text-sm leading-relaxed">
              <div className="flex gap-3 items-start">
                <span className="text-[#D4A843] font-bold flex-shrink-0 mt-0.5">·</span>
                <span>School fees, uniforms, and supplies so they stay enrolled</span>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-[#D4A843] font-bold flex-shrink-0 mt-0.5">·</span>
                <span>Two meals a day on campus</span>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-[#D4A843] font-bold flex-shrink-0 mt-0.5">·</span>
                <span>Medical care through the on-site clinic</span>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-[#D4A843] font-bold flex-shrink-0 mt-0.5">·</span>
                <span>A local mentor who checks in on them weekly</span>
              </div>
            </div>
          </div>

          {/* What happens next */}
          <div className="bg-white border border-[#e8e0d4] p-7 md:p-8 mb-8">
            <h3
              className="text-lg text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              What happens next
            </h3>
            <div className="space-y-4 text-left">
              <div className="flex gap-4 items-start">
                <span
                  className="text-[#D4A843] font-bold text-sm mt-0.5 flex-shrink-0 w-6"
                  style={{ fontFamily: 'var(--font-lora), serif' }}
                >
                  I
                </span>
                <p className="text-[#666] text-sm leading-relaxed">
                  A confirmation email is on its way now with your receipt and sponsor code.
                </p>
              </div>
              <div className="flex gap-4 items-start">
                <span
                  className="text-[#D4A843] font-bold text-sm mt-0.5 flex-shrink-0 w-6"
                  style={{ fontFamily: 'var(--font-lora), serif' }}
                >
                  II
                </span>
                <p className="text-[#666] text-sm leading-relaxed">
                  Within a day, Kevin will email you your child&rsquo;s profile and
                  a link to the sponsor portal, where updates, photos, and letters land.
                </p>
              </div>
              <div className="flex gap-4 items-start">
                <span
                  className="text-[#D4A843] font-bold text-sm mt-0.5 flex-shrink-0 w-6"
                  style={{ fontFamily: 'var(--font-lora), serif' }}
                >
                  III
                </span>
                <p className="text-[#666] text-sm leading-relaxed">
                  Monthly campus newsletters start arriving. Once a year, you get a
                  handwritten letter from your child and their year-end report card.
                </p>
              </div>
            </div>
          </div>

          {/* Tell someone + Follow the story */}
          <div className="bg-white border border-[#e8e0d4] p-7 md:p-8 mb-8">
            <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
              {/* Tell someone */}
              <div className="flex-1">
                <h3
                  className="text-lg text-[#0d0d0d] mb-2"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  Tell someone
                </h3>
                <p className="text-[#666] text-sm leading-relaxed mb-4">
                  Know someone who&rsquo;d care about this? Share it however you want — text, DM, post.
                </p>
                <ShareButton />
              </div>

              {/* Divider */}
              <div className="hidden sm:block w-px bg-[#e8e0d4]" />
              <div className="sm:hidden h-px bg-[#e8e0d4]" />

              {/* Follow the story */}
              <div className="flex-1">
                <h3
                  className="text-lg text-[#0d0d0d] mb-2"
                  style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
                >
                  Follow the story
                </h3>
                <p className="text-[#666] text-sm leading-relaxed mb-4">
                  See the kids, the campus, the shirts in the wild.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="https://instagram.com/beanumber_"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 border border-[#e8e0d4] text-[#0d0d0d] text-sm font-semibold hover:border-[#D4A843]/50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                    Instagram
                  </a>
                  <a
                    href="https://www.facebook.com/beanumber"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 border border-[#e8e0d4] text-[#0d0d0d] text-sm font-semibold hover:border-[#D4A843]/50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    Facebook
                  </a>
                  <a
                    href="https://www.tiktok.com/@beanumber"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 border border-[#e8e0d4] text-[#0d0d0d] text-sm font-semibold hover:border-[#D4A843]/50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48 6.3 6.3 0 001.86-4.49V8.76a8.26 8.26 0 004.84 1.56v-3.45a4.85 4.85 0 01-1.12-.18z"/>
                    </svg>
                    TikTok
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Sign-off + bottom nav */}
          <div className="text-center">
            <div className="w-8 h-px bg-[#D4A843] mx-auto mb-8" />

            <p className="text-[#555] leading-relaxed mb-1">
              Thanks for being a part of this.
            </p>
            <p className="font-semibold text-[#0d0d0d] mb-8">Kevin</p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <a
                href="/impact"
                className="px-8 py-4 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors"
              >
                See the Impact
              </a>
              <a
                href="/founder"
                className="px-8 py-4 bg-transparent text-[#0d0d0d] font-bold uppercase tracking-wider text-sm border border-[#e8e0d4] hover:border-[#D4A843]/50 transition-colors"
              >
                Read the Story
              </a>
            </div>

            <p className="text-[#888] text-xs">
              Cancel anytime from the sponsor portal, no questions asked.
            </p>
          </div>
        </div>
      </main>

      <BANFooter />
    </div>
  );
}
