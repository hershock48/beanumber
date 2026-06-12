import type { Metadata } from 'next';
import Link from 'next/link';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';

export const metadata: Metadata = {
  title: 'Gift sent | Be A Number',
};

export default function GiftSuccessPage() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/gift" />

      <main className="max-w-2xl mx-auto px-5 py-16 md:py-24 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-5">
          Gift sent
        </p>
        <h1
          className="text-3xl md:text-4xl text-[#0d0d0d] mb-5 leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          Your gift is on its way.
        </h1>
        <p className="text-base md:text-lg text-[#666] leading-relaxed mb-8 max-w-xl mx-auto">
          We&rsquo;re emailing your recipient right now with their matched child&rsquo;s number
          and a link to meet them. You&rsquo;ll get a confirmation receipt at the email
          you used at checkout.
        </p>

        <div className="bg-white border border-[#e8e0d4] p-7 md:p-8 text-left mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843] mb-3">
            What happens next
          </p>
          <ol className="space-y-3 text-[#555] leading-relaxed list-decimal pl-5">
            <li>Your recipient gets an email introducing them to a real child at the campus.</li>
            <li>They click through, see the child&rsquo;s name and photo, and read about their year.</li>
            <li>They decide whether to continue at $25/month &mdash; entirely their call.</li>
            <li>If they stay, their sponsorship belongs to them and we send them updates all year.</li>
          </ol>
        </div>

        <p className="text-sm text-[#888] leading-relaxed mb-8">
          On behalf of the team at the YDO campus &mdash; thank you. This gift just gave a child
          their first month of school, meals, and medical care.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-3 px-8 hover:bg-[#c49a3a] transition-colors"
          >
            Back to home
          </Link>
          <Link
            href="/shirts"
            className="inline-block bg-white border border-[#e8e0d4] text-[#0d0d0d] font-bold uppercase tracking-wider py-3 px-8 hover:bg-[#f5f0e8] transition-colors"
          >
            Get a Shirt
          </Link>
        </div>
      </main>

      <BANFooter />
    </div>
  );
}
