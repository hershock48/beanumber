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
import {
  sendNewsletterNotificationEmail,
  sendNewsletterNotificationEmailForNonSponsor,
  sendNewsletterNotificationEmailForLegacyDonor,
} from '../../email';

// Notification model: the full newsletter body lives on /[number] for
// each kid the sponsor sponsors. The email is a short ping with a
// teaser + per-kid link list — every newsletter becomes a reason for
// the sponsor to come back to their kid's page.

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';
const DONATIONS_TABLE = process.env.AIRTABLE_DONATIONS_TABLE || 'Donations';

/**
 * Pull all donor emails that have at least one Stripe-source
 * Donation in Airtable — meaning they bought a shirt or made a
 * donation through Stripe Checkout (any path that runs the
 * webhook). Returned as a lowercased Set for fast membership tests.
 *
 * Used by the newsletter send to split the non-sponsor audience:
 *   - In this set → "shirt buyer" → email points at their kid's page
 *   - Not in this set → "legacy donor" → email points at /news
 *
 * Detection rule: any Donation row whose Stripe Payment Intent ID
 * starts with 'pi_' OR Stripe Checkout Session ID starts with 'cs_'.
 * Donorbox-imported donors have neither.
 */
async function fetchEmailsWithStripeDonations(): Promise<Set<string>> {
  const set = new Set<string>();
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) return set;
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    // Either a real PaymentIntent or a Checkout Session ID present.
    params.set(
      'filterByFormula',
      `OR(LEFT({Stripe Payment Intent ID}, 3)="pi_", LEFT({Stripe Checkout Session ID}, 3)="cs_")`
    );
    params.set('pageSize', '100');
    params.append('fields[]', 'Donor Email at Donation');
    if (offset) params.set('offset', offset);
    try {
      const res = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(DONATIONS_TABLE)}?${params}`,
        {
          headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
          cache: 'no-store',
        }
      );
      if (!res.ok) break;
      const data = await res.json();
      for (const rec of (data.records || []) as Array<{
        id: string;
        fields: { 'Donor Email at Donation'?: string };
      }>) {
        const email = (rec.fields['Donor Email at Donation'] || '')
          .trim()
          .toLowerCase();
        if (email) set.add(email);
      }
      offset = data.offset;
    } catch {
      break;
    }
  } while (offset);
  return set;
}

/**
 * Fetch every emailable Donor — anyone with an email address who
 * hasn't explicitly unsubscribed. Used to extend the newsletter
 * notification to non-sponsors: shirt buyers who didn't convert,
 * one-time donors, etc.
 *
 * Opt-out model (NOT opt-in). The Stripe webhook creates Donor
 * records with `Communication Opt-In` blank by default — they're
 * existing customers who paid for something, so CAN-SPAM's
 * existing-business-relationship exemption covers them and Gmail
 * bulk-sender policy is satisfied by the unsubscribe link in
 * every email. Only people who actively click unsubscribe (which
 * flips Communication Opt-In to false) get suppressed here.
 *
 * The caller subtracts the sponsor email list so emailable
 * sponsors don't get the non-sponsor variant on top of the
 * sponsor variant.
 */
async function fetchEmailableDonors(): Promise<
  Array<{ email: string; name: string }>
> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) return [];
  const out: Array<{ email: string; name: string }> = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    // Include every donor with an email.
    //
    // We can't filter by Communication Opt-In here because of how
    // Airtable serializes checkboxes:
    //   - checked   → field present, value true
    //   - unchecked → field absent from API response (NOT false)
    // That means `NOT({Communication Opt-In} = FALSE())` only matches
    // records where the box is explicitly checked — which is almost
    // nobody, since new Stripe donors are created with the box blank.
    // Filtering on it dropped the non-sponsor count to 0.
    //
    // For an opt-out model we'd need a separate `Unsubscribed`
    // boolean field (default false, flipped true on unsub click)
    // that's properly queryable. Until that schema change ships,
    // we trust the unsub click to work via other means and include
    // everyone with an email. CAN-SPAM's existing-customer-
    // relationship rule covers this audience.
    params.set('filterByFormula', `{Email Address} != BLANK()`);
    params.set('pageSize', '100');
    params.append('fields[]', 'Email Address');
    params.append('fields[]', 'Donor Name');
    if (offset) params.set('offset', offset);
    try {
      const res = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(DONORS_TABLE)}?${params}`,
        {
          headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
          cache: 'no-store',
        }
      );
      if (!res.ok) break;
      const data = await res.json();
      for (const rec of (data.records || []) as Array<{
        id: string;
        fields: { 'Email Address'?: string; 'Donor Name'?: string };
      }>) {
        const email = (rec.fields['Email Address'] || '').trim();
        if (!email) continue;
        out.push({ email, name: rec.fields['Donor Name'] || 'Friend' });
      }
      offset = data.offset;
    } catch {
      break;
    }
  } while (offset);
  return out;
}

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
 * Pull a clean 1–2-sentence teaser out of the newsletter body HTML.
 * Strips tags, normalizes whitespace, then walks sentence by sentence
 * and accumulates until the result feels like a complete thought
 * around 180–320 characters. Always cuts at a real sentence boundary,
 * never mid-word.
 */
