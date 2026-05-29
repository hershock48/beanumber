/**
 * Send Campus Newsletter Tool
 *
 * Sends one Newsletters-table record out to every active sponsor.
 *
 * Flow:
 *   1. Read the newsletter record from Airtable.
 *   2. Flip its Status to 'Sending' so we never double-send.
 *   3. Pull the list of active sponsors (AuthStatus=Active OR Status=Active).
 *   4. For each sponsor, render the body (with {{sponsorFirstName}} merge tag)
 *      and call sendCampusNewsletterEmail.
 *   5. Tally successes / failures, write them back to the record.
 *   6. Mark Status=Sent (or Failed if zero sends succeeded) and stamp PublishedAt.
 *
 * This is idempotent-ish: if the caller invokes it twice on the same record,
 * the second call will see Status=Sending or Sent and refuse. Use force=true
 * to override (not generally recommended).
 */

import { logger } from '../../logger';
import {
  getNewsletterById,
  findAllSponsorsForNewsletter,
  updateNewsletter,
  findDonorByEmail,
  type AirtableNewsletterRecord,
} from '../../airtable';
import { sendNewsletterNotificationEmail } from '../../email';

// Notification model: the full newsletter body lives on /[number] for
// each kid the sponsor sponsors. The email is a short ping with a
// teaser + per-kid link list — every newsletter becomes a reason for
// the sponsor to come back to their kid's page.

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';

/**
 * Pull ShirtNumber + FirstName for a batch of Children record IDs.
 * Returns a Map keyed by record ID.
 */
