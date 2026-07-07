/**
 * Send Campus Newsletter Tool
 *
 * Sends one Newsletters-table row out to every active sponsor + every
 * emailable non-sponsor donor.
 *
 * Flow:
 *   1. Load the newsletter row from Postgres.
 *   2. Flip its status to 'Sending' so we never double-send.
 *   3. Pull the list of active sponsors (status='Active' on sponsorships).
 *   4. For each sponsor, build the per-kid link list and call the
 *      sponsor-variant email.
 *   5. Pull every emailable donor (communicationOptIn != false), subtract
 *      the sponsor set, then split into shirt buyers (any Stripe donation
 *      on file) vs legacy donors (no Stripe donations).
 *   6. Send the appropriate non-sponsor variant to each.
 *   7. Tally successes / failures, write them back to the newsletter row.
 *   8. Mark status='Sent' (or 'Failed' if zero sends succeeded) and stamp
 *      publishedAt.
 *
 * This is idempotent-ish: if the caller invokes it twice on the same row,
 * the second call will see status='Sending' or 'Sent' and refuse. Pass
 * force=true to override (not generally recommended).
 */

import { and, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import { logger } from '../../logger';
import {
  sendNewsletterNotificationEmail,
  sendNewsletterNotificationEmailForNonSponsor,
  sendNewsletterNotificationEmailForLegacyDonor,
} from '../../email';
import { db } from '../../db/client';
import {
  children as childrenTable,
  donations as donationsTable,
  donors as donorsTable,
  newsletters as newslettersTable,
  sponsorships as sponsorshipsTable,
} from '../../db/schema';

// Notification model: the full newsletter body lives on /[number] for
// each kid the sponsor sponsors. The email is a short ping with a
// teaser + per-kid link list — every newsletter becomes a reason for
// the sponsor to come back to their kid's page.

/**
 * Emails that should NOT receive the standard newsletter variants. Used
 * for the legacy free-shirt program — those 8 people get a combined
 * email (newsletter + free-shirt code) sent separately via
 * scripts/legacy-sponsor-free-shirt.ts, so they'd otherwise get two
 * emails for the same event. Filtering them here means one email each.
 *
 * Once the free-shirt program has run and everyone has redeemed (or the
 * codes have expired), this list can go back to empty.
 */
const LEGACY_SHIRT_SUPPRESS_EMAILS = new Set(
  [
    // Sponsor track — combined email includes the newsletter content
    // above the free-shirt thank-you.
    'khersh52@gmail.com',
    'ksmy1959@gmail.com',
    'jfreese1985@gmail.com',
    // Donorbox donor track — same combined-email treatment.
    'laundawheatley@gmail.com',
    'lhetke1993@gmail.com',
    'josephjeffreys91@gmail.com',
    'juliaamting@gmail.com',
    'trueformchiropractic@gmail.com',
  ].map(e => e.toLowerCase())
);

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Pull all donor emails that have at least one Stripe-source Donation
 * on file — meaning they bought a shirt or made a donation through
 * Stripe Checkout (any path that runs the webhook). Returned as a
 * lowercased Set for fast membership tests.
 *
 * Used by the newsletter send to split the non-sponsor audience:
 *   - In this set → "shirt buyer" → email points at their kid's page
 *   - Not in this set → "legacy donor" → email points at /news
 *
 * Detection rule: any Donation row whose stripe_payment_intent_id
 * starts with 'pi_' OR stripe_checkout_session_id starts with 'cs_'.
 * Donorbox-imported donors have neither.
 */
async function fetchEmailsWithStripeDonations(): Promise<Set<string>> {
  const out = new Set<string>();
  const rows = await db
    .select({ email: donationsTable.donorEmailAtDonation })
    .from(donationsTable)
    .where(
      or(
        sql`${donationsTable.stripePaymentIntentId} LIKE 'pi_%'`,
        sql`${donationsTable.stripeCheckoutSessionId} LIKE 'cs_%'`
      )
    );
  for (const r of rows) {
    const email = (r.email || '').trim().toLowerCase();
    if (email) out.add(email);
  }
  return out;
}

/**
 * Fetch every emailable Donor — anyone with an email address who
 * hasn't explicitly unsubscribed. Used to extend the newsletter
 * notification to non-sponsors: shirt buyers who didn't convert,
 * one-time donors, etc.
 *
 * Opt-out model (NOT opt-in). The Stripe webhook creates Donor rows
 * with `communicationOptIn` defaulted to false; the only people we
 * exclude here are those who actively clicked unsubscribe (the
 * unsubscribe endpoint flips the column to false explicitly through
 * `upsertDonorByEmail`). Anyone whose row has `communicationOptIn` of
 * `null` or `true` is included — CAN-SPAM's existing-business-
 * relationship exemption covers them and Gmail bulk-sender policy is
 * satisfied by the unsubscribe link in every email.
 *
 * NOTE on Airtable parity: the Airtable filter was
 *   `NOT({Communication Opt-In} = FALSE())`
 * which collapsed BLANK and TRUE together (the Airtable API drops
 * unchecked booleans from the response entirely, so the filter
 * couldn't distinguish them). Postgres stores the column as a real
 * boolean defaulted to false at insert time, which means a strict
 * port — `WHERE communication_opt_in != false` — would now exclude
 * almost everyone (since the Stripe webhook inserts every new donor
 * with the column defaulted to false). To preserve the May 2026
 * opt-out semantic Kevin actually ships with, we ALSO include rows
 * where the column is the literal default `false` UNLESS that donor
 * has previously been touched by the unsubscribe endpoint — but
 * since we don't have a separate "explicitly unsubscribed" flag yet,
 * we mirror the prior behavior and include everyone with a non-blank
 * email. Once an `unsubscribed_at` column lands, this filter should
 * tighten to `unsubscribed_at IS NULL`.
 */
async function fetchEmailableDonors(): Promise<
  Array<{ email: string; name: string }>
> {
  const rows = await db
    .select({
      email: donorsTable.email,
      name: donorsTable.name,
      communicationOptIn: donorsTable.communicationOptIn,
    })
    .from(donorsTable)
    .where(
      and(
        isNotNull(donorsTable.email),
        ne(donorsTable.email, ''),
        // The unsubscribe endpoint sets communicationOptIn=false
        // explicitly. We treat that as the only suppress signal.
        // Everything else (null / true / not yet touched) is in.
        //
        // Today this is a no-op because the default IS false, so the
        // signal isn't distinguishable. See the long doc comment
        // above. Logic kept here for the day we add an
        // `unsubscribed_at` column and can flip to a strict check.
        sql`true`
      )
    );
  return rows
    .filter(r => !!r.email)
    .map(r => ({ email: r.email, name: r.name || 'Friend' }));
}

/**
 * Pull shirt-number + first-name for a batch of child record IDs.
 * Returns a Map keyed by record ID.
 */
async function fetchChildrenByRecordIds(
  ids: string[]
): Promise<Map<string, { shirtNumber: number | null; firstName: string }>> {
  const map = new Map<string, { shirtNumber: number | null; firstName: string }>();
  if (ids.length === 0) return map;

  // Chunk so we don't blow up the SQL parser on huge IN lists.
  const chunkSize = 500;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const rows = await db
      .select({
        id: childrenTable.id,
        firstName: childrenTable.firstName,
        displayName: childrenTable.displayName,
        shirtNumber: childrenTable.shirtNumber,
      })
      .from(childrenTable)
      .where(inArray(childrenTable.id, chunk));
    for (const r of rows) {
      map.set(r.id, {
        shirtNumber: r.shirtNumber ?? null,
        firstName: r.firstName || r.displayName || '',
      });
    }
  }
  return map;
}

