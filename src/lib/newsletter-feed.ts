/**
 * Public newsletter feed — shared fetcher used by:
 *   - /children/[number] page (CampusNewsfeed below the kid bio)
 *   - /news page (campus newsfeed without kid framing)
 *
 * Returns recent Sent newsletters from the Newsletters Airtable
 * table, newest first, capped at 12. Status is the gate: only
 * records flipped to "Sent" (or with a non-blank PublishedAt) are
 * surfaced. See docs/claude/newsletter.md for the full model.
 */

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const NEWSLETTERS_TABLE = 'tblqP1zrRsh4mblHq';

export interface CampusNewsletterEntry {
  id: string;
  title: string;
  subject: string;
  bodyHtml: string;
  heroPhotoUrl?: string;
  publishedAt?: string;
}

export async function getRecentCampusNewsletters(
  limit = 12
): Promise<CampusNewsletterEntry[]> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) return [];
  try {
    const formula = encodeURIComponent(
      `OR({Status}="Sent", NOT({PublishedAt}=BLANK()))`
    );
    const url =
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(NEWSLETTERS_TABLE)}` +
      `?filterByFormula=${formula}` +
      `&sort%5B0%5D%5Bfield%5D=PublishedAt&sort%5B0%5D%5Bdirection%5D=desc` +
      `&maxRecords=${limit}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      records: Array<{ id: string; fields: Record<string, unknown> }>;
    };
    return (data.records || []).map(r => {
      const f = r.fields;
      const heroAttachments = f.HeroPhoto as
        | Array<{ url: string }>
        | undefined;
      return {
        id: r.id,
        title: (f.Title as string) || '',
        subject: (f.Subject as string) || '',
        bodyHtml: (f.BodyHTML as string) || '',
        heroPhotoUrl: heroAttachments?.[0]?.url,
        publishedAt: f.PublishedAt as string | undefined,
      };
    });
  } catch (err) {
    console.warn('[newsletter-feed] Fetch failed', err);
    return [];
  }
}
