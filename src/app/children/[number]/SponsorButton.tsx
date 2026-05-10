'use client';

import { useState } from 'react';

interface SponsorButtonProps {
  childRecordId: string;
  childId: string;
  childDisplayName: string;
  firstName: string;
  /** True when a shirt buyer has been matched to this number. Changes
   *  the button label from cold acquisition to warm retention framing. */
  shirtAssigned?: boolean;
}

export function SponsorButton({
  childRecordId,
  childId,
  childDisplayName,
  firstName,
  shirtAssigned,
}: SponsorButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const response = await fetch('/api/create-sponsor-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childRecordId,
          childId,
          childDisplayName,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start checkout');
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Sponsor checkout error:', err);
      alert(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="block w-full text-center bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-6 hover:bg-[#c49a3a] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading
        ? 'Loading checkout...'
        : shirtAssigned
          ? `Stay in ${firstName}'s story · $25/mo`
          : `Sponsor ${firstName} · $25/mo`}
    </button>
  );
}
