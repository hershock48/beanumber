/**
 * /market/success — confirmation after a market sale.
 *
 * Buyer walked away with the shirt. This page is shown immediately
 * after Stripe Checkout completes. It does two things:
 *   1. Confirms the sale (so they know payment went through)
 *   2. Tells them what to do next — find the number on the shirt and
 *      look it up at beanumber.org to meet their kid
 *
 * After ~5 seconds it auto-redirects to /market so Kevin can ring up
 * the next customer without tapping anything. The link to beanumber.org
 * stays visible the whole time for the buyer to remember.
 */

import { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = {
  title: 'Thank you — Be A Number',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function MarketSuccessPage() {
  return (
    <main className="min-h-screen bg-[#FFF8F0] flex items-center justify-center px-5 py-12">
      <div className="max-w-md w-full text-center">
        <Logo variant="cross" className="w-16 h-16 text-[#D4A843] mx-auto mb-8" />

        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-4">
          Thank you
        </p>

        <h1
          className="text-4xl text-[#0d0d0d] mb-4 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          Your kid is on the back of your shirt.
        </h1>

        <p
          className="text-lg text-[#0d0d0d] mb-6 italic"
          style={{ fontFamily: 'var(--font-lora), serif' }}
        >
          The shirt is how you meet them. $25 a month is how you stay.
        </p>

        <div className="bg-white border border-[#e8e0d4] p-6 mb-8">
          <p className="text-sm text-[#555] leading-relaxed mb-4">
            Flip the shirt over. Find the number printed below the
            design. Then visit:
          </p>
          <p
            className="text-2xl text-[#0d0d0d] mb-2"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
          >
            beanumber.org
          </p>
          <p className="text-xs text-[#888] leading-relaxed">
            Enter your number. Meet your kid.<br />
            Their letters, photos, and updates land on that page all year.
          </p>
        </div>

        <p className="text-xs text-[#aaa] mb-2">
          A confirmation email is on its way with everything you need.
        </p>

        <Link
          href="/market"
          className="text-sm text-[#D4A843] font-bold uppercase tracking-wider hover:underline"
        >
          ← Next customer
        </Link>
      </div>
    </main>
  );
}
