'use client';

import { useEffect, useState } from 'react';

/**
 * Christmas at the campus: the seasonal card on /[N] and on /christmas.
 *
 * Pooled fund, same gift for every kid (see src/lib/christmas.ts for
 * the reasoning). On a kid page the card still speaks to THIS kid:
 * "every kid gets the same gift, {firstName} included," and after
 * Christmas Simon's team posts a photo of each kid with theirs, which
 * is what makes a shared fund feel personal. On /christmas there is
 * no kid, so the copy speaks to the whole campus.
 *
 * Shown to everyone who can see the page (sponsor, holder, cold
 * visitor). Hidden on departed kids' pages and once the campaign
 * closes; the server decides both and leaves this out of the tree.
 */
export function ChristmasGiftCard({
  shirtNumber,
  firstName,
  year,
  kidCount,
  giftLong,
  amounts,
  perKidCost,
  closesOnLabel,
  overflowNote,
}: {
  /** Omit both on /christmas, where there is no kid in view. */
  shirtNumber?: number;
  firstName?: string;
  year: number;
  kidCount: number;
  giftLong: string;
  amounts: readonly number[];
  perKidCost: number;
  closesOnLabel: string;
  overflowNote: string;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasKid = Boolean(shirtNumber && firstName);

  // Coming back from Stripe via the browser's back button restores
  // this component from bfcache with the button still disabled.
  // Same fix DonationSection uses: clear on focus/visibility.
  useEffect(() => {
    const reset = () => setBusy(null);
    const onVisible = () => {
      if (document.visibilityState === 'visible') reset();
    };
    window.addEventListener('focus', reset);
    window.addEventListener('pageshow', reset);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', reset);
      window.removeEventListener('pageshow', reset);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  async function give(amount: number) {
    setBusy(amount);
    setError(null);
    try {
      const res = await fetch('/api/create-christmas-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          hasKid ? { amount, shirtNumber, childFirstName: firstName } : { amount }
        ),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout.');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(null);
    }
  }

  return (
    <section className="bg-[#1a1208] text-white p-7 md:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
        Christmas {year}
      </p>
      <h2
        className="text-2xl md:text-[28px] mb-3 leading-tight"
        style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
      >
        {hasKid
          ? `Give Christmas to the whole campus. ${firstName} included.`
          : 'Give Christmas to the whole campus.'}
      </h2>
      <p className="text-[#d8cfc1] text-sm md:text-base leading-relaxed mb-2">
        Every one of the {kidCount} kids at Hope Bridge gets the same gift this year: {giftLong}.
        Nobody opens more than anyone else, and nobody goes without.
      </p>
      <p className="text-[#d8cfc1] text-sm md:text-base leading-relaxed mb-5">
        After Christmas, Simon&rsquo;s team photographs every kid with their gift
        {hasKid
          ? ` and the picture lands here on ${firstName}’s page.`
          : ' and each picture lands on that kid’s page.'}{' '}
        One gift is ${perKidCost}. Gifts close {closesOnLabel}.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {amounts.map(amount => {
          const kids = Math.max(1, Math.floor(amount / perKidCost));
          return (
            <button
              key={amount}
              type="button"
              onClick={() => give(amount)}
              disabled={busy !== null}
              className="flex-1 bg-white hover:bg-[#f5f0e8] disabled:opacity-60 text-[#1a1208] px-5 py-3 transition-colors text-left"
            >
              <span className="block text-lg font-bold">${amount}</span>
              <span className="block text-xs uppercase tracking-wider text-[#6b5d4a]">
                {busy === amount ? 'One moment' : kids === 1 ? 'One kid' : `${kids} kids`}
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-[#f3c3b3] mb-3">{error}</p>}

      <p className="text-xs text-[#a89a85] leading-relaxed">{overflowNote}</p>
    </section>
  );
}
