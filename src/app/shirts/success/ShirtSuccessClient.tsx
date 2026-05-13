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
  itemCount?: number;
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
          itemCount: data.itemCount || 1,
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
    return <ShippingConfirmation shirt={null} alreadySponsoring={false} itemCount={1} note={error} />;
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
      itemCount={status.itemCount || 1}
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
  itemCount = 1,
  note,
}: {
  shirt: OrderStatus['shirt'];
  alreadySponsoring: boolean;
  itemCount?: number;
  note?: string;
}) {
  const multi = itemCount > 1;

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
          {multi ? 'Your shirts are being made.' : 'Your shirt is being made.'}
        </h1>

        <p className="text-lg text-[#555] leading-relaxed max-w-md mx-auto mb-4">
          {multi
            ? <>Expect them within 5&ndash;7 business days. When they arrive, there&rsquo;s a number on each tag &mdash; every number belongs to a real child in Northern Uganda, and they&rsquo;re waiting to meet you.</>
            : <>Expect it within 5&ndash;7 business days. When it arrives, there&rsquo;s a number on the tag &mdash; that number belongs to a real child in Northern Uganda, and they&rsquo;re waiting to meet you.</>}
        </p>

        <p className="text-[#777] leading-relaxed max-w-md mx-auto">
          {alreadySponsoring
            ? 'Your purchase and your sponsorship both support school, meals, and medical care at the YDO campus. You just started something real.'
            : 'Every shirt supports school, meals, and medical care at the YDO campus in Northern Uganda. You just started something real.'}
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
            Today&rsquo;s $25 got you the shirt and started their year at the campus.
            Another $25 will be charged each month going forward, and it supports
            the campus where the child your shirt is tied to goes to school, eats
            meals, and gets medical care.
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
            {multi
              ? 'Your shirts are made to order and ship within 5–7 business days. A confirmation email is on its way to you now.'
              : 'Your shirt is made to order and ships within 5–7 business days. A confirmation email is on its way to you now.'}
          </Step>
          <Step num="II">
            You&rsquo;ll get another email the day {multi ? 'they ship' : 'it ships'}, with tracking.
          </Step>
          <Step num="III">
            When {multi ? 'your shirts arrive, look at the number on each tag' : 'your shirt arrives, look at the number on the tag'}. Go to
            {' '}<code className="text-[#666]">beanumber.org</code>, enter
            {multi ? ' each number' : ' your number'}, and meet the {multi ? 'children wearing them' : 'child wearing it'} with you.
          </Step>
        </div>
      </div>

      {note && (
        <p className="text-[#bbb] text-xs mb-10 max-w-sm mx-auto text-center">{note}</p>
      )}

      {/* Tell someone + Follow the story */}
      <TellSomeone flow={alreadySponsoring ? 'shirt_sponsor' : 'shirt'} />

      {/* Bottom nav */}
      <div className="text-center mt-10">
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Link
            href="/impact"
            className="px-8 py-4 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors"
          >
            See the Impact
          </Link>
          <Link
            href="/founder"
            className="px-8 py-4 bg-transparent text-[#0d0d0d] font-bold uppercase tracking-wider text-sm border border-[#e8e0d4] hover:border-[#D4A843]/50 transition-colors"
          >
            Read the Story
          </Link>
        </div>

        <p className="text-xs text-[#bbb]">
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

// ---------------------------------------------------------------------------
// Tell someone + Follow the story
// ---------------------------------------------------------------------------

const SHARE_MESSAGES: Record<string, string> = {
  shirt:
    'I just bought a shirt from beanumber.org — every shirt is tied to a real kid in Northern Uganda. When it arrives, the number on the tag is my kid. Check it out.',
  shirt_sponsor:
    'I just bought a shirt and started sponsoring a child through beanumber.org — $25/month supports school, meals, and medical care at a campus in Northern Uganda. Worth a look.',
  sponsor:
    'I just started sponsoring a child through beanumber.org — $25/month supports school, meals, and medical care at a campus in Northern Uganda. Worth a look.',
};

function TellSomeone({ flow }: { flow: 'shirt' | 'shirt_sponsor' | 'sponsor' }) {
  const [copied, setCopied] = useState(false);
  const message = SHARE_MESSAGES[flow];

  async function handleShare() {
    // Try native share (mobile), fall back to clipboard
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: message, url: 'https://www.beanumber.org' });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // Clipboard failed silently
      }
    }
  }

  return (
    <div className="bg-white border border-[#e8e0d4] p-7 md:p-8">
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
          <button
            onClick={handleShare}
            className="px-5 py-2.5 bg-[#0d0d0d] text-white text-sm font-semibold hover:bg-[#333] transition-colors"
          >
            {copied ? 'Copied to clipboard' : 'Share'}
          </button>
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
