'use client';

import { useState } from 'react';

/**
 * One tile in the sponsor "Number Collection" grid on /[number].
 *
 * Replaces the legacy `mailto:` flow with a real Stripe Checkout flow:
 * sponsor taps "I want this," the tile expands (only for sized items
 * like hoodies) to pick a size, the size choice POSTs to
 * /api/sponsor/merch-purchase, and the response URL takes them to
 * Stripe Checkout pre-filled with their saved payment method.
 *
 * Hat and stickers don't need a size, so a single tap goes straight to
 * Stripe.
 *
 * Volume here is small enough that there's no Fulfillment row created
 * — the webhook records the Donation and emails Kevin the order
 * details. Kevin makes the item by hand and ships it.
 */
const SIZES = ['S', 'M', 'L', 'XL', '2XL'] as const;
type Size = (typeof SIZES)[number];

export function MerchPurchaseTile({
  merchType,
  shirtNumber,
  sponsorCode,
  itemName,
  detail,
  priceLabel,
  needsSize,
}: {
  merchType: 'hoodie' | 'hat' | 'stickers';
  shirtNumber: number;
  sponsorCode: string;
  itemName: string;
  detail: string;
  priceLabel: string;
  needsSize: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(size?: Size) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sponsor/merch-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsorCode,
          merchType,
          ...(size ? { size } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(data?.error || 'Could not start checkout. Try again.');
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch (err: any) {
      setError(err?.message || 'Network error. Try again.');
      setLoading(false);
    }
  }

  function handlePrimaryTap() {
    if (loading) return;
    if (needsSize) {
      setExpanded(prev => !prev);
      return;
    }
    void startCheckout();
  }

  return (
    <div className="bg-white border border-[#e8e0d4] p-3 md:p-4 transition-colors hover:border-[#D4A843]">
      <div className="aspect-[4/3] bg-[#f5f0e8] flex items-center justify-center mb-3">
        <p
          className="text-3xl md:text-4xl font-bold text-[#D4A843] opacity-30"
          style={{ fontFamily: 'var(--font-lora), serif' }}
        >
          #{shirtNumber}
        </p>
      </div>

      <p
        className="text-sm font-semibold text-[#0d0d0d] mb-0.5"
        style={{ fontFamily: 'var(--font-lora), serif' }}
      >
        {itemName}
      </p>
      <p className="text-xs text-[#999] mb-1">{detail}</p>
      <p className="text-xs text-[#666] mb-3 font-bold">{priceLabel}</p>

      <button
        type="button"
        onClick={handlePrimaryTap}
        disabled={loading}
        className="text-xs font-bold text-[#D4A843] uppercase tracking-wider hover:text-[#c49a3a] transition-colors disabled:opacity-60"
      >
        {loading
          ? 'Loading checkout…'
          : needsSize && expanded
            ? 'Pick a size below'
            : 'Buy → '}
      </button>

      {needsSize && expanded && (
        <div className="mt-3 pt-3 border-t border-[#e8e0d4]">
          <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-[#999] mb-2">
            Size
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SIZES.map(size => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  setSelectedSize(size);
                  void startCheckout(size);
                }}
                disabled={loading}
                className={`px-2.5 py-1.5 text-xs font-semibold border transition-colors ${
                  selectedSize === size
                    ? 'bg-[#0d0d0d] text-white border-[#0d0d0d]'
                    : 'bg-white text-[#555] border-[#e8e0d4] hover:border-[#0d0d0d]'
                } disabled:opacity-60`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
