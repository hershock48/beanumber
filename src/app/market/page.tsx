/**
 * /market — in-person checkout page for farmers markets, pop-ups, etc.
 *
 * Designed for Kevin's phone at the booth OR the buyer's phone after
 * scanning a booth QR code. Tap a color, tap a size, tap "Charge $25,"
 * hand over (or keep) the phone for the customer to enter card details
 * in Stripe Checkout. No shipping address — the shirt is in hand.
 *
 * Downstream contract is identical to the standard shirt purchase:
 *   - Stripe Customer is created, payment method saved off_session
 *   - Email + name collected natively by Stripe Checkout
 *   - Webhook fires the standard post-purchase pipeline (drip,
 *     /[N] claim path, etc.)
 *   - order_type metadata = 'market' so downstream branches can
 *     route differently in the future without touching this page
 */

import { Metadata } from 'next';
import { MarketCheckout } from './MarketCheckout';

export const metadata: Metadata = {
  title: 'Buy a Shirt — Be A Number',
  // Don't index this page — it's for in-person sales only
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function MarketPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-5 pt-10 pb-6 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3">
          Market Checkout
        </p>
        <h1
          className="text-3xl text-[#0d0d0d] mb-2 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          One Shirt. One Kid.
        </h1>
        <p
          className="text-base text-[#666] mt-3 mb-1 italic leading-snug"
          style={{ fontFamily: 'var(--font-lora), serif' }}
        >
          The shirt is how you meet them.
        </p>
        <p
          className="text-sm text-[#888] italic"
          style={{ fontFamily: 'var(--font-lora), serif' }}
        >
          Marshall, Michigan → Northern Uganda
        </p>
      </div>

      <MarketCheckout />

      <footer className="max-w-md mx-auto px-5 pb-12 pt-4 text-center">
        <p className="text-xs text-[#aaa]">
          Be A Number · 501(c)(3) · beanumber.org
        </p>
      </footer>
    </main>
  );
}
