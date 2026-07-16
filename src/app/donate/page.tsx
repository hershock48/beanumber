import type { Metadata } from 'next';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { DonationSection } from '@/components/DonationSection';

export const metadata: Metadata = {
  alternates: { canonical: '/donate' },
  title: 'Donate',
  description:
    'Your gift supports schools, clinics, vocational training, and trauma recovery in Northern Uganda.',
  openGraph: {
    title: 'Donate | Be A Number',
    description:
      'Your gift supports schools, clinics, vocational training, and trauma recovery in Northern Uganda.',
  },
};

export default function DonatePage() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/donate" />

      <main className="pt-16">
        <section className="pt-16 pb-8 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">
              Give
            </p>
            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-6 leading-tight"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Fund the rebuilding.
            </h1>
            <p className="text-lg text-[#777] max-w-2xl mx-auto leading-relaxed">
              Your gift supports a six-acre campus in Northern Uganda with a school
              built for 380 kids, a medical clinic that has treated 700+ patients,
              and vocational training where 60 women are learning trades.
            </p>
          </div>
        </section>

        <DonationSection />

        <section className="py-16 px-6 border-t border-[#e8e0d4]">
          <div className="max-w-2xl mx-auto text-center">
            <h2
              className="text-2xl md:text-3xl text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Or sponsor a kid for $25/month.
            </h2>
            <p className="text-[#777] leading-relaxed mb-6">
              Every Shirt carries a Number. Every Number is a Child. Get a
              Shirt and meet the kid your Number connects you to.
            </p>
            <a
              href="/shirts"
              className="inline-block px-8 py-4 bg-transparent text-[#0d0d0d] font-bold uppercase tracking-wider text-sm border border-[#e8e0d4] hover:border-[#D4A843]/50 transition-colors"
            >
              Get a Shirt
            </a>
          </div>
        </section>
      </main>

      <BANFooter />
    </div>
  );
}