async function fetchChildrenByRecordIds(
  ids: string[]
): Promise<Map<string, { shirtNumber: number | null; firstName: string }>> {
  const map = new Map<string, { shirtNumber: number | null; firstName: string }>();
  if (ids.length === 0 || !AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) return map;

  // Airtable formula limit ~16k chars. Chunk to keep below.
  const chunkSize = 50;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const formula = `OR(${chunk.map(id => `RECORD_ID()="${id}"`).join(',')})`;
    const params = new URLSearchParams();
    params.set('filterByFormula', formula);
    params.set('pageSize', '100');
    params.append('fields[]', 'ShirtNumber');
    params.append('fields[]', 'FirstName');
    params.append('fields[]', 'DisplayName');
    try {
      const res = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CHILDREN_TABLE)}?${params}`,
        {
          headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
          cache: 'no-store',
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const rec of (data.records || []) as Array<{
        id: string;
        fields: { ShirtNumber?: number; FirstName?: string; DisplayName?: string };
      }>) {
        map.set(rec.id, {
          shirtNumber: typeof rec.fields.ShirtNumber === 'number' ? rec.fields.ShirtNumber : null,
          firstName: rec.fields.FirstName || rec.fields.DisplayName || '',
        });
      }
    } catch {
      // Skip; we'll just send without per-kid links for these.
    }
  }
  return map;
}

/**
 * Pull the first paragraph of plain text out of an HTML body.
 * Strips tags, normalizes whitespace, cuts at the first double-newline
 * or after ~280 characters at a word boundary.
 */
function extractTeaser(html: string): string {
  if (!html) return '';
  // Take everything before any later <h2/h3 (skip the rest of the article).
  const beforeHeader = html.split(/<h[1-4]\b/i)[0] || html;
  // Replace block-level tag breaks with double newlines so we get
  // paragraph boundaries when we strip.
  const withBreaks = beforeHeader
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const stripped = withBreaks
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&mdash;/g, '—');
  const firstPara = stripped.split(/\n\s*\n/).map(s => s.trim()).find(s => s.length > 0) || '';

  if (firstPara.length <= 320) return firstPara;
  // Soft-cut at a word boundary just past 280 chars.
  const slice = firstPara.slice(0, 320);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 240 ? slice.slice(0, lastSpace) : slice).trimEnd() + '…';
}

export interface SendCampusNewsletterInput {
  /** Airtable record ID (starts with 'rec') for the Newsletters table row. */
  newsletterId: string;
  /** If true, send even if Status is already 'Sending' or 'Sent'. Default false. */
  force?: boolean;
  /** If true, look up the sponsor list but don't actually send. For sanity checks. */
  dryRun?: boolean;
}

export interface SendCampusNewsletterOutput {
  success: boolean;
  data?: {
    newsletterId: string;
    title: string;
    subject: string;
    recipientCount: number;
    /** How many sponsors we filtered out for being unsubscribed. */
    suppressedCount: number;
    sentCount: number;
    failedCount: number;
    dryRun: boolean;
    failures: Array<{ email: string; error: string }>;
  };
  error?: string;
}

export async function sendCampusNewsletterTool(
  input: SendCampusNewsletterInput
): Promise<SendCampusNewsletterOutput> {
  const { newsletterId, force = false, dryRun = false } = input;

  if (!newsletterId || typeof newsletterId !== 'string' || !newsletterId.startsWith('rec')) {
    return { success: false, error: 'Invalid newsletterId' };
  }

  // 1. Load the newsletter.
  let record: AirtableNewsletterRecord | null;
  try {
    record = await getNewsletterById(newsletterId);
  } catch (err) {
    return {
      success: false,
      error: `Failed to load newsletter: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!record) {
    return { success: false, error: `Newsletter ${newsletterId} not found` };
  }

  const f = record.fields;
  const title = f.Title || '(untitled)';
  const subject = f.Subject || '';
  const bodyHtml = f.BodyHTML || '';
  const hero = f.HeroPhoto && f.HeroPhoto.length > 0 ? f.HeroPhoto[0].url : undefined;
  const currentStatus = f.Status;

  if (!subject || !bodyHtml) {
    return {
      success: false,
      error: `Newsletter ${newsletterId} is missing Subject or BodyHTML`,
    };
  }

  if (!force && (currentStatus === 'Sending' || currentStatus === 'Sent')) {
    return {
      success: false,
      error: `Newsletter is ${currentStatus}; use force=true to re-send`,
    };
  }

  // 2. Flip to Sending (skip in dry-run).
  if (!dryRun) {
    try {
      await updateNewsletter(newsletterId, { Status: 'Sending' });
    } catch (err) {
      logger.error('Failed to mark newsletter as Sending', err, { newsletterId });
      return {
        success: false,
        error: `Failed to update newsletter status: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // 3. Pull the sponsor list.
  let sponsors;
  try {
    sponsors = await findAllSponsorsForNewsletter();
  } catch (err) {
    // Attempt to reset to Draft so Kevin can retry.
    if (!dryRun) {
      await updateNewsletter(newsletterId, {
        Status: 'Failed',
        SendNotes: `Failed to load sponsor list: ${err instanceof Error ? err.message : String(err)}`,
      }).catch(() => {});
    }
    return {
      success: false,
      error: `Failed to load sponsors: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Deduplicate by lowercase email AND collect every kid each sponsor
  // sponsors — we list all their kids' page links in the notification
  // email, since the notification model wants every relationship
  // surfaced as a click target.
  type GroupedRecipient = {
    email: string;
    name: string;
    childRecordIds: string[];
  };
  const byEmail = new Map<string, GroupedRecipient>();
  for (const s of sponsors) {
    const email = (s.fields.SponsorEmail || '').trim().toLowerCase();
    if (!email) continue;
    const childIds = (s.fields.Children as string[] | undefined) || [];
    const existing = byEmail.get(email);
    if (existing) {
      for (const id of childIds) {
        if (!existing.childRecordIds.includes(id)) existing.childRecordIds.push(id);
      }
    } else {
      byEmail.set(email, {
        email: s.fields.SponsorEmail,
        name: s.fields.SponsorName || 'Friend',
        childRecordIds: [...childIds],
      });
    }
  }
  const candidateRecipients = Array.from(byEmail.values());

  // 3b. Apply the marketing opt-out list. Anyone whose Donors row has
  // `Communication Opt-In = false` has hit the unsubscribe link; we must
  // not mail them again (CAN-SPAM + Gmail bulk sender policy).
  //
  // We look donors up one at a time. The list is small (dozens, not
  // thousands) and doing it sponsor-by-sponsor avoids a full Donors-table
  // scan + lets us fail-open per row — a hiccup on one lookup doesn't
  // nuke the whole send.
  type FinalRecipient = {
    email: string;
    name: string;
    childRecordIds: string[];
  };
  const recipients: FinalRecipient[] = [];
  let suppressedCount = 0;
  for (const r of candidateRecipients) {
    try {
      const donor = await findDonorByEmail(r.email);
      if (donor && donor.fields['Communication Opt-In'] === false) {
        suppressedCount += 1;
        continue;
      }
    } catch (err) {
      // Fail-open: if donor lookup errors we still send. Losing reach
      // would be worse than a rare second email to someone who'll just
      // click unsub again.
      logger.warn('Donor opt-in lookup failed; proceeding with send', {
        email: logger.maskEmail(r.email),
        error: err instanceof Error ? err.message : String(err),
      });
    }
    recipients.push(r);
  }

  // 3c. Resolve every linked child record to (firstName, shirtNumber)
  // so the notification email can include per-kid page links.
  const allChildIds = Array.from(
    new Set(recipients.flatMap(r => r.childRecordIds))
  );
  const childMap = await fetchChildrenByRecordIds(allChildIds);

  // 3d. Build the teaser once — same first paragraph for every email.
  const teaser = extractTeaser(bodyHtml);

  logger.info('Campus newsletter send starting', {
    newsletterId,
    title,
    candidateCount: candidateRecipients.length,
    suppressedCount,
    recipientCount: recipients.length,
    dryRun,
  });

  // 4. Dry run short-circuit.
  if (dryRun) {
    return {
      success: true,
      data: {
        newsletterId,
        title,
        subject,
        recipientCount: recipients.length,
        suppressedCount,
        sentCount: 0,
        failedCount: 0,
        dryRun: true,
        failures: [],
      },
    };
  }

  // 5. Send loop. We send serially with small pauses — SendGrid / Gmail
  // can handle bursts, but we're polite and also avoid triggering spam
  // filters on the receiving side.
  let sentCount = 0;
  let failedCount = 0;
  const failures: Array<{ email: string; error: string }> = [];

  for (const r of recipients) {
    // Map this sponsor's linked child record IDs to (firstName, shirtNumber).
    const kids = r.childRecordIds
      .map(id => childMap.get(id))
      .filter((k): k is { shirtNumber: number | null; firstName: string } => !!k)
      .filter(k => typeof k.shirtNumber === 'number')
      .map(k => ({ firstName: k.firstName, shirtNumber: k.shirtNumber as number }));

    // Sponsor with no resolvable kids: skip. They'd get an email with
    // nothing to click. Rare edge case (sponsorship missing Children
    // link or child record was deleted).
    if (kids.length === 0) {
      failedCount += 1;
      failures.push({
        email: r.email,
        error: 'No resolvable kid links for this sponsor',
      });
      continue;
    }

    try {
      const result = await sendNewsletterNotificationEmail({
        sponsorEmail: r.email,
        sponsorName: r.name,
        subject,
        teaser,
        kids,
        heroPhotoUrl: hero,
      });
      if (result.success) {
        sentCount += 1;
      } else {
        failedCount += 1;
        failures.push({ email: r.email, error: result.error || 'Unknown send error' });
      }
    } catch (err) {
      failedCount += 1;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ email: r.email, error: msg });
      logger.error('Newsletter send failed for recipient', err, {
        email: logger.maskEmail(r.email),
      });
    }
    // Small breather between sends.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // 6. Write back the result.
  const finalStatus: 'Sent' | 'Failed' =
    sentCount > 0 ? 'Sent' : 'Failed';

  const sendNotes = failures.length > 0
    ? failures.slice(0, 25)
        .map((f) => `${f.email}: ${f.error}`)
        .join('\n') +
      (failures.length > 25 ? `\n...and ${failures.length - 25} more.` : '')
    : '';

  try {
    await updateNewsletter(newsletterId, {
      Status: finalStatus,
      PublishedAt: new Date().toISOString(),
      RecipientCount: recipients.length,
      SentCount: sentCount,
      FailedCount: failedCount,
      SendNotes: sendNotes,
    });
  } catch (err) {
    logger.error('Failed to update newsletter post-send', err, { newsletterId });
  }

  logger.info('Campus newsletter send complete', {
    newsletterId,
    title,
    recipientCount: recipients.length,
    sentCount,
    failedCount,
  });

  return {
    success: true,
    data: {
      newsletterId,
      title,
      subject,
      recipientCount: recipients.length,
      suppressedCount,
      sentCount,
      failedCount,
      dryRun: false,
      failures,
    },
  };
}

export default sendCampusNewsletterTool;
