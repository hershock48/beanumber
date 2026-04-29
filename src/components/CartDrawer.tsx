'use client';

import { useState } from 'react';
import { useCart } from './CartContext';

export function CartDrawer() {
  const { items, removeItem, toggleMonthly, clearCart, isOpen, setIsOpen, totalOneTime, totalMonthly, shippingCost, totalWithShipping, itemCount, refCode } = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (items.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/create-cart-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({
            shirtId: i.shirtId,
            color: i.color,
            size: i.size,
            continueMonthly: i.continueMonthly,
          })),
          ...(refCode ? { ref_code: refCode } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong.');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const monthlyCount = items.filter(i => i.continueMonthly).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-[#FFF8F0] shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#e8e0d4]">
          <h2
            className="text-xl text-[#0d0d0d]"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Your shirts ({itemCount})
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 flex items-center justify-center text-[#999] hover:text-[#0d0d0d] transition-colors cursor-pointer"
            aria-label="Close cart"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {items.length === 0 && (
            <div className="text-center py-12 space-y-4">
              <p className="text-[#999]">Your cart is empty.</p>
              <button
                onClick={() => setIsOpen(false)}
                className="text-sm font-semibold text-[#D4A843] hover:text-[#c49a3a] transition-colors cursor-pointer"
              >
                Browse shirts &rarr;
              </button>
            </div>
          )}

          {items.map(item => (
            <div key={item.id} className="border border-[#e8e0d4] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#0d0d0d] text-sm">{item.shirtName}</p>
                  <p className="text-xs text-[#777] mt-0.5">
                    {item.color} &middot; {item.size}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#0d0d0d]">${item.price}</span>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="w-6 h-6 flex items-center justify-center text-[#ccc] hover:text-red-500 transition-colors cursor-pointer"
                    aria-label="Remove item"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Per-item monthly toggle */}
              <button
                type="button"
                onClick={() => toggleMonthly(item.id)}
                className={`mt-3 w-full text-left flex items-center gap-2.5 p-2.5 border transition-all cursor-pointer ${
                  item.continueMonthly
                    ? 'border-[#D4A843] bg-[#D4A843]/5'
                    : 'border-[#e8e0d4] bg-[#faf8f5] hover:border-[#D4A843]/50'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex-shrink-0 w-4 h-4 border flex items-center justify-center transition-colors ${
                    item.continueMonthly
                      ? 'bg-[#D4A843] border-[#D4A843]'
                      : 'bg-white border-[#c9bfae]'
                  }`}
                >
                  {item.continueMonthly && (
                    <svg viewBox="0 0 20 20" fill="none" className="w-3 h-3 text-[#0d0d0d]">
                      <path d="M5 10l3.5 3.5L15 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#0d0d0d]">
                    Stay in their life
                    <span className="text-[#D4A843] ml-1.5">+$25/mo</span>
                  </p>
                </div>
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-[#e8e0d4] px-6 py-5 space-y-4">
            {/* Summary */}
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-[#777]">{itemCount} shirt{itemCount !== 1 ? 's' : ''}</span>
                <span className="font-semibold text-[#0d0d0d]">${totalOneTime}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#777]">Shipping</span>
                <span className={`font-semibold ${shippingCost === 0 ? 'text-green-600' : 'text-[#0d0d0d]'}`}>
                  {shippingCost === 0 ? 'FREE' : `$${shippingCost}`}
                </span>
              </div>
              {shippingCost > 0 && (
                <p className="text-xs text-[#D4A843]">
                  Add {3 - itemCount} more shirt{3 - itemCount !== 1 ? 's' : ''} for free shipping
                </p>
              )}
              <div className="flex justify-between text-sm pt-1 border-t border-[#e8e0d4]">
                <span className="font-semibold text-[#0d0d0d]">Today</span>
                <span className="font-semibold text-[#0d0d0d]">${totalWithShipping}</span>
              </div>
              {monthlyCount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#D4A843]">
                    {monthlyCount} monthly sponsorship{monthlyCount !== 1 ? 's' : ''}
                  </span>
                  <span className="font-semibold text-[#D4A843]">+${totalMonthly}/mo</span>
                </div>
              )}
            </div>

            {monthlyCount > 0 && (
              <p className="text-xs text-[#999] leading-snug">
                ${totalOneTime} charged today. Monthly sponsorships ($25/mo each) start 30 days from now. Cancel anytime.
              </p>
            )}

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              onClick={handleCheckout}
              disabled={loading}
              className={`w-full py-4 font-bold uppercase tracking-wider text-sm transition-colors flex items-center justify-center gap-3 ${
                loading
                  ? 'bg-[#D4A843]/70 text-[#0d0d0d] cursor-wait'
                  : 'bg-[#D4A843] text-[#0d0d0d] hover:bg-[#c49a3a] cursor-pointer'
              }`}
            >
              <span>Checkout &middot; ${totalWithShipping}</span>
              {loading && (
                <svg
                  aria-hidden="true"
                  className="animate-spin h-4 w-4 text-[#0d0d0d]"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
            </button>

            <button
              onClick={() => setIsOpen(false)}
              className="w-full py-3 text-sm font-semibold text-[#0d0d0d] border border-[#e8e0d4] hover:border-[#D4A843] transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
                <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Keep shopping
            </button>

            <p className="text-center text-xs text-[#999] tracking-wide">Free shipping on 3+ shirts</p>

            <button
              onClick={clearCart}
              className="w-full text-center text-xs text-[#999] hover:text-[#555] transition-colors cursor-pointer py-1"
            >
              Clear cart
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** Floating cart button — shows item count, opens the drawer. */
export function CartButton() {
  const { itemCount, setIsOpen } = useCart();

  if (itemCount === 0) return null;

  return (
    <button
      onClick={() => setIsOpen(true)}
      className="fixed bottom-6 right-6 z-30 bg-[#0d0d0d] text-white shadow-lg flex items-center gap-2.5 pl-5 pr-4 py-3.5 hover:bg-[#222] transition-colors cursor-pointer"
      aria-label={`Open cart (${itemCount} items)`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6zM3 6h18M16 10a4 4 0 01-8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-sm font-bold uppercase tracking-wider">{itemCount}</span>
    </button>
  );
}
