import { Logo } from '@/components/Logo';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: '/governance' },
  title: "Governance & Financials",
  description: "Be A Number, International is a 501(c)(3) public charity (EIN: 93-1948872). In 2025, 96.7% of funding directly supported programs. View our financial stewardship and governance structure.",
  openGraph: {
    title: "Governance & Financials | Be A Number, International",
    description: "501(c)(3) public charity with 96.7% program allocation. Transparent governance and financial stewardship.",
    images: ["/images/governance/planning-notebook.jpg"],
  },
};

export default function Governance() {
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

      {/* Optional Header Image */}
      <section className="relative w-full h-[40vh] min-h-[300px] bg-gray-200">
        <Image
          src="/images/governance/planning-notebook.jpg"
          alt="Woman with clothesline in Northern Uganda"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/10"></div>
      </section>

      {/* Main Content */}
      <main className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Clean Text Header */}
          <div className="mb-16 text-center border-b border-gray-200 pb-12">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900">Governance & Financials</h1>
          </div>

          {/* Legal Status */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Legal Status</h2>
            <div className="bg-gray-50 p-8 rounded-lg border border-gray-200">
              <p className="text-gray-900 font-semibold mb-2">Be A Number, International</p>
              <p className="text-gray-700 mb-2">EIN: 93-1948872</p>
              <p className="text-gray-700 mb-2">501(c)(3) Public Charity</p>
              <p className="text-gray-700">Incorporated 2023</p>
            </div>
          </section>

          {/* Governance */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Governance</h2>
            <p className="text-gray-700 leading-relaxed">
              Your trust matters. Be A Number is guided by a Board of Directors and keeps tight financial controls so your donations go where they're meant to go. We're founder-led with active local and international oversight.
            </p>
          </section>

          {/* How sponsorship works */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">How sponsorship works</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We operate a pool-funded program with personal matching. Every shirt purchase, monthly sponsorship, gift, and donation flows into the operating budget of the YDO campus in Omoro District, Northern Uganda. That budget pays for the school, the clinic, the meals program, vocational training, the teachers and clinic staff, and the children's care year-round. Each donor is matched to a specific child for relationship and storytelling &mdash; the child whose number you receive becomes your personal connection, the one you get photos of, letters from, and updates about as the year unfolds.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              This is the same model Compassion International and World Vision operate on. Strict 1-to-1 financial allocation isn't operationally honest for a six-acre campus with 30+ staff, a school, a clinic, and a vocational program &mdash; the annual cost of running it far exceeds what any one sponsor's $25 a month could literally pay for. What your gift does is fund a partnership: a community-run campus that keeps your matched child in school, fed, and cared for alongside their classmates, year after year.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Restricted gifts are an exception we honor explicitly. Founder's Series shirts (when designated to a specific capital project), named scholarships, and project-restricted donations to the clinic or vocational program are tracked and reported against the restriction. Everything else is unrestricted general support, which is what gives the campus the flexibility to keep going through weeks when shirt sales are slow or a child needs urgent care.
            </p>
          </section>

          {/* 2025 Financial Snapshot */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">2025 Financial Snapshot</h2>
            <div className="bg-gray-50 p-8 rounded-lg border border-gray-200 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="text-gray-700 mb-1">Total Revenue:</p>
                  <p className="text-2xl font-bold text-gray-900">$79,623</p>
                </div>
                <div>
                  <p className="text-gray-700 mb-1">Total Expenses:</p>
                  <p className="text-2xl font-bold text-gray-900">$79,615</p>
                </div>
                <div>
                  <p className="text-gray-700 mb-1">Operating Result:</p>
                  <p className="text-2xl font-bold text-gray-900">+$12 (Break-even)</p>
                </div>
              </div>
              
              <div className="border-t border-gray-300 pt-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <p className="text-gray-700 mb-1">Program Allocation:</p>
                    <p className="text-2xl font-bold text-gray-900">96.7%</p>
                  </div>
                  <div>
                    <p className="text-gray-700 mb-1">Administrative & Overhead:</p>
                    <p className="text-2xl font-bold text-gray-900">3.3%</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-300 pt-6">
                <p className="text-gray-700 mb-4">Ending Cash (12/31/2025): $7,699</p>
                <p className="text-gray-700 mb-1 ml-4">Restricted (Rotary): $7,500</p>
                <p className="text-gray-700 ml-4">Unrestricted: $199</p>
              </div>
            </div>
          </section>

          {/* Financial Stewardship */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Financial Stewardship</h2>
            <p className="text-gray-700 leading-relaxed">
              We run lean so that most of your money goes directly to programs. With just 3.3% in administrative costs, we stretch every dollar while staying accountable and ready to grow responsibly.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-16 px-6 bg-gray-50 border-t border-gray-200 mt-24">
        <div className="max-w-6xl mx-auto text-center text-sm text-gray-500">
          <p>© {new Date().getFullYear()} Be A Number, International. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