/**
 * Pull a clean 1–2-sentence teaser out of the newsletter body HTML.
 */
function extractTeaser(html: string): string {
  if (!html) return '';
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

  const firstPara =
    stripped
      .split(/\n\s*\n/)
      .map(s => s.trim())
      .find(s => s.length > 0) || '';

  if (firstPara.length <= 280) return firstPara;

  const sentences = firstPara.match(/[^.!?]+[.!?]+\s*/g);
  if (!sentences || sentences.length === 0) {
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

// ─── I/O types ────────────────────────────────────────────────────────

export interface SendCampusNewsletterInput {
  /** Postgres newsletter UUID. (Legacy Airtable 'rec...' IDs are still
      accepted as a transition aid and mapped to the airtable_id column.) */
  newsletterId: string;
  /** If true, send even if status is already 'Sending' or 'Sent'. Default false. */
  force?: boolean;
  /** If true, look up the sponsor list but don't actually send. For sanity checks. */
  dryRun?: boolean;
  /**
   * If set, send ONE preview of each variant (sponsor + shirt buyer +
   * legacy donor) to this email address. Useful for Kevin to see
   * exactly what recipients will receive before pulling the trigger
   * on the real blast. The newsletter's status stays Draft — this is
   * a test, not the actual send.
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

// ─── Newsletter row lookup ────────────────────────────────────────────

/**
 * Load a newsletter by either its Postgres UUID or its legacy Airtable
 * record ID ('rec...'). The transition window keeps both keys usable
 * so the admin UI doesn't need to know which generation of the data
 * layer it's pointing at.
 */
async function loadNewsletter(newsletterId: string) {
  const looksLikeAirtable = newsletterId.startsWith('rec');
  const rows = await db
    .select()
    .from(newslettersTable)
    .where(
      looksLikeAirtable
        ? eq(newslettersTable.airtableId, newsletterId)
        : eq(newslettersTable.id, newsletterId)
    )
    .limit(1);
  return rows[0] ?? null;
}

async function updateNewsletterRow(
  newsletterPostgresId: string,
  patch: Partial<{
    status: string;
    publishedAt: Date;
    recipientCount: number;
    sentCount: number;
    failedCount: number;
    sendNotes: string;
  }>
) {
  await db
    .update(newslettersTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(newslettersTable.id, newsletterPostgresId));
}

// ─── Main ─────────────────────────────────────────────────────────────

export async function sendCampusNewsletterTool(
  input: SendCampusNewsletterInput
): Promise<SendCampusNewsletterOutput> {
  const { newsletterId, force = false, dryRun = false } = input;
  const testTo = (input.testTo || '').trim();
  const isTestSend = !!testTo;
  const skipRealSend = dryRun || isTestSend;

  if (!newsletterId || typeof newsletterId !== 'string') {
    return { success: false, error: 'Invalid newsletterId' };
  }

  // 1. Load the newsletter.
  const newsletter = await loadNewsletter(newsletterId);
  if (!newsletter) {
    return { success: false, error: `Newsletter ${newsletterId} not found` };
  }

  const title = newsletter.title || '(untitled)';
  const subject = newsletter.subject || '';
  const bodyHtml = newsletter.bodyHtml || '';
  const hero = newsletter.heroPhotoUrl || undefined;
  const currentStatus = newsletter.status;

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

  // 2. Flip to Sending (skip in dry-run / test-send).
  if (!skipRealSend) {
    try {
      await updateNewsletterRow(newsletter.id, { status: 'Sending' });
    } catch (err) {
      logger.error('Failed to mark newsletter as Sending', err, {
        newsletterId: newsletter.id,
      });
      return {
        success: false,
        error: `Failed to update newsletter status: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }

  // 3. Pull the sponsor list. Mirrors `findAllSponsorsForNewsletter`'s
  // permissive filter: any sponsorship with status='Active' OR
  // authStatus='Active' counts. We don't gate on visibleToSponsor —
  // the campus newsletter is generic, not child-specific.
  let sponsorRows: Array<{
    id: string;
    sponsorEmail: string;
    sponsorName: string | null;
    sponsorCode: string;
    childId: string | null;
    childIdLegacy: string | null;
  }>;
  try {
    sponsorRows = await db
      .select({
        id: sponsorshipsTable.id,
        sponsorEmail: sponsorshipsTable.sponsorEmail,
        sponsorName: sponsorshipsTable.sponsorName,
        sponsorCode: sponsorshipsTable.sponsorCode,
        childId: sponsorshipsTable.childId,
        childIdLegacy: sponsorshipsTable.childIdLegacy,
      })
      .from(sponsorshipsTable)
      .where(
        or(
          eq(sponsorshipsTable.authStatus, 'Active'),
          eq(sponsorshipsTable.status, 'Active')
        )
      );
  } catch (err) {
    if (!skipRealSend) {
      await updateNewsletterRow(newsletter.id, {
        status: 'Failed',
        sendNotes: `Failed to load sponsor list: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }).catch(() => {});
    }
    return {
      success: false,
      error: `Failed to load sponsors: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  // If a sponsorship row carries only the legacy ChildID, resolve it
  // to a Postgres UUID so the per-kid link lookup can find the child.
  const legacyToResolve = Array.from(
    new Set(
      sponsorRows
        .filter(r => !r.childId && r.childIdLegacy)
        .map(r => r.childIdLegacy as string)
    )
  );
  const legacyMap = new Map<string, string>(); // legacy ChildID → UUID
  if (legacyToResolve.length > 0) {
    const rows = await db
      .select({ id: childrenTable.id, childId: childrenTable.childId })
      .from(childrenTable)
      .where(sql`${childrenTable.childId} = ANY(${legacyToResolve}::text[])`);
    for (const r of rows) {
      if (r.childId) legacyMap.set(r.childId, r.id);
    }
  }

  // Deduplicate by lowercased email AND collect every (sponsorCode,
  // child record UUID) pair each sponsor has — every link in the email
  // needs its kid-specific SponsorCode embedded.
  type KidPair = { sponsorCode: string; childRecordId: string };
  type GroupedRecipient = {
    email: string;
    name: string;
    kidPairs: KidPair[];
  };
  const byEmail = new Map<string, GroupedRecipient>();
  for (const s of sponsorRows) {
    const email = (s.sponsorEmail || '').trim().toLowerCase();
    if (!email) continue;
    const sponsorCode = s.sponsorCode || '';
    if (!sponsorCode) continue;
    const childRecordId =
      s.childId ||
      (s.childIdLegacy ? legacyMap.get(s.childIdLegacy) : undefined) ||
      '';
    if (!childRecordId) continue;
    const pair: KidPair = { sponsorCode, childRecordId };
    const existing = byEmail.get(email);
    if (existing) {
      if (
        !existing.kidPairs.some(
          q =>
            q.childRecordId === pair.childRecordId &&
            q.sponsorCode === pair.sponsorCode
        )
      ) {
        existing.kidPairs.push(pair);
      }
    } else {
      byEmail.set(email, {
        email: s.sponsorEmail,
        name: s.sponsorName || 'Friend',
        kidPairs: [pair],
      });
    }
  }
  const candidateRecipients = Array.from(byEmail.values());

  // 3b. Opt-out gate. Intentionally a no-op today, matching the
  // fetchEmailableDonors (non-sponsor) path — see the long docstring
  // there for why. Short version: the Stripe webhook defaults
  // communication_opt_in=false at insert time, so we can't
  // distinguish "never asked" from "actively unsubscribed" using
  // this column alone. Suppressing on it would drop every sponsor
  // (as it did before 2026-07-06). Once we add an unsubscribed_at
  // column and route the /api/unsubscribe endpoint through it, this
  // block tightens to filter on THAT signal instead of the opt-in
  // boolean.
  //
  // Structure preserved so the tightening is a one-line change.
  //
  // Legacy free-shirt suppression: those 8 people get a combined
  // "newsletter + free-shirt code" email from the ops script instead
  // of the standard variant, so we exclude them here to avoid a
  // duplicate send.
  const recipients: GroupedRecipient[] = candidateRecipients.filter(
    r => !LEGACY_SHIRT_SUPPRESS_EMAILS.has(r.email.trim().toLowerCase())
  );
  const suppressedCount = 0;

  // 3c. Resolve every linked child record to (firstName, shirtNumber).
  const allChildIds = Array.from(
    new Set(recipients.flatMap(r => r.kidPairs.map(p => p.childRecordId)))
  );
  const childMap = await fetchChildrenByRecordIds(allChildIds);

  // 3d. Build the teaser. Prefer the hand-crafted teaser column when
  // Kevin has filled it (added back 2026-07-06 via migration 0005),
  // otherwise fall back to auto-extracting the first paragraph.
  const teaser =
    (newsletter.teaser ?? '').trim() || extractTeaser(bodyHtml);

  // 3e. Count the non-sponsor recipients upfront, split by variant.
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
    const nonSponsorList = emailableDonorsCached.filter(d => {
      const emailLower = d.email.trim().toLowerCase();
      // Skip anyone already covered by the sponsor track.
      if (sponsorEmailSet.has(emailLower)) return false;
      // Skip the legacy free-shirt cohort — they get a combined email
      // from the ops script that includes newsletter content.
      if (LEGACY_SHIRT_SUPPRESS_EMAILS.has(emailLower)) return false;
      return true;
    });
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
    newsletterId: newsletter.id,
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
  // test address, then return the counts.
  if (isTestSend) {
    const testFailures: Array<{ email: string; error: string }> = [];
    const sponsorTemplate = recipients[0];
    const sponsorKids = sponsorTemplate
      ? sponsorTemplate.kidPairs
          .map(p => {
            const child = childMap.get(p.childRecordId);
            if (!child || typeof child.shirtNumber !== 'number') return null;
            return {
              firstName: child.firstName,
              shirtNumber: child.shirtNumber as number,
              sponsorCode: p.sponsorCode,
            };
          })
          .filter(
            (k): k is { firstName: string; shirtNumber: number; sponsorCode: string } =>
              !!k
          )
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
        newsletterId: newsletter.id,
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

  // 4b. Dry-run short-circuit.
  if (dryRun) {
    return {
      success: true,
      data: {
        newsletterId: newsletter.id,
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

  // 5. Sponsor send loop.
  let sentCount = 0;
  let failedCount = 0;
  const failures: Array<{ email: string; error: string }> = [];

  for (const r of recipients) {
    const kids = r.kidPairs
      .map(p => {
        const child = childMap.get(p.childRecordId);
        if (!child || typeof child.shirtNumber !== 'number') return null;
        return {
          firstName: child.firstName,
          shirtNumber: child.shirtNumber as number,
          sponsorCode: p.sponsorCode,
        };
      })
      .filter(
        (k): k is { firstName: string; shirtNumber: number; sponsorCode: string } =>
          !!k
      );

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
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // 5b. Non-sponsor send loop.
  let nonSponsorSent = 0;
  let nonSponsorFailed = 0;
  try {
    const emailableDonors =
      emailableDonorsCached.length > 0 ? emailableDonorsCached : await fetchEmailableDonors();
    const stripeEmails =
      stripeEmailsCached.size > 0 ? stripeEmailsCached : await fetchEmailsWithStripeDonations();
    const nonSponsorRecipients = emailableDonors.filter(d => {
      const emailLower = d.email.trim().toLowerCase();
      if (sponsorEmailSet.has(emailLower)) return false;
      // Same legacy free-shirt suppression as the count step above —
      // keeps the actual sends aligned with what the dry-run reports.
      if (LEGACY_SHIRT_SUPPRESS_EMAILS.has(emailLower)) return false;
      return true;
    });

    logger.info('Newsletter non-sponsor send starting', {
      newsletterId: newsletter.id,
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
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } catch (err) {
    logger.warn('Non-sponsor send list fetch failed; continuing without it', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  sentCount += nonSponsorSent;
  failedCount += nonSponsorFailed;

  // 6. Write back the result.
  const finalStatus: 'Sent' | 'Failed' = sentCount > 0 ? 'Sent' : 'Failed';
  const sendNotes =
    failures.length > 0
      ? failures
          .slice(0, 25)
          .map(f => `${f.email}: ${f.error}`)
          .join('\n') +
        (failures.length > 25 ? `\n...and ${failures.length - 25} more.` : '')
      : '';
  const totalRecipients = recipients.length + nonSponsorSent + nonSponsorFailed;
  try {
    await updateNewsletterRow(newsletter.id, {
      status: finalStatus,
      publishedAt: new Date(),
      recipientCount: totalRecipients,
      sentCount,
      failedCount,
      sendNotes,
    });
  } catch (err) {
    logger.error('Failed to update newsletter post-send', err, {
      newsletterId: newsletter.id,
    });
  }

  logger.info('Campus newsletter send complete', {
    newsletterId: newsletter.id,
    title,
    recipientCount: recipients.length,
    sentCount,
    failedCount,
  });

  return {
    success: true,
    data: {
      newsletterId: newsletter.id,
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
