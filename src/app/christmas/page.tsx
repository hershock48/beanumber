import type { Metadata } from 'next';
import Link from 'next/link';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { ChristmasGiftCard } from '../children/[number]/ChristmasGiftCard';
import { CHRISTMAS, christmasClosesLabel, christmasIsOpen } from '@/lib/christmas';

export const metadata: Metadata = {
  title: 'Christmas at the campus',
  description:
    'One fund, the same gift for every kid at Hope Bridge, and a photo of each kid with theirs.',
};

// The campaign landing page. Linked from the newsletter and anywhere
// there is no kid in view (/news, social). Sponsors reading on their
// kid's page already have the card there, with the kid's name on it.
export default function ChristmasPage() {
  const open = christmasIsOpen();

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/donate" />

      <main className="max-w-2xl mx-auto px-5 py-12 md:py-20">
        <div className="text-center mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-5">
            Christmas {CHRISTMAS.year}
          </p>
          <h1
            className="text-4xl md:text-5xl text-[#0d0d0d] mb-5 leading-tight"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Buy Christmas for the whole campus.
          </h1>
          <p className="text-lg text-[#555] leading-relaxed">
            {CHRISTMAS.kidCount} kids at Hope Bridge, one gift each, all the same. Simon&rsquo;s
            team buys them in town and hands them out before school closes for the holidays.
          </p>
        </div>

        {open ? (
          <ChristmasGiftCard
            year={CHRISTMAS.year}
            kidCount={CHRISTMAS.kidCount}
            giftLong={CHRISTMAS.giftLong}
            amounts={CHRISTMAS.amounts}
            perKidCost={CHRISTMAS.perKidCost}
            closesOnLabel={christmasClosesLabel()}
            overflowNote={CHRISTMAS.overflowNote}
          />
        ) : (
          <div className="bg-white border border-[#e8e0d4] p-7 md:p-8 text-center">
            <p className="text-[#555] leading-relaxed mb-5">
              Christmas gifts closed on {christmasClosesLabel()}. The photos of the kids with
              their gifts go up on their pages after Christmas.
            </p>
            <Link
              href="/news"
              className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider py-4 px-10 hover:bg-[#c49a3a] transition-colors"
            >
              Campus news
            </Link>
          </div>
        )}

        <div className="mt-10 bg-white border border-[#e8e0d4] p-7 md:p-8">
          <h2
            className="text-lg text-[#0d0d0d] mb-4"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            Why one fund and not a gift per number
          </h2>
          <div className="space-y-3 text-[#555] text-sm leading-relaxed">
            <p>
              Some numbers have three sponsors and some have none yet. If gifts followed the
              numbers, one kid would open three presents while the kid at the next desk opened
              nothing. So every dollar goes into one fund and every kid gets the same thing.
            </p>
            <p>
              If you have a kid, you will still see yours. Simon&rsquo;s team photographs each
              kid with their gift and the picture goes on that kid&rsquo;s page.
            </p>
            <p>{CHRISTMAS.overflowNote}</p>
          </div>
        </div>
      </main>

      <BANFooter />
    </div>
  );
}
