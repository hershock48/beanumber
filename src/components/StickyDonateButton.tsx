'use client';

import { useEffect, useState } from 'react';

export function StickyDonateButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setIsVisible(scrollPosition > 400);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <a
      href="#donate"
      className="fixed bottom-6 right-6 z-50 px-6 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-all shadow-lg font-medium"
    >
      Donate
    </a>
  );
}