function extractTeaser(html: string): string {
  if (!html) return '';
  // Take everything before any later <h2/h3 (skip the rest of the article).
  const beforeHeader = html.split(/<h[1-4]\b/i)[0] || html;
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
    .replace(/&mdash;/g, '—')
    .replace(/[ \t]+/g, ' ');

  const firstPara = stripped
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .find(s => s.length > 0) || '';

  if (firstPara.length <= 280) return firstPara;

  // Sentence-by-sentence accumulator. Take whole sentences until the
  // result is either (a) past ~180 chars and at a sentence end, or
  // (b) would exceed ~320 chars with the next sentence added.
  const sentences = firstPara.match(/[^.!?]+[.!?]+\s*/g);
  if (!sentences || sentences.length === 0) {
    // Fallback: no sentence punctuation found, just return the para
    // capped at 280 with no mid-word cut.
    const slice = firstPara.slice(0, 280);
    const lastSpace = slice.lastIndexOf(' ');
    return (lastSpace > 200 ? slice.slice(0, lastSpace) : slice).trimEnd() + '…';
  }

  let acc = '';
  for (const s of sentences) {
    const next = (acc + s).trim();
    if (acc.length > 0 && next.length > 320) break;
    acc = next;
    if (acc.length >= 180) break;
  }
  return acc.trim();
}

export interface SendCampusNewsletterInput {
  /** Airtable record ID (starts with 'rec') for the Newsletters table row. */
  newsletterId: string;
  /** If true, send even if Status is already 'Sending' or 'Sent'. Default false. */
  force?: boolean;
  /** If true, look up the sponsor list but don't actually send. For sanity checks. */
  dryRun?: boolean;
  /**
   * If set, send ONE preview of each variant (sponsor + non-sponsor)
   * to this email address. Useful for Kevin to see exactly what
   * recipients will receive before pulling the trigger on the real
   * blast. The newsletter's Status stays as Draft — this is a test,
   * not the actual send.
   *
   * When testTo is supplied, the function returns both the
   * sponsor-recipient count and the non-sponsor-recipient count so
   * the UI can show 'will send to X sponsors + Y non-sponsors'.
   */
  testTo?: string;
}

export interface SendCampusNewsletterOutput {
  success: boolean;
  data?: {
    newsletterId: string;
    title: string;
    subject: string;
    recipientCount: number;
    /** How many non-sponsors total would receive a teaser. */
    nonSponsorRecipientCount: number;
    /** Of the non-sponsors, how many are shirt buyers (Stripe). */
    shirtBuyerRecipientCount: number;
    /** Of the non-sponsors, how many are legacy donors (no Stripe). */
    legacyDonorRecipientCount: number;
    /** How many sponsors we filtered out for being unsubscribed. */
    suppressedCount: number;
    sentCount: number;
    failedCount: number;
    dryRun: boolean;
    /** True when this run was a test-to-inbox preview. */
    testSend: boolean;
    failures: Array<{ email: string; error: string }>;
  };
  error?: string;
}

