'use client';

import { useState } from 'react';

const SHIRTS = [
  { id: 'onyx',    name: 'Onyx',    swatch: '#1a1a1a' },
  { id: 'meadow',  name: 'Meadow',  swatch: '#c8dfc5' },
  { id: 'blossom', name: 'Blossom', swatch: '#f3cfd4' },
  { id: 'sky',     name: 'Sky',     swatch: '#bdd5e5' },
] as const;

const SIZES = ['S', 'M', 'L', 'XL', '2XL'] as const;

export function MarketCheckout() {
  const [shirtId, setShirtId] = useState<string>('onyx');
  const [size, setSize] = useState<string>('M');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedShirt = SHIRTS.find(s => s.id === shirtId);

  async function handleCheckout() {
    if (!shirtId || !size) {
      setError('Pick a color and size.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/create-market-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shirtId,
          size,
          color: selectedShirt?.name || 'Onyx',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed.');
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-5 py-8">
      {/* Color */}
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
          Color
        </p>
        <div className="grid grid-cols-4 gap-3">
          {SHIRTS.map(shirt => (
            <button
              key={shirt.id}
              type="button"
              onClick={() => setShirtId(shirt.id)}
              className={`aspect-square border-2 p-2 transition-all ${
                shirtId === shirt.id
                  ? 'border-[#D4A843] shadow-md'
                  : 'border-[#e8e0d4] hover:border-[#aaa]'
              }`}
              aria-pressed={shirtId === shirt.id}
              aria-label={shirt.name}
            >
              <div
                className="w-full h-full"
                style={{ backgroundColor: shirt.swatch }}
              />
            </button>
          ))}
        </div>
        <p className="text-center text-sm text-[#666] mt-3">
          {selectedShirt?.name}
        </p>
      </div>

      {/* Size */}
      <div className="mb-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
          Size
        </p>
        <div className="grid grid-cols-5 gap-2">
          {SIZES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={`py-4 text-base font-bold border-2 transition-all ${
                size === s
                  ? 'border-[#D4A843] bg-[#FFF8F0] text-[#0d0d0d]'
                  : 'border-[#e8e0d4] bg-white text-[#777] hover:border-[#aaa]'
              }`}
              aria-pressed={size === s}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Price summary */}
      <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-5 mb-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
          Total
        </p>
        <p
          className="text-5xl text-[#0d0d0d]"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
        >
          $25
        </p>
        <p className="text-sm text-[#666] mt-2">
          {selectedShirt?.name} · Size {size}
        </p>
      </div>

      {error && (
        <p className="text-red-700 text-sm text-center mb-4">{error}</p>
      )}

      <button
        type="button"
        onClick={handleCheckout}
        disabled={loading}
        className="w-full bg-[#D4A843] text-[#0d0d0d] font-bold py-5 text-lg tracking-wide disabled:opacity-60 transition-opacity"
      >
        {loading ? 'OPENING CHECKOUT…' : 'CHARGE $25'}
      </button>

      <p className="text-xs text-[#aaa] text-center mt-4 leading-relaxed">
        Stripe will collect the buyer&rsquo;s email and name on the next
        screen so they get the post-purchase drip + can claim their number
        at beanumber.org/[N] when they get home.
      </p>
    </div>
  );
}
