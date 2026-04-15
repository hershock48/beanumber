import type { Metadata } from 'next';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';

export const metadata: Metadata = {
  title: "Welcome, sponsor | Be A Number",
  description: "Your monthly sponsorship is active. Watch your inbox.",
};

export default function SponsorWelcomePage() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/sponsor/welcome" />

      <main className="py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
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

          <p className="text-[#777] leading-relaxed mb-10">
            Keep an eye on your inbox. The first monthly campus newsletter will
            land soon, and photos of your child start arriving over the coming
            months. A handwritten letter from them and a year-end report card
            follow once a year.
          </p>

          <div className="w-8 h-px bg-[#D4A843] mx-auto mb-10" />

          <p className="text-[#555] leading-relaxed">
            Thanks for being part of this.<br />
            <span className="font-semibold text-[#0d0d0d]">Kevin</span>
          </p>

          <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
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
        </div>
      </main>

      <BANFooter />
    </div>
  );
}