export async function sendCampusNewsletterTool(
  input: SendCampusNewsletterInput
): Promise<SendCampusNewsletterOutput> {
  const { newsletterId, force = false, dryRun = false } = input;
  const testTo = (input.testTo || '').trim();
  const isTestSend = !!testTo;
  // Test sends never touch Newsletter Status and never run the real
  // send loop. They surface counts + send one preview of each
  // variant to the test address.
  const skipRealSend = dryRun || isTestSend;

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
  const explicitTeaser = (f.Teaser || '').trim();
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

  // 2. Flip to Sending (skip in dry-run / test-send — those don't
  //    touch the real Status).
  if (!skipRealSend) {
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
    if (!skipRealSend) {
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

  // 3d. Build the teaser once. If the Newsletter record has an
  // explicit Teaser, use it verbatim. Otherwise fall back to
  // extracting the first paragraph from the body HTML.
  const teaser = explicitTeaser || extractTeaser(bodyHtml);

  // 3e. Count the non-sponsor recipients upfront, split by variant.
  // Shirt buyers get the "type your shirt number" copy pointing at
  // their kid's page. Legacy donors (no Stripe donation on file —
  // typically Donorbox imports) get the /news copy pointing at the
  // dedicated campus feed page.
  let nonSponsorRecipientCount = 0;
  let shirtBuyerRecipientCount = 0;
  let legacyDonorRecipientCount = 0;
  const sponsorEmailSet = new Set(
    recipients.map(r => r.email.trim().toLowerCase())
  );
  let emailableDonorsCached: Array<{ email: string; name: string }> = [];
  let stripeEmailsCached: Set<string> = new Set();
  try {
    [emailableDonorsCached, stripeEmailsCached] = await Promise.all([
      fetchEmailableDonors(),
      fetchEmailsWithStripeDonations(),
    ]);
    const nonSponsorList = emailableDonorsCached.filter(
      d => !sponsorEmailSet.has(d.email.trim().toLowerCase())
    );
    nonSponsorRecipientCount = nonSponsorList.length;
    for (const d of nonSponsorList) {
      const email = d.email.trim().toLowerCase();
      if (stripeEmailsCached.has(email)) shirtBuyerRecipientCount += 1;
      else legacyDonorRecipientCount += 1;
    }
  } catch (err) {
    logger.warn('Non-sponsor recipient count failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info('Campus newsletter send starting', {
    newsletterId,
    title,
    candidateCount: candidateRecipients.length,
    suppressedCount,
    sponsorRecipientCount: recipients.length,
    nonSponsorRecipientCount,
    shirtBuyerRecipientCount,
    legacyDonorRecipientCount,
    dryRun,
    testSend: isTestSend,
  });

  // 4. Test-send branch — fire ONE preview of each variant to the
  // test address, then return the counts. Doesn't touch Status,
  // doesn't run the real send loop.
  if (isTestSend) {
    const testFailures: Array<{ email: string; error: string }> = [];
    // Build a sponsor preview using the first recipient's kid list
    // (so the per-kid page links resolve to real kids). If there are
    // no sponsors yet, send a generic 'Friend' preview with empty
    // kids list.
    const sponsorTemplate = recipients[0];
    const sponsorKids = sponsorTemplate
      ? sponsorTemplate.childRecordIds
          .map(id => childMap.get(id))
          .filter((k): k is { shirtNumber: number | null; firstName: string } => !!k)
          .filter(k => typeof k.shirtNumber === 'number')
          .map(k => ({ firstName: k.firstName, shirtNumber: k.shirtNumber as number }))
      : [];

    try {
      const r1 = await sendNewsletterNotificationEmail({
        sponsorEmail: testTo,
        sponsorName: sponsorTemplate?.name || 'Friend',
        subject: `[TEST · sponsor view] ${subject}`,
        teaser,
        kids: sponsorKids,
        heroPhotoUrl: hero,
      });
      if (!r1.success) {
        testFailures.push({
          email: testTo,
          error: `(sponsor preview) ${r1.error || 'send failed'}`,
        });
      }
    } catch (err) {
      testFailures.push({
        email: testTo,
        error: `(sponsor preview) ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    try {
      const r2 = await sendNewsletterNotificationEmailForNonSponsor({
        recipientEmail: testTo,
        recipientName: 'Friend',
        subject: `[TEST · shirt buyer view] ${subject}`,
        teaser,
        heroPhotoUrl: hero,
      });
      if (!r2.success) {
        testFailures.push({
          email: testTo,
          error: `(shirt buyer preview) ${r2.error || 'send failed'}`,
        });
      }
    } catch (err) {
      testFailures.push({
        email: testTo,
        error: `(shirt buyer preview) ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    try {
      const r3 = await sendNewsletterNotificationEmailForLegacyDonor({
        recipientEmail: testTo,
        recipientName: 'Friend',
        subject: `[TEST · legacy donor view] ${subject}`,
        teaser,
        heroPhotoUrl: hero,
      });
      if (!r3.success) {
        testFailures.push({
          email: testTo,
          error: `(legacy donor preview) ${r3.error || 'send failed'}`,
        });
      }
    } catch (err) {
      testFailures.push({
        email: testTo,
        error: `(legacy donor preview) ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return {
      success: true,
      data: {
        newsletterId,
        title,
        subject,
        recipientCount: recipients.length,
        nonSponsorRecipientCount,
        shirtBuyerRecipientCount,
        legacyDonorRecipientCount,
        suppressedCount,
        sentCount: 3 - testFailures.length,
        failedCount: testFailures.length,
        dryRun: false,
        testSend: true,
        failures: testFailures,
      },
    };
  }

  // 4b. Dry run short-circuit (counts only, no sends).
  if (dryRun) {
    return {
      success: true,
      data: {
        newsletterId,
        title,
        subject,
        recipientCount: recipients.length,
        nonSponsorRecipientCount,
        shirtBuyerRecipientCount,
        legacyDonorRecipientCount,
        suppressedCount,
        sentCount: 0,
        failedCount: 0,
        dryRun: true,
        testSend: false,
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

  // 5b. Extend the send to NON-sponsors, split by audience:
  //   - Shirt buyers (have any Stripe-source Donation): get the
  //     "type your shirt number" copy pointing at their kid page.
  //   - Legacy donors (no Stripe Donations — typically Donorbox
  //     imports): get the /news copy pointing at the dedicated
  //     campus feed page.
  //
  // We reuse the cached emailable donors + stripe-email set from
  // step 3e so we're not re-querying Airtable.
  let nonSponsorSent = 0;
  let nonSponsorFailed = 0;
  try {
    const emailableDonors = emailableDonorsCached.length > 0
      ? emailableDonorsCached
      : await fetchEmailableDonors();
    const stripeEmails = stripeEmailsCached.size > 0
      ? stripeEmailsCached
      : await fetchEmailsWithStripeDonations();
    const nonSponsorRecipients = emailableDonors.filter(
      d => !sponsorEmailSet.has(d.email.trim().toLowerCase())
    );

    logger.info('Newsletter non-sponsor send starting', {
      newsletterId,
      candidateCount: nonSponsorRecipients.length,
      shirtBuyerCount: shirtBuyerRecipientCount,
      legacyDonorCount: legacyDonorRecipientCount,
    });

    for (const r of nonSponsorRecipients) {
      const isShirtBuyer = stripeEmails.has(r.email.trim().toLowerCase());
      const sendFn = isShirtBuyer
        ? sendNewsletterNotificationEmailForNonSponsor
        : sendNewsletterNotificationEmailForLegacyDonor;
      const variantLabel = isShirtBuyer ? 'shirt buyer' : 'legacy donor';
      try {
        const result = await sendFn({
          recipientEmail: r.email,
          recipientName: r.name,
          subject,
          teaser,
          heroPhotoUrl: hero,
        });
        if (result.success) {
          nonSponsorSent += 1;
        } else {
          nonSponsorFailed += 1;
          failures.push({
            email: r.email,
            error: `(${variantLabel}) ${result.error || 'Unknown send error'}`,
          });
        }
      } catch (err) {
        nonSponsorFailed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ email: r.email, error: `(${variantLabel}) ${msg}` });
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch (err) {
    logger.warn('Non-sponsor send list fetch failed; continuing without it', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  sentCount += nonSponsorSent;
  failedCount += nonSponsorFailed;

  // 6. Write back the result.
  const finalStatus: 'Sent' | 'Failed' =
    sentCount > 0 ? 'Sent' : 'Failed';

  const sendNotes = failures.length > 0
    ? failures.slice(0, 25)
        .map((f) => `${f.email}: ${f.error}`)
        .join('\n') +
      (failures.length > 25 ? `\n...and ${failures.length - 25} more.` : '')
    : '';

  const totalRecipients = recipients.length + nonSponsorSent + nonSponsorFailed;
  try {
    await updateNewsletter(newsletterId, {
      Status: finalStatus,
      PublishedAt: new Date().toISOString(),
      RecipientCount: totalRecipients,
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
      nonSponsorRecipientCount,
      shirtBuyerRecipientCount,
      legacyDonorRecipientCount,
      suppressedCount,
      sentCount,
      failedCount,
      dryRun: false,
      testSend: false,
      failures,
    },
  };
}

export default sendCampusNewsletterTool;
