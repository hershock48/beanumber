/**
 * Public campus newsfeed — renders on every kid's /[number] page,
 * visible to anyone regardless of sponsor state.
 *
 * Kevin writes one campus newsletter per month. Under the May 2026
 * rewrite, the newsletter doesn't ship as a long email anymore — the
 * email is a short notification with a teaser; the full piece lives
 * on every kid's page. Sponsors hit /[their kid #] from a direct
 * email link. Non-sponsors get an email that says "type your number
 * at beanumber.org" and lands on the same page.
 *
 * Layout: most recent newsletter renders in full with the hero photo
 * and full body. Older newsletters render as a compact feed below —
 * date eyebrow + headline + short teaser + native <details> expander
 * for the full body. No client JS required; everything is plain
 * progressive HTML.
 *
 * Editorial intent: this should read like a real publication, not a
 * dump of past-emails. Eyebrow + serif headline + datestamp + body,
 * spaced with rhythm. The expand affordance is gold and explicit so
 * scanning through past months feels intentional.
 */

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
      <div className="border-t border-[#e8e0d4] pt-8 md:pt-10 mb-6 md:mb-8">
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
          One letter a month from Kevin and the YDO team — what&rsquo;s
          happening on the ground in Omoro District. Newest first.
        </p>
      </div>

      {/* Most recent — rendered in full */}
      <FeaturedNewsletter newsletter={latest} />

      {/* Older posts — compact feed */}
      {rest.length > 0 && (
        <div className="mt-8 md:mt-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#aaa] mb-4">
            Earlier this year
          </p>
          <ul className="space-y-3 md:space-y-4">
            {rest.map(n => (
              <li key={n.id}>
                <ArchivedNewsletter newsletter={n} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function FeaturedNewsletter({
  newsletter,
}: {
  newsletter: CampusNewsletterEntry;
}) {
  const heading = newsletter.subject || newsletter.title || 'From the campus';
  return (
    <article className="bg-white border border-[#e8e0d4]">
      {newsletter.heroPhotoUrl && (
        <div className="aspect-[16/9] bg-[#f5f0e8] border-b border-[#e8e0d4] overflow-hidden">
          <img
            src={newsletter.heroPhotoUrl}
            alt={heading}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-6 md:p-9">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A843]">
            Latest newsletter
          </p>
          {newsletter.publishedAt && (
            <p className="text-xs uppercase tracking-wider text-[#aaa]">
              {formatLongDate(newsletter.publishedAt)}
            </p>
          )}
        </div>
        <h3
          className="text-2xl md:text-[28px] text-[#0d0d0d] leading-snug mb-5"
          style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
        >
          {heading}
        </h3>
        {newsletter.bodyHtml ? (
          <div
            className="text-[#333] leading-relaxed text-base md:text-[17px] ban-newsletter-body"
            dangerouslySetInnerHTML={{ __html: newsletter.bodyHtml }}
          />
        ) : (
          <p className="text-sm text-[#888] italic">
            The body of this newsletter is on its way.
          </p>
        )}
      </div>
    </article>
  );
}

function ArchivedNewsletter({
  newsletter,
}: {
  newsletter: CampusNewsletterEntry;
}) {
  const heading = newsletter.subject || newsletter.title || 'From the campus';
  const teaser = extractTeaser(newsletter.bodyHtml);
  return (
    <details className="group bg-white border border-[#e8e0d4] open:border-[#D4A843] transition-colors">
      <summary className="list-none cursor-pointer p-5 md:p-6 flex gap-4 md:gap-5 items-start">
        {newsletter.heroPhotoUrl ? (
          <div className="hidden sm:block w-24 h-24 md:w-28 md:h-28 flex-shrink-0 bg-[#f5f0e8] border border-[#e8e0d4] overflow-hidden">
            <img
              src={newsletter.heroPhotoUrl}
              alt={heading}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="hidden sm:flex w-24 h-24 md:w-28 md:h-28 flex-shrink-0 bg-[#f5f0e8] border border-[#e8e0d4] items-center justify-center">
            <span className="text-2xl text-[#D4A843]" aria-hidden>
              ❦
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          {newsletter.publishedAt && (
            <p className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-[#aaa] mb-1">
              {formatLongDate(newsletter.publishedAt)}
            </p>
          )}
          <h4
            className="text-lg md:text-xl text-[#0d0d0d] leading-snug mb-2"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            {heading}
          </h4>
          {teaser && (
            <p className="text-sm text-[#666] leading-relaxed line-clamp-2">
              {teaser}
            </p>
          )}
          <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[#D4A843]">
            <span className="group-open:hidden">Read this month →</span>
            <span className="hidden group-open:inline">Close ↑</span>
          </p>
        </div>
      </summary>
      <div className="px-5 md:px-6 pb-6 md:pb-7 border-t border-[#e8e0d4]/60 pt-5">
        {newsletter.bodyHtml ? (
          <div
            className="text-[#333] leading-relaxed text-sm md:text-base ban-newsletter-body"
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

/**
 * Pull the first ~180 chars of plain text out of the authored HTML
 * body. Used as the teaser line on archived newsletter cards. We're
 * generous about what counts as a "first paragraph" — if Kevin's
 * authoring tool stuffs the lead inside a <div> or <h2>, we still
 * find something readable.
 */
function extractTeaser(html: string): string {
  if (!html) return '';
  // Strip tags, collapse whitespace, decode the handful of entities
  // Kevin's authoring tool actually emits.
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&mdash;/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= 180) return text;
  // Soft-trim at a word boundary.
  const trimmed = text.slice(0, 180);
  const lastSpace = trimmed.lastIndexOf(' ');
  return (lastSpace > 100 ? trimmed.slice(0, lastSpace) : trimmed) + '…';
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
