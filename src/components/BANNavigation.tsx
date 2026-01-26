'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Logo } from './Logo';

interface BANNavigationProps {
  currentPath?: string;
  showDonateButton?: boolean;
}

export function BANNavigation({ currentPath, showDonateButton = true }: BANNavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aboutDropdownOpen, setAboutDropdownOpen] = useState(false);

  const isActive = (href: string) => currentPath === href;

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Logo className="h-8 w-8 text-gray-900" />
            <span className="text-xl font-semibold text-gray-900">Be A Number</span>
          </Link>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {/* About Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setAboutDropdownOpen(true)}
              onMouseLeave={() => setAboutDropdownOpen(false)}
            >
              <button
                className={`flex items-center gap-1 transition-colors ${
                  isActive('/about') || isActive('/founder') || isActive('/governance')
                    ? 'text-gray-900 font-medium'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                About
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {aboutDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2">
                  <Link
                    href="/about"
                    className="block px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    About Us
                  </Link>
                  <Link
                    href="/founder"
                    className="block px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    Our Founder
                  </Link>
                  <Link
                    href="/governance"
                    className="block px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    Governance & Financials
                  </Link>
                  <Link
                    href="/ydo"
                    className="block px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    YDO Uganda
                  </Link>
                </div>
              )}
            </div>
            
            <Link 
              href="/impact" 
              className={`transition-colors ${
                isActive('/impact') ? 'text-gray-900 font-medium' : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Impact
            </Link>
            
            <Link 
              href="/partnerships" 
              className={`transition-colors ${
                isActive('/partnerships') ? 'text-gray-900 font-medium' : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Partnerships
            </Link>
            
            <Link 
              href="/sponsorship" 
              className={`transition-colors ${
                isActive('/sponsorship') ? 'text-gray-900 font-medium' : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Sponsor
            </Link>
            
            {showDonateButton && (
              <Link
                href="/#donate"
                className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
              >
                Donate
              </Link>
            )}
          </div>
          
          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-3">
            {showDonateButton && (
              <Link
                href="/#donate"
                className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm"
              >
                Donate
              </Link>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-700 p-2 -mr-2"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-gray-100 pt-4">
            <div className="flex flex-col gap-1">
              <div className="px-3 py-2 text-sm font-semibold text-gray-500 uppercase tracking-wider">
                About
              </div>
              <Link
                href="/about"
                onClick={() => setMobileMenuOpen(false)}
                className={`px-6 py-2 rounded-md transition-colors ${
                  isActive('/about')
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                About Us
              </Link>
              <Link
                href="/founder"
                onClick={() => setMobileMenuOpen(false)}
                className={`px-6 py-2 rounded-md transition-colors ${
                  isActive('/founder')
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Our Founder
              </Link>
              <Link
                href="/governance"
                onClick={() => setMobileMenuOpen(false)}
                className={`px-6 py-2 rounded-md transition-colors ${
                  isActive('/governance')
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Governance & Financials
              </Link>
              <Link
                href="/ydo"
                onClick={() => setMobileMenuOpen(false)}
                className={`px-6 py-2 rounded-md transition-colors ${
                  isActive('/ydo')
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                YDO Uganda
              </Link>
              
              <div className="mt-3 pt-3 border-t border-gray-100">
                <Link
                  href="/impact"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md transition-colors ${
                    isActive('/impact')
                      ? 'bg-gray-100 text-gray-900 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Impact
                </Link>
                <Link
                  href="/partnerships"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md transition-colors ${
                    isActive('/partnerships')
                      ? 'bg-gray-100 text-gray-900 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Partnerships
                </Link>
                <Link
                  href="/sponsorship"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md transition-colors ${
                    isActive('/sponsorship')
                      ? 'bg-gray-100 text-gray-900 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Sponsor a Child
                </Link>
                <Link
                  href="/contact"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md transition-colors ${
                    isActive('/contact')
                      ? 'bg-gray-100 text-gray-900 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Contact
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
