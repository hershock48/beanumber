'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { UnreadYourKidsDot } from '@/components/UnreadYourKidsDot';

interface BANNavigationClientProps {
  currentPath?: string;
  transparent?: boolean;
  /** True when the viewer has a valid sponsor_session cookie. The
      "Sign in" link gets replaced with a "Sign out" form that POSTs
      to /api/sponsor/logout. */
  signedIn?: boolean;
}

export function BANNavigationClient({
  currentPath = '/',
  transparent = false,
  signedIn: signedInProp,
}: BANNavigationClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);

  // signedIn is single-sourced from local state. We initialize from
  // the prop (server-rendered pages pass true/false; client-rendered
  // pages leave it undefined and we initialize to false). After mount,
  // updates flow through here: the one-shot fetch for client pages,
  // BroadcastChannel sync from other tabs, and visibilitychange
  // re-checks.
  //
  // Previous version computed `signedIn = signedInProp ?? resolvedSignedIn`
  // which froze any page rendered server-side at the SSR-time prop value
  // forever &mdash; if the user signed in elsewhere, this tab couldn't catch
  // up until it was reloaded.
  const [signedIn, setSignedIn] = useState<boolean>(signedInProp ?? false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Publish the navbar&rsquo;s actual rendered height as --nav-height on the
  // document root so the sticky strip below us can offset itself
  // correctly. The navbar grows when the mobile menu opens, so we
  // track real height with ResizeObserver instead of hardcoding 72 px
  // everywhere. Falls back to the static value when ResizeObserver
  // isn&rsquo;t available.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const setHeight = (h: number) => {
      document.documentElement.style.setProperty('--nav-height', `${h}px`);
    };
    setHeight(el.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setHeight((entry.target as HTMLElement).offsetHeight);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (signedInProp !== undefined) return;
    let cancelled = false;
    fetch('/api/session/status', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data && typeof data.signedIn === 'boolean') {
          setSignedIn(data.signedIn);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [signedInProp]);

  // Multi-tab auth sync. When the user signs out in one tab, push a
  // message via BroadcastChannel so other tabs flip their nav state
  // immediately instead of staying stuck on "Sign out" until the
  // user navigates. Same channel listens for sign-in confirmations
  // so a magic-link callback in one tab pulls the others into the
  // authed state without a refresh.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel('ban-auth');
    } catch {
      return;
    }
    channel.onmessage = event => {
      if (event.data?.type === 'signout') setSignedIn(false);
      else if (event.data?.type === 'signin') setSignedIn(true);
    };
    return () => {
      try { channel.close(); } catch {}
    };
  }, []);

  // Visibility fallback: when this tab regains focus, re-check session
  // status. Catches the case where the user signed out in another tab
  // that didn&rsquo;t fire BroadcastChannel (older browsers, no-JS submit
  // flow, etc.).
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/session/status', { credentials: 'same-origin' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && typeof data.signedIn === 'boolean') {
            setSignedIn(data.signedIn);
          }
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const handleSignOut = useCallback(async (e: React.FormEvent) => {
    // Intercept the form submit so we can broadcast to other tabs
    // before navigating. The native form fallback still works if JS
    // is disabled &mdash; we keep the action/method on the <form> as the
    // server-side handler.
    e.preventDefault();
    try {
      await fetch('/api/sponsor/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // ignore; we&rsquo;re going to navigate home anyway
    }
    try {
      const channel = new BroadcastChannel('ban-auth');
      channel.postMessage({ type: 'signout' });
      channel.close();
    } catch {
      // BroadcastChannel unsupported; other tabs catch up on
      // visibilitychange or next navigation.
    }
    setSignedIn(false);
    window.location.href = '/';
  }, []);

  // Keep state in sync with the prop when the parent re-renders with a
  // new server-side value (e.g., navigating between server pages).
  useEffect(() => {
    if (signedInProp !== undefined) setSignedIn(signedInProp);
  }, [signedInProp]);

  const showSolid = !transparent || scrolled;

  // Nav order is intentional. Conversion path first (Shirts,
  // Sponsor), then the user's own surface (Your kids), then the
  // story/about beat (Story) right before sign-in. Impact moved
  // to the footer — it's important context but doesn't need to
  // compete with the conversion path for nav real estate.
  // /campus is removed from the main nav for all viewers — public
  // and signed-in. The page itself is sign-in gated (see
  // src/app/campus/page.tsx) so cold visitors get pushed to /shirts.
  // Signed-in sponsors still reach /campus contextually via /me
  // and the YourKidsStrip &ldquo;+Add&rdquo; tile, which is when browsing
  // the rest of the campus actually makes sense. The nav now
  // reinforces the brand mechanic (shirts → number → kid)
  // instead of presenting a parallel directory surface.
  const navLinks = [
    { href: '/shirts', label: 'Shirts' },
    // "My campus" is the signed-in home base. Renamed 2026-07-06 from
    // "Your kids" — the page had already outgrown the label (campus
    // snapshot + newsletter + monthly stats + kid cards). "My campus"
    // owns the whole scope in first-person and matches the /me H1.
    // "Dashboard" was considered and rejected — voice.md rule 3
    // (personal over institutional).
    ...(signedIn ? [{ href: '/me', label: 'My campus' }] : []),
    { href: '/founder', label: 'Story' },
  ];

  const authButton = signedIn ? (
    <form
      action="/api/sponsor/logout"
      method="POST"
      className="inline-flex"
      onSubmit={handleSignOut}
    >
      <button
        type="submit"
        className="text-xs font-bold uppercase tracking-[0.15em] text-[#888] hover:text-[#0d0d0d] transition-colors"
      >
        Sign out
      </button>
    </form>
  ) : (
    <Link
      href="/signin"
      className={`text-xs font-bold uppercase tracking-[0.15em] transition-colors ${
        currentPath === '/signin'
          ? 'text-[#D4A843]'
          : 'text-[#888] hover:text-[#0d0d0d]'
      }`}
    >
      Sign in
    </Link>
  );

  const authButtonMobile = signedIn ? (
    <form
      action="/api/sponsor/logout"
      method="POST"
      className="block"
      onSubmit={handleSignOut}
    >
      <button
        type="submit"
        className="block w-full text-left px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-[#888] hover:text-[#0d0d0d] transition-colors"
      >
        Sign out
      </button>
    </form>
  ) : (
    <Link
      href="/signin"
      onClick={() => setMobileOpen(false)}
      className="block px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-[#888] hover:text-[#0d0d0d] transition-colors"
    >
      Sign in
    </Link>
  );

  return (
    <nav
      ref={navRef}
      className={`sticky top-0 z-50 transition-all duration-300 ${
        showSolid
          ? 'bg-[#FFF8F0]/95 backdrop-blur-md border-b border-[#e8e0d4]'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-5 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <Logo
              variant="micro"
              className={`h-10 w-10 transition-colors duration-500 ${
                scrolled ? 'text-[#D4A843]' : 'text-[#0d0d0d]'
              }`}
            />
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#0d0d0d]">
              Be A Number
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-7">
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
                {/* Small red dot next to Your Kids when a personal
                    child update has landed since this browser last
                    visited the kid page. Silent for every other
                    link. */}
                {link.href === '/me' && <UnreadYourKidsDot />}
              </Link>
            ))}
            {authButton}
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
                {link.href === '/me' && <UnreadYourKidsDot />}
              </Link>
            ))}
            {authButtonMobile}
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
