import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { TextSizeToggle } from '@/components/TextSizeToggle';
import GlazedCredit from '@/components/GlazedCredit';

export function BANFooter() {
  return (
    <footer className="bg-[#0d0d0d] text-[#999] border-t border-[#e8e0d4]">
      <div className="max-w-6xl mx-auto px-5 py-16">
        {/* Top section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <Logo variant="micro" className="h-8 w-8 text-[#D4A843]" />
              <span className="text-sm text-[#FFF8F0] font-bold uppercase tracking-[0.2em]">
                Be A Number
              </span>
            </div>
            <p className="text-sm leading-relaxed">
              Every Number is a Child.<br />
              Every Shirt starts a story.
            </p>
          </div>

          {/* Get Involved */}
          <div>
            <h3 className="text-[#FFF8F0] text-xs font-bold uppercase tracking-[0.2em] mb-4">Get Involved</h3>
            <div className="space-y-2.5 text-sm">
              <Link href="/shirts" className="block hover:text-[#D4A843] transition-colors">Shirts</Link>
              <Link href="/donate" className="block hover:text-[#D4A843] transition-colors">Donate</Link>
              <Link href="/signin" className="block hover:text-[#D4A843] transition-colors">Sign in</Link>
            </div>
          </div>

          {/* About */}
          <div>
            <h3 className="text-[#FFF8F0] text-xs font-bold uppercase tracking-[0.2em] mb-4">About</h3>
            <div className="space-y-2.5 text-sm">
              <Link href="/founder" className="block hover:text-[#D4A843] transition-colors">Our Story</Link>
              <Link href="/impact" className="block hover:text-[#D4A843] transition-colors">Impact</Link>
              <Link href="/governance" className="block hover:text-[#D4A843] transition-colors">Financials</Link>
              <Link href="/contact" className="block hover:text-[#D4A843] transition-colors">Contact</Link>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-[#FFF8F0] text-xs font-bold uppercase tracking-[0.2em] mb-4">Contact</h3>
            <div className="text-sm space-y-2.5">
              <p>108 N. Sycamore Street</p>
              <p>Marshall, MI 49068</p>
              <a href="mailto:kevin@beanumber.org" className="block hover:text-[#D4A843] transition-colors">
                kevin@beanumber.org
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-[#222] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#666]">
          <p>&copy; {new Date().getFullYear()} Be A Number, International.</p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <TextSizeToggle />
            <Link href="/privacy" className="hover:text-[#D4A843] transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-[#D4A843] transition-colors">Terms</Link>
            <span>501(c)(3) &middot; EIN: 93-1948872</span>
            <GlazedCredit line="Double dipped by" />
          </div>
        </div>
      </div>
    </footer>
  );
}
