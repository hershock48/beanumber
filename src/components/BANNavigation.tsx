'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

interface BANNavigationProps {
  currentPath?: string;
  transparent?: boolean;
}

export function BANNavigation({ currentPath = '/', transparent = false }: BANNavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const showSolid = !transparent || scrolled;

  const navLinks = [
    { href: '/shirts', label: 'Shirts' },
    { href: '/sponsorship', label: 'Sponsor' },
    { href: '/founder', label: 'Story' },
    { href: '/impact', label: 'Impact' },
  ];

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${
        showSolid
          ? 'bg-[#FFF8F0]/95 backdrop-blur-md border-b border-[#e8e0d4]'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-5 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            {/* Before scroll: full # mark. After scroll: extracted cross in gold */}
            <div className="relative h-10 w-10">
              <Logo
                variant="micro"
                className={`absolute inset-0 h-10 w-10 transition-all duration-500 ${
                  scrolled ? 'opacity-0 scale-90' : 'opacity-100 scale-100'
                } text-[#0d0d0d]`}
              />
              <Logo
                variant="cross"
                className={`absolute inset-0 h-10 w-10 transition-all duration-500 ${
                  scrolled ? 'opacity-100 scale-100' : 'opacity-0 scale-110'
                } text-[#D4A843]`}
              />
            </div>
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#0d0d0d]">
              Be A Number
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-xs font-bold uppercase tracking-[0.15em] transition-colors ${
                  currentPath === link.href
                    ? 'text-[#D4A843]'
                    : 'text-[#888] hover:text-[#0d0d0d]'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/donate"
              className="px-5 py-2 bg-[#D4A843] text-[#0d0d0d] text-xs font-bold uppercase tracking-[0.15em] hover:bg-[#c49a3a] transition-colors"
            >
              Donate
            </Link>
          </div>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2"
            aria-label="Toggle menu"
          >
            <svg
              className="w-6 h-6 text-[#0d0d0d]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-[#e8e0d4] pt-4 space-y-1 overflow-hidden">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`block px-3 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors ${
                  currentPath === link.href
                    ? 'text-[#D4A843]'
                    : 'text-[#888] hover:text-[#0d0d0d]'
                }`}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="px-3 pt-2">
              <Link
                href="/donate"
                className="block w-full text-center py-3 bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm hover:bg-[#c49a3a] transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                Donate
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
