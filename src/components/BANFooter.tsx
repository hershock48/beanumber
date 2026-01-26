import Link from 'next/link';

export function BANFooter() {
  return (
    <footer className="py-16 px-6 bg-gray-50 border-t border-gray-200">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Be A Number, International</h3>
            <p className="text-gray-600 text-sm mb-2">
              8475 18 1/2 Mile Road
            </p>
            <p className="text-gray-600 text-sm">
              Marshall, MI 49068
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">About</h3>
            <div className="flex flex-col gap-2">
              <Link href="/about" className="text-gray-600 text-sm hover:text-gray-900">
                About Us
              </Link>
              <Link href="/founder" className="text-gray-600 text-sm hover:text-gray-900">
                Our Founder
              </Link>
              <Link href="/governance" className="text-gray-600 text-sm hover:text-gray-900">
                Governance & Financials
              </Link>
              <Link href="/ydo" className="text-gray-600 text-sm hover:text-gray-900">
                YDO Uganda
              </Link>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Get Involved</h3>
            <div className="flex flex-col gap-2">
              <Link href="/#donate" className="text-gray-600 text-sm hover:text-gray-900">
                Donate
              </Link>
              <Link href="/sponsorship" className="text-gray-600 text-sm hover:text-gray-900">
                Sponsor a Child
              </Link>
              <Link href="/partnerships" className="text-gray-600 text-sm hover:text-gray-900">
                Partner With Us
              </Link>
              <Link href="/contact" className="text-gray-600 text-sm hover:text-gray-900">
                Contact
              </Link>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Legal</h3>
            <p className="text-gray-600 text-sm mb-2">
              EIN: 93-1948872
            </p>
            <p className="text-gray-600 text-sm mb-3">
              Email: Kevin@beanumber.org
            </p>
            <div className="flex flex-col gap-2">
              <Link href="/privacy" className="text-gray-600 text-sm hover:text-gray-900">
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
        <div className="pt-8 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-500">
            © 2025 Be A Number, International. All rights reserved.
          </p>
          <p className="text-sm text-gray-500">
            501(c)(3) nonprofit organization
          </p>
        </div>
      </div>
    </footer>
  );
}
