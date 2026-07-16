/**
 * /news/[id] — one campus newsletter as its own indexable page.
 *
 * SEO architecture (2026-07-16): the site's freshest real content is
 * the monthly campus newsletter, but it only existed inside the /news
 * accordion feed and on kid pages — one URL, no per-issue titles, no
 * per-issue share links, nothing for a search engine to rank month
 * over month. This page gives every issue a permanent URL with its
 * own title, description, hero image, and Article structured data.
 * The /news archive links here and the sitemap lists every issue, so
 * the site grows an indexable page every month Kevin publishes —
 * which is the only sustainable way a fifteen-page site starts
 * showing up in search.
 *
 * Content is the same BodyHTML the feed renders (authoring rules in
 * docs/claude/newsletter.md — plain <p> and <h2> only), styled with
 * the same ban-newsletter-body css so the two surfaces never drift.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { getNewsletterById } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const issue = await getNewsletterById(id);
  if (!issue) return { title: 'Campus news' };
  const heading = issue.subject || issue.title || 'From the campus';
  const description =
    issue.teaser ||
    stripHtml(issue.bodyHtml).slice(0, 155) ||
    'Monthly update from the campus in Omoro District, Northern Uganda.';
  return {
    title: heading,
    description,
    alternates: { canonical: `/news/${issue.id}` },
    openGraph: {
      title: `${heading} | Be A Number`,
      description,
      type: 'article',
      ...(issue.publishedAt ? { publishedTime: issue.publishedAt } : {}),
      ...(issue.heroPhotoUrl ? { images: [issue.heroPhotoUrl] } : {}),
    },
  };
}

export default async function NewsletterArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const issue = await getNewsletterById(id);
  if (!issue) notFound();

  const heading = issue.subject || issue.title || 'From the campus';
  const description =
    issue.teaser || stripHtml(issue.bodyHtml).slice(0, 155);

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: heading,
    description,
    ...(issue.heroPhotoUrl ? { image: [issue.heroPhotoUrl] } : {}),
    ...(issue.publishedAt ? { datePublished: issue.publishedAt } : {}),
    author: {
      '@type': 'Organization',
      name: 'Be A Number, International',
      url: 'https://www.beanumber.org',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Be A Number, International',
      url: 'https://www.beanumber.org',
    },
    mainEntityOfPage: `https://www.beanumber.org/news/${issue.id}`,
  };

  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <BANNavigation currentPath="/news" />

      <main className="max-w-3xl mx-auto px-5 py-10 md:py-16">
        <Link
          href="/news"
          className="inline-flex items-center gap-2 text-sm text-[#aaa] hover:text-[#D4A843] transition-colors mb-8"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          All campus news
        </Link>

        <article>
          <header className="mb-8">
            {issue.publishedAt && (
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4A843] mb-3">
                {formatDate(issue.publishedAt)} &middot; Omoro District,
                Northern Uganda
              </p>
            )}
            <h1
              className="text-3xl md:text-5xl text-[#0d0d0d] leading-tight"
              style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
            >
              {heading}
            </h1>
          </header>

          {issue.heroPhotoUrl && (
            <div className="relative w-full aspect-[16/9] mb-8 overflow-hidden border border-[#e8e0d4]">
              <Image
                src={issue.heroPhotoUrl}
                alt={heading}
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
                priority
              />
            </div>
          )}

          <div
            className="leading-relaxed text-base md:text-[17px] ban-newsletter-body"
            dangerouslySetInnerHTML={{ __html: issue.bodyHtml }}
          />
        </article>

        {/* Conversion beat — same shirt-first framing as /news. */}
        <div className="mt-12 md:mt-16 bg-white border border-[#e8e0d4] p-7 md:p-8 text-center">
          <p
            className="text-xl md:text-2xl text-[#0d0d0d] mb-3 leading-snug"
            style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}
          >
            This campus runs on sponsors.
          </p>
          <p className="text-[#555] text-sm md:text-base leading-relaxed mb-5 max-w-md mx-auto">
            Every shirt carries a Number, and every Number is a real kid
            at this campus. $25 gets you the shirt and starts their year.
          </p>
          <Link
            href="/shirts"
            className="inline-block bg-[#D4A843] text-[#0d0d0d] font-bold uppercase tracking-wider text-sm py-3.5 px-8 hover:bg-[#c49a3a] transition-colors"
          >
            Start with a shirt &rarr;
          </Link>
        </div>
      </main>

      <BANFooter />
    </div>
  );
}
