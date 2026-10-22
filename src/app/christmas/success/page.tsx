import type { Metadata } from 'next';
import Link from 'next/link';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { ConfettiBurst } from '@/components/ConfettiBurst';
import { CHRISTMAS, christmasClosesLabel } from '@/lib/christmas';

export const metadata: Metadata = {
  title: 'Christmas is on its way',
  description: 'Your gift goes toward the same Christmas present for every kid at the campus.',
};

export default async function ChristmasSuccess({
  searchParams,
}: {
  searchParams: Promise<{ n?: string }>;
}) {
  const { n } = await searchParams;
  const shirtNumber = n && /^\d+$/.test(n) ? Number(n) : null;

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <ConfettiBurst />
      <BANNavigation currentPath="/donate" />

      <main className="py-24 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-6">
              Christmas {CHRISTMAS.year}
            </p>
            <h1
              className="text-4xl md:text-5xl text-[#0d0d0d] mb-6 leading-tight"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              That&rsquo;s Christmas for the campus.
            </h1>
            <p className="text-lg text-[#555] leading-relaxed mb-6">
              Your gift goes into one fund, and Simon&rsquo;s team buys the same thing for every one of
              the {CHRISTMAS.kidCount} kids at Hope Bridge: {CHRISTMAS.giftLong}.
            </p>
            <p className="text-[#777] leading-relaxed">
              A tax-deductible receipt is on its way to your inbox.
            </p>
          </div>

          <div className="bg-white border border-[#e8e0d4] p-7 md:p-8 mb-8">
            <h3
              className="text-lg text-[#0d0d0d] mb-4"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              What happens next
            </h3>
            <div className="space-y-3 text-[#555] text-sm leading-relaxed">
              <div className="flex gap-3 items-start">
                <span className="text-[#D4A843] font-bold flex-shrink-0 mt-0.5">&middot;</span>
                <span>Gifts close on {christmasClosesLabel()}. Then the fund goes to Simon in Omoro.</span>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-[#D4A843] font-bold flex-shrink-0 mt-0.5">&middot;</span>
                <span>The team buys the gifts in town and hands them out before school closes for the holidays.</span>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-[#D4A843] font-bold flex-shrink-0 mt-0.5">&middot;</span>
                <span>Every kid gets photographed with theirs, and each photo lands on that kid&rsquo;s page.</span>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-[#D4A843] font-bold flex-shrink-0 mt-0.5">&middot;</span>
                <span>{CHRISTMAS.overflowNote}</span>
              </div>
            </div>
          </div>

          <div className="text-center">
            {shirtNumber ? (
              <Link
                href={`/children/${shirtNumber}`}
                className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-10 hover:bg-[#c49a3a] transition-colors"
              >
                Back to #{shirtNumber}
              </Link>
            ) : (
              <Link
                href="/news"
                className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-10 hover:bg-[#c49a3a] transition-colors"
              >
                Campus news
              </Link>
            )}
          </div>
        </div>
      </main>

      <BANFooter />
    </div>
  );
}
