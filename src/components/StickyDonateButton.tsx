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
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 px-4 py-2 sm:px-6 sm:py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-all shadow-lg font-medium text-sm sm:text-base"
    >
      Donate
    </a>
  );
}
