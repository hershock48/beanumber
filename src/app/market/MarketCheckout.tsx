'use client';

import { useState } from 'react';

const SHIRTS = [
  { id: 'onyx',    name: 'Onyx',    swatch: '#1a1a1a' },
  { id: 'meadow',  name: 'Meadow',  swatch: '#c8dfc5' },
  { id: 'blossom', name: 'Blossom', swatch: '#f3cfd4' },
  { id: 'sky',     name: 'Sky',     swatch: '#bdd5e5' },
] as const;
type ShirtId = typeof SHIRTS[number]['id'];

const ADULT_SIZES = ['S', 'M', 'L', 'XL', '2XL'] as const;
// Youth run added July 2026. Value = full "Youth S" string (matches
// storage end-to-end); label = short "YS" for the market booth
// checkout which is space-constrained on iPad.
const YOUTH_SIZES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Youth S', label: 'YS' },
  { value: 'Youth M', label: 'YM' },
  { value: 'Youth L', label: 'YL' },
];
type SizeValue = typeof ADULT_SIZES[number] | 'Youth S' | 'Youth M' | 'Youth L';

type CartItem = {
  id: string;            // local UI id for keying
  shirtId: ShirtId;
  size: SizeValue;
  continueMonthly: boolean;
};

const SHIRT_PRICE = 25;

function newItem(): CartItem {
  return {
    id: 'i-' + Math.random().toString(36).slice(2, 10),
    shirtId: 'onyx',
    size: 'M',
    continueMonthly: false,
  };
}

