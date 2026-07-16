import { MetadataRoute } from 'next';
import { listAllChildren, getRecentCampusNewsletters } from '@/lib/db/queries';

/**
 * Dynamic sitemap (2026-07-16 SEO pass).
 *
 * Was a hardcoded 12-URL list that didn't include /shirts, /donate,
 * or /news — and none of the site's actual content pages. Now built
 * from the database on each request:
 *
 *   - Static pages, with honest changeFrequency.
 *   - Every active kid's /meet/[id] page. These are the SEO-safe kid
 *     surfaces: public, shareable, full bio in the HTML, no shirt
 *     number to spoil. One indexable page per kid on the roster.
 *     Departed kids are excluded — memorial pages aren't marketing
 *     surface (listAllChildren already filters them).
 *   - Every published newsletter's /news/[id] article page, with the
 *     real publish date as lastModified. The archive grows monthly,
 *     which is the freshness signal a small site needs most.
 *
 * /children/[N] pages are deliberately absent AND noindexed: 300
 * numbers render near-identical thin HTML (the content lives behind
 * the reveal), which reads as duplicate content. /meet carries the
 * kid-content index value instead.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.beanumber.org';

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'monthly', priority: 1 },
    { url: `${baseUrl}/shirts`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/donate`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/news`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/founder`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.8 },
    { url: `${baseUrl}/governance`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/impact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/partnerships`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.7 },
    { url: `${baseUrl}/reports/2025-impact-financial-summary`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.6 },
    { url: `${baseUrl}/reports/2025-annual-report`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.6 },
    { url: `${baseUrl}/ydo`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/ydo/about`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.8 },
    { url: `${baseUrl}/ydo/programs`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/ydo/partnership`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.7 },
    { url: `${baseUrl}/ydo/contact`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.7 },
  ];

  // Kid pages (/meet) — one per active kid with a photo. The photo
  // requirement matches the shareable-page bar: a bio page with a
  // ghost avatar isn't the face we want ranking.
  let kidPages: MetadataRoute.Sitemap = [];
  try {
    const kids = await listAllChildren({ onlyWithPhoto: true });
    kidPages = kids.map(k => ({
      url: `${baseUrl}/meet/${k.id}`,
      lastModified: k.updatedAt ? new Date(k.updatedAt) : new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));
  } catch (err) {
    console.warn('[sitemap] kid pages unavailable:', err);
  }

  // Newsletter article pages — every published issue.
  let newsPages: MetadataRoute.Sitemap = [];
  try {
    const issues = await getRecentCampusNewsletters(100);
    newsPages = issues.map(n => ({
      url: `${baseUrl}/news/${n.id}`,
      lastModified: n.publishedAt ? new Date(n.publishedAt) : new Date(),
      changeFrequency: 'yearly' as const,
      priority: 0.6,
    }));
  } catch (err) {
    console.warn('[sitemap] news pages unavailable:', err);
  }

  return [...staticPages, ...kidPages, ...newsPages];
}
