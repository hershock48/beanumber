import type { Metadata } from 'next';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { ConfettiBurst } from '@/components/ConfettiBurst';

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

          {/* What your $25 covers each month */}
          <div className="bg-white border border-[#e8e0d4] p-7 md:p-8 mb-8">
            <h3
              className="text-lg text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              What your $25 covers each month
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

          {/* Sign-off */}
          <div className="text-center">
            <div className="w-8 h-px bg-[#D4A843] mx-auto mb-8" />

            <p className="text-[#555] leading-relaxed mb-1">
              Thanks for being part of this.
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