export function MarketCheckout() {
  const [items, setItems] = useState<CartItem[]>([newItem()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalToday    = items.length * SHIRT_PRICE;
  const monthlyCount  = items.filter(i => i.continueMonthly).length;
  const totalMonthly  = monthlyCount * SHIRT_PRICE;

  function patchItem(id: string, patch: Partial<CartItem>) {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  }
  function removeItem(id: string) {
    setItems(prev => (prev.length <= 1 ? prev : prev.filter(it => it.id !== id)));
  }
  function addItem() {
    setItems(prev => (prev.length >= 10 ? prev : [...prev, newItem()]));
  }

  async function handleCheckout() {
    if (items.length === 0) {
      setError('Add at least one shirt.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/create-market-cart-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(it => ({
            shirtId: it.shirtId,
            size: it.size,
            color: (SHIRTS.find(s => s.id === it.shirtId)?.name) || 'Onyx',
            continueMonthly: it.continueMonthly,
          })),
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
    <div className="max-w-md mx-auto px-5 py-6">
      {items.map((item, idx) => (
        <ShirtRow
          key={item.id}
          item={item}
          index={idx}
          canRemove={items.length > 1}
          onPatch={patch => patchItem(item.id, patch)}
          onRemove={() => removeItem(item.id)}
        />
      ))}

      {items.length < 10 && (
        <button
          type="button"
          onClick={addItem}
          className="w-full border-2 border-dashed border-[#D4A843] text-[#D4A843] font-bold py-4 mb-6 tracking-wide hover:bg-[#FFF8F0] transition-colors"
        >
          + ADD ANOTHER SHIRT
        </button>
      )}

      {/* Running total */}
      <div className="bg-[#FFF8F0] border border-[#e8e0d4] p-5 mb-6">
        <div className="flex justify-between items-baseline mb-2">
          <p className="text-xs uppercase tracking-[0.2em] text-[#aaa]">
            Today
          </p>
          <p
            className="text-4xl text-[#0d0d0d]"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
          >
            ${totalToday}
          </p>
        </div>
        <p className="text-xs text-[#666]">
          {items.length} shirt{items.length === 1 ? '' : 's'} · {monthlyCount} sponsored
        </p>
        {monthlyCount > 0 && (
          <p className="text-xs text-[#777] mt-3 pt-3 border-t border-[#e8e0d4]">
            Then <span className="font-bold text-[#0d0d0d]">${totalMonthly}/month</span>{' '}
            ({monthlyCount} sponsorship{monthlyCount === 1 ? '' : 's'}) starting in 30 days
          </p>
        )}
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
        {loading
          ? 'OPENING CHECKOUT…'
          : monthlyCount > 0
            ? `CHARGE $${totalToday} + START MONTHLY`
            : `CHARGE $${totalToday}`}
      </button>

      <p className="text-xs text-[#aaa] text-center mt-4 leading-relaxed">
        Stripe will collect the buyer&rsquo;s email and name on the next
        screen.
      </p>
    </div>
  );
}

function ShirtRow({
  item,
  index,
  canRemove,
  onPatch,
  onRemove,
}: {
  item: CartItem;
  index: number;
  canRemove: boolean;
  onPatch: (patch: Partial<CartItem>) => void;
  onRemove: () => void;
}) {
  const selectedShirt = SHIRTS.find(s => s.id === item.shirtId);

  return (
    <div className="border border-[#e8e0d4] bg-white p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843]">
          Shirt {index + 1}
        </p>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-[#999] hover:text-[#0d0d0d] tracking-wider"
          >
            REMOVE
          </button>
        )}
      </div>

      {/* Color row */}
      <div className="mb-3">
        <div className="grid grid-cols-4 gap-2">
          {SHIRTS.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPatch({ shirtId: s.id })}
              className={`aspect-square border-2 p-1.5 transition-all ${
                item.shirtId === s.id
                  ? 'border-[#D4A843]'
                  : 'border-[#e8e0d4] hover:border-[#aaa]'
              }`}
              aria-pressed={item.shirtId === s.id}
              aria-label={s.name}
            >
              <div className="w-full h-full" style={{ backgroundColor: s.swatch }} />
            </button>
          ))}
        </div>
        <p className="text-xs text-[#777] mt-2 text-center">
          {selectedShirt?.name}
        </p>
      </div>

      {/* Size row — Adult on top, Youth below. Larger buttons for
          the booth-iPad touch target; two rows keep the visual weight
          balanced. */}
      <div className="mb-3">
        <div className="grid grid-cols-5 gap-1.5 mb-1.5">
          {ADULT_SIZES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => onPatch({ size: s })}
              className={`py-3 text-sm font-bold border-2 transition-all ${
                item.size === s
                  ? 'border-[#D4A843] bg-[#FFF8F0] text-[#0d0d0d]'
                  : 'border-[#e8e0d4] bg-white text-[#777] hover:border-[#aaa]'
              }`}
              aria-pressed={item.size === s}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {YOUTH_SIZES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onPatch({ size: value as SizeValue })}
              className={`py-3 text-sm font-bold border-2 transition-all ${
                item.size === value
                  ? 'border-[#D4A843] bg-[#FFF8F0] text-[#0d0d0d]'
                  : 'border-[#e8e0d4] bg-white text-[#777] hover:border-[#aaa]'
              }`}
              aria-pressed={item.size === value}
              aria-label={value}
              title={value}
            >
              {label}
            </button>
          ))}
          {/* Fill the row so grid alignment matches Adult row */}
          <div />
          <div />
        </div>
      </div>

      {/* Monthly toggle per shirt */}
      <button
        type="button"
        onClick={() => onPatch({ continueMonthly: !item.continueMonthly })}
        className={`w-full text-left border-2 p-3 transition-all ${
          item.continueMonthly
            ? 'border-[#D4A843] bg-[#FFF8F0]'
            : 'border-[#e8e0d4] bg-white hover:border-[#aaa]'
        }`}
        aria-pressed={item.continueMonthly}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex-shrink-0 w-5 h-5 border-2 flex items-center justify-center transition-all ${
              item.continueMonthly
                ? 'border-[#D4A843] bg-[#D4A843]'
                : 'border-[#bbb] bg-white'
            }`}
            aria-hidden
          >
            {item.continueMonthly && (
              <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 16 16" fill="none">
                <path d="M3 8L7 12L13 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <p
              className="text-sm text-[#0d0d0d]"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              Stay with this one — $25/mo
            </p>
            <p className="text-[11px] text-[#777] leading-relaxed">
              First charge 30 days from today. Cancel anytime.
            </p>
          </div>
        </div>
      </button>
    </div>
  );
}
