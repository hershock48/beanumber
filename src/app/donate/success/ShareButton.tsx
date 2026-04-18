'use client';

import { useState } from 'react';

const SHARE_MESSAGE =
  'I just donated to beanumber.org — a nonprofit running a six-acre campus in Northern Uganda with a school, clinic, and vocational training.';

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: SHARE_MESSAGE, url: 'https://www.beanumber.org' });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(SHARE_MESSAGE);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // Clipboard failed silently
      }
    }
  }

  return (
    <button
      onClick={handleShare}
      className="px-5 py-2.5 bg-[#0d0d0d] text-white text-sm font-semibold hover:bg-[#333] transition-colors"
    >
      {copied ? 'Copied to clipboard' : 'Share'}
    </button>
  );
}
