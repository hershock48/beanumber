import type { Metadata } from 'next';
import Link from 'next/link';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { GiftSponsorshipForm } from './GiftSponsorshipForm';

export const metadata: Metadata = {
  title: 'Gift a Sponsorship',
  description:
    'Sponsor a child in someone’s honor. They meet a real kid at the campus, $25 starts the year, continuation is their choice.',
};

export default function GiftSponsorshipPage() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/gift" />

      <main className="max-w-3xl mx-auto px-5 py-12 md:py-20">
        <Link
          href="/gift"
          className="inline-flex items-center gap-2 text-sm text-[#aaa] hover:text-[#D4A843] transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </Link>

        <div className="text-center mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-4">
            Gift a sponsorship
          </p>
          <h1
            className="text-3xl md:text-4xl lg:text-5xl text-[#0d0d0d] mb-4 leading-tight"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Give them a child to know.
          </h1>
          <p className="text-base md:text-lg text-[#666] max-w-xl mx-auto leading-relaxed">
            $25 covers a real child&rsquo;s first month at the campus and matches your recipient
            to them. They&rsquo;ll get an email with their number, meet their child, and decide whether
            to stay at $25/month from there.
          </p>
        </div>

        <div className="bg-white border border-[#e8e0d4] p-6 md:p-8">
          <GiftSponsorshipForm />
        </div>

        <p className="text-center text-xs text-[#aaa] mt-8 max-w-xl mx-auto leading-relaxed">
          Your $25 is tax-deductible to the extent allowed by law. Be A Number, International, EIN 93-1948872.
          If your recipient continues at $25/month, those donations belong to them and they receive separate
          receipts.
        </p>
      </main>

      <BANFooter />
    </div>
  );
}
