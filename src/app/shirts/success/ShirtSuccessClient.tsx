'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ConfettiBurst } from '@/components/ConfettiBurst';

// The success page intentionally does NOT reveal the child here. The magic
// of Be A Number is the physical shirt arriving with a number on the tag,
// then the buyer entering that number at beanumber.org and meeting the
// child on the fly. Revealing their match on a Stripe confirmation page
// would spoil the entire point of the product.
//
// Instead we show a shipping-coming screen for both flows (shirt-only and
// shirt + monthly sponsorship opt-in). The /api/shirts/order-status call
// is retained only to (a) confirm the order really exists and (b) grab
// the shirt spec and the alreadySponsoring flag from the Stripe session.
// We never show the child's name, photo, or number on this page.

interface OrderStatus {
  shirt: {
    name: string;
    color: string;
    size: string;
  } | null;
  alreadySponsoring?: boolean;
}

export function ShirtSuccessClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError('Missing order reference. If you just completed a purchase, check your email.');
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          '/api/shirts/order-status?session_id=' + encodeURIComponent(sessionId!),
          { cache: 'no-store' }
        );

        if (!res.ok) {
          if (cancelled) return;
          setError('We could not find that order. Check your email for a confirmation.');
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        setStatus({
          shirt: data.shirt || null,
          alreadySponsoring: !!data.alreadySponsoring,
        });
      } catch {
        if (cancelled) return;
        // Network hiccup — fall through to generic confirmation. The user's
        // order is fine; we just couldn't fetch the spec. They'll still get
        // the email.
        setStatus({ shirt: null, alreadySponsoring: false });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (error) {
    return <ShippingConfirmation shirt={null} alreadySponsoring={false} note={error} />;
  }

  // Brief loading state — the API call is fast, so this rarely sticks.
  if (!status) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center gap-3 text-[#aaa] text-sm">
          <span className="w-4 h-4 border-2 border-[#D4A843] border-t-transparent rounded-full animate-spin" />
          Loading your order…
        </div>
      </div>
    );
  }

  return (
    <ShippingConfirmation
      shirt={status.shirt}
      alreadySponsoring={!!status.alreadySponsoring}
    />
  );
}

// ---------------------------------------------------------------------------
// The single confirmation view. No child reveal. The reveal happens when
// the shirt arrives and the buyer enters their number at /children/{n}.
// ---------------------------------------------------------------------------

function ShippingConfirmation({
  shirt,
  alreadySponsoring,
  note,
}: {
  shirt: OrderStatus['shirt'];
  alreadySponsoring: boolean;
  note?: string;
}) {
  return (
    <div>
      {/* Confetti on successful orders (not error state) */}
      {!note && <ConfettiBurst />}
      {/* Hero */}
      <div className="text-center mb-10">
        <Logo variant="cross" className="w-14 h-14 text-[#D4A843] mx-auto mb-8" />

        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-4">
          Order confirmed
        </p>

        <h1
          className="text-3xl md:text-4xl text-[#0d0d0d] mb-4"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          Your shirt is being made.
        </h1>

        <p className="text-lg text-[#777] leading-relaxed max-w-md mx-auto">
          We&rsquo;ll ship it by hand within 5&ndash;7 business days. When it
          arrives, there&rsquo;s a number on the tag — that number belongs to
          a real child in Northern Uganda, and they&rsquo;re waiting to meet
          you.
        </p>

        {shirt && (
          <p className="text-[#aaa] text-sm mt-6">
            {shirt.name}
            {shirt.color ? ' · ' + shirt.color : ''}
            {shirt.size ? ' · Size ' + shirt.size : ''}
          </p>
        )}
      </div>

      {/* Monthly sponsorship confirmation — only if they opted in */}
      {alreadySponsoring && (
        <div className="bg-white border border-[#e8e0d4] p-7 md:p-8 mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
            You opted to keep sponsoring
          </p>
          <h3
            className="text-xl text-[#0d0d0d] mb-3"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Your monthly sponsorship is active.
          </h3>
          <p className="text-[#666] text-sm leading-relaxed mb-3">
            Today&rsquo;s $25 covered your shirt and the first month. Another
            $25 will be charged each month going forward, and it goes straight
            to school, meals, and medical care for the child your shirt is
            tied to.
          </p>
          <p className="text-[#666] text-sm leading-relaxed mb-3">
            You&rsquo;ll get a <strong>sponsor code</strong> by email shortly
            — that&rsquo;s your key to the sponsor portal, where updates,
            photos, and letters will land over the coming months.
          </p>
          <p className="text-[#888] text-xs leading-relaxed">
            Cancel anytime from the sponsor portal, no questions asked.
          </p>
        </div>
      )}

      {/* What happens next */}
      <div className="bg-white border border-[#e8e0d4] p-7 mb-10">
        <h3
          className="text-lg text-[#0d0d0d] mb-4"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          What happens next
        </h3>
        <div className="space-y-4 text-left">
          <Step num="I">
            We&rsquo;ll make your shirt by hand and ship it within 5–7 business
            days. A confirmation email is on its way to you now.
          </Step>
          <Step num="II">
            You&rsquo;ll get another email the day it ships, with tracking.
          </Step>
          <Step num="III">
            When your shirt arrives, look at the number on the tag. Go to
            {' '}<code className="text-[#666]">beanumber.org</code>, enter
            your number, and meet the child wearing it with you.
          </Step>
        </div>
      </div>

      {note && (
        <p className="text-[#bbb] text-xs mb-10 max-w-sm mx-auto text-center">{note}</p>
      )}

      {/* Soft exit */}
      <div className="text-center">
        <Link
          href="/"
          className="text-[#aaa] text-sm hover:text-[#D4A843] transition-colors underline underline-offset-4"
        >
          Back to home
        </Link>
        <p className="text-xs text-[#bbb] mt-6">
          Questions? Email{' '}
          <a
            href="mailto:kevin@beanumber.org"
            className="text-[#D4A843] hover:underline"
          >
            kevin@beanumber.org
          </a>
        </p>
      </div>
    </div>
  );
}

function Step({ num, children }: { num: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 items-start">
      <span
        className="text-[#D4A843] font-bold text-sm mt-0.5 flex-shrink-0 w-6"
        style={{ fontFamily: 'var(--font-lora), serif' }}
      >
        {num}
      </span>
      <p className="text-[#666] text-sm leading-relaxed">{children}</p>
    </div>
  );
}
