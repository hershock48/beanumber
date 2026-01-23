import { Logo } from '@/components/Logo';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Contact Us - Be A Number",
  description: "Get in touch with Be A Number, International. We're here to help with sponsorship questions, donation inquiries, and partnership opportunities.",
  openGraph: {
    title: "Contact Us | Be A Number",
    description: "Get in touch with Be A Number, International. We're here to help with sponsorship questions, donation inquiries, and partnership opportunities.",
  },
};

export default function Contact() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <Logo className="h-8 w-8 text-gray-900" />
              <span className="text-xl font-semibold text-gray-900">Be A Number</span>
            </Link>
            <Link href="/" className="text-gray-700 hover:text-gray-900 transition-colors text-sm">
              ← Back to Home
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Contact Us</h1>
          <p className="text-xl text-gray-600 mb-12">
            We'd love to hear from you. Reach out with questions about sponsorship, donations, or partnership opportunities.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            {/* Email Contact */}
            <div className="bg-gray-50 p-8 rounded-lg border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Email</h2>
              <p className="text-gray-700 mb-4">
                For general inquiries, sponsorship questions, or to request your sponsor code:
              </p>
              <a
                href="mailto:Kevin@beanumber.org"
                className="text-lg font-medium text-gray-900 hover:underline"
              >
                Kevin@beanumber.org
              </a>
            </div>

            {/* Response Time */}
            <div className="bg-gray-50 p-8 rounded-lg border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Response Time</h2>
              <p className="text-gray-700">
                We typically respond to emails within 1-2 business days. For urgent matters, please indicate "URGENT" in your subject line.
              </p>
            </div>
          </div>

          {/* Common Questions */}
          <div className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Common Questions</h2>

            <div className="space-y-6">
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  I lost my sponsor code. How do I get it?
                </h3>
                <p className="text-gray-700">
                  Email us at{' '}
                  <a href="mailto:Kevin@beanumber.org" className="text-gray-900 font-medium hover:underline">
                    Kevin@beanumber.org
                  </a>
                  {' '}with the email address you used when you started your sponsorship, and we'll send your sponsor code right away.
                </p>
              </div>

              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  How do I become a sponsor?
                </h3>
                <p className="text-gray-700">
                  Visit our{' '}
                  <Link href="/" className="text-gray-900 font-medium hover:underline">
                    home page
                  </Link>
                  {' '}to learn about sponsorship opportunities, or email us directly and we'll help match you with a child in need.
                </p>
              </div>

              <div className="pb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  How can I make a donation?
                </h3>
                <p className="text-gray-700">
                  You can donate directly through our website. Visit our{' '}
                  <Link href="/" className="text-gray-900 font-medium hover:underline">
                    home page
                  </Link>
                  {' '}and click the Donate button. We accept one-time and monthly recurring donations.
                </p>
              </div>
            </div>
          </div>

          {/* Organization Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Be A Number, International</h2>
            <p className="text-gray-700 text-sm">
              A 501(c)(3) nonprofit organization dedicated to connecting sponsors with children in Northern Uganda through education, healthcare, and community development programs.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-16 px-6 bg-gray-50 border-t border-gray-200 mt-24">
        <div className="max-w-6xl mx-auto text-center text-sm text-gray-500">
          <p>© 2025 Be A Number, International. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
