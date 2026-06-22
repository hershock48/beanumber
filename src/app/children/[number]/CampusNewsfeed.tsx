/**
 * Public campus newsfeed — renders on every kid's /[number] page,
 * visible to anyone regardless of sponsor state.
 *
 * Kevin writes one campus newsletter per month. Under the May 2026
 * rewrite, the newsletter doesn't ship as a long email anymore — the
 * email is a short notification with a teaser; the full piece lives
 * on every kid's page.
 *
 * June 2026 redesign: every issue is now a collapsed editorial cover
 * (full-bleed hero photo, serif title floated over a soft scrim,
 * eyebrow date in small-caps gold). Click to expand the body inline.
 * Featured (latest) gets the largest cover; earlier issues stack as
 * smaller covers below. Magazine, not list. No-JS — uses native
 * <details>/<summary> for the expand/collapse so it works without
 * client hydration.
 */

import Image from 'next/image';
import type { CampusNewsletterEntry } from '@/lib/newsletter-feed';

export type { CampusNewsletterEntry };

interface CampusNewsfeedProps {
  firstName: string;
  newsletters: CampusNewsletterEntry[];
}

export function CampusNewsfeed({ newsletters }: CampusNewsfeedProps) {
  if (!newsletters || newsletters.length === 0) return null;
  const [latest, ...rest] = newsletters;

  return (
    <section className="mt-10 md:mt-12">
      {/* Section header */}
      <div className="border-t border-[#e8e0d4] pt-8 md:pt-10 mb-7 md:mb-9">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-2">
          From the campus
        </p>
        <h2
          className="text-3xl md:text-4xl text-[#0d0d0d] leading-tight"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          The monthly newsfeed.
        </h2>
        <p className="text-sm md:text-base text-[#777] mt-2 max-w-xl leading-relaxed">
          One letter a month from Kevin and the team. Tap any cover
          to read it.
        </p>
      </div>

      {/* Latest — full-bleed cover */}
      <NewsletterCover newsletter={latest} variant="featured" />

      {/* Earlier covers */}
      {rest.length > 0 && (
        <div className="mt-7 md:mt-9">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#aaa] mb-4">
            Earlier issues
          </p>
          <div className="space-y-4 md:space-y-5">
            {rest.map(n => (
              <NewsletterCover key={n.id} newsletter={n} variant="archive" />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function NewsletterCover({
  newsletter,
  variant,
}: {
  newsletter: CampusNewsletterEntry;
  variant: 'featured' | 'archive';
}) {
  const heading = newsletter.subject || newsletter.title || 'From the campus';
  const isFeatured = variant === 'featured';
  const heroHeight = isFeatured ? 'h-72 md:h-96' : 'h-44 md:h-56';
  const titleSize = isFeatured
    ? 'text-3xl md:text-5xl'
    : 'text-xl md:text-2xl';
  const monthLabel = newsletter.publishedAt
    ? formatMonthShort(newsletter.publishedAt)
    : '';

  return (
    <details className="group bg-[#1a1208] overflow-hidden open:bg-white open:border open:border-[#e8e0d4] transition-colors">
      <summary
        className={`list-none cursor-pointer relative ${heroHeight} overflow-hidden group-open:rounded-t-none`}
      >
        {newsletter.heroPhotoUrl ? (
          <Image
            src={newsletter.heroPhotoUrl}
            alt={heading}
            fill
            sizes={isFeatured ? '(max-width: 768px) 100vw, 1024px' : '(max-width: 768px) 100vw, 512px'}
            className="object-cover group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#2a1f14] to-[#0d0905]" />
        )}
        {/* Bottom-to-top scrim so the title reads against any photo */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
        <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-8">
          {monthLabel && (
            <p
              className={`font-bold uppercase tracking-[0.3em] text-[#D4A843] mb-3 ${
                isFeatured ? 'text-xs md:text-sm' : 'text-[10px] md:text-xs'
              }`}
            >
              {monthLabel}
            </p>
          )}
          <h3
            className={`${titleSize} text-white leading-tight mb-3 max-w-3xl`}
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {heading}
          </h3>
          <p
            className={`text-white/85 font-bold uppercase tracking-[0.15em] ${
              isFeatured ? 'text-xs md:text-sm' : 'text-[10px] md:text-xs'
            }`}
          >
            <span className="group-open:hidden">Read this issue →</span>
            <span className="hidden group-open:inline">Close ↑</span>
          </p>
        </div>
      </summary>

      {/* Body — only visible when expanded */}
      <div className="bg-white text-[#333] p-6 md:p-9 md:px-12 max-w-3xl mx-auto">
        {newsletter.publishedAt && (
          <p className="text-xs uppercase tracking-wider text-[#aaa] mb-4">
            {formatLongDate(newsletter.publishedAt)}
          </p>
        )}
        {newsletter.bodyHtml ? (
          <div
            className="leading-relaxed text-base md:text-[17px] ban-newsletter-body"
            dangerouslySetInnerHTML={{ __html: newsletter.bodyHtml }}
          />
        ) : (
          <p className="text-sm text-[#888] italic">
            The body of this newsletter is on its way.
          </p>
        )}
      </div>
    </details>
  );
}

function formatMonthShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      .toUpperCase();
  } catch {
    return iso;
  }
}

function formatLongDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
