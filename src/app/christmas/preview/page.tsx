import { notFound } from 'next/navigation';
import { ChristmasGiftCard } from '../../children/[number]/ChristmasGiftCard';
import { CHRISTMAS, christmasClosesLabel } from '@/lib/christmas';

// Dev-only: renders the kid-page card without a database so it can
// be eyeballed locally. 404s in production.
export default function ChristmasPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <div className="min-h-screen bg-[#FFF8F0] py-16 px-5">
      <div className="max-w-2xl mx-auto">
        <ChristmasGiftCard
          shirtNumber={14}
          firstName="Grace"
          year={CHRISTMAS.year}
          kidCount={CHRISTMAS.kidCount}
          giftLong={CHRISTMAS.giftLong}
          amounts={CHRISTMAS.amounts}
          perKidCost={CHRISTMAS.perKidCost}
          closesOnLabel={christmasClosesLabel()}
          overflowNote={CHRISTMAS.overflowNote}
        />
      </div>
    </div>
  );
}
