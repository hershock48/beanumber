'use client';

import { useState } from 'react';

/**
 * Memo §11 Gift Sponsorship form. Collects gifter + recipient + optional
 * message, then hands off to the gift-checkout endpoint which creates a
 * Stripe Checkout Session for the $25 gift. The webhook (gift_sponsorship
 * branch) handles assignment, recipient email, and the gifter
 * confirmation downstream.
 */
export function GiftSponsorshipForm() {
  const [gifterName, setGifterName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!recipientName.trim() || !recipientEmail.trim()) {
      setError('Please add the recipient’s name and email so we can send them their child.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/create-gift-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'sponsorship',
          gifterName: gifterName.trim(),
          recipientName: recipientName.trim(),
          recipientEmail: recipientEmail.trim(),
          giftMessage: giftMessage.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not start checkout.');
        setSubmitting(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError('No checkout URL returned.');
      setSubmitting(false);
    } catch (err: any) {
      setError(err?.message || 'Network error.');
      setSubmitting(false);
    }
  }

  const labelClass = 'block text-xs font-bold uppercase tracking-wider text-[#999] mb-1.5';
  const inputClass =
    'w-full px-4 py-3 text-base text-[#0d0d0d] bg-white border border-[#e8e0d4] placeholder-[#bbb] focus:outline-none focus:border-[#D4A843] disabled:opacity-60';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Gifter info */}
      <div>
        <label className={labelClass} htmlFor="gift-from">Your name (optional)</label>
        <input
          id="gift-from"
          type="text"
          value={gifterName}
          onChange={(e) => setGifterName(e.target.value)}
          placeholder="So they know who it's from"
          maxLength={120}
          disabled={submitting}
          className={inputClass}
        />
      </div>

      <div className="border-t border-[#f0e8d8] pt-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
          Who&rsquo;s it for?
        </p>

        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="gift-recipient-name">Recipient name</label>
            <input
              id="gift-recipient-name"
              type="text"
              required
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Mom, Sarah, your godson…"
              maxLength={120}
              disabled={submitting}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="gift-recipient-email">Recipient email</label>
            <input
              id="gift-recipient-email"
              type="email"
              required
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="they@example.com"
              maxLength={255}
              disabled={submitting}
              className={inputClass}
            />
            <p className="text-xs text-[#aaa] mt-1.5">
              We&rsquo;ll send their gift to this email after checkout. Double-check the spelling.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-[#f0e8d8] pt-5">
        <label className={labelClass} htmlFor="gift-message">Personal note (optional)</label>
        <textarea
          id="gift-message"
          value={giftMessage}
          onChange={(e) => setGiftMessage(e.target.value)}
          placeholder="A line or two they'll see in the gift email. Birthday wish, why you picked this for them, anything."
          maxLength={500}
          rows={4}
          disabled={submitting}
          className={inputClass + ' resize-none'}
        />
        <p className="text-xs text-[#aaa] mt-1.5 text-right">
          {giftMessage.length} / 500
        </p>
      </div>

      <div className="border-t border-[#f0e8d8] pt-5">
        <div className="flex items-baseline justify-between mb-5">
          <span className="text-sm text-[#666]">Total today</span>
          <span
            className="text-3xl text-[#D4A843]"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}
          >
            $25
          </span>
        </div>

        {error && (
          <p className="text-sm text-red-600 mb-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className={`block w-full text-center bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-6 hover:bg-[#c49a3a] transition-colors ${
            submitting ? 'opacity-60 cursor-not-allowed' : ''
          }`}
        >
          {submitting ? 'Starting checkout…' : 'Send the gift · $25'}
        </button>

        <p className="text-center text-xs text-[#aaa] mt-3 leading-relaxed">
          Their first month is covered. Continuation is their choice &mdash; no obligation, ever.
        </p>
      </div>
    </form>
  );
}
