import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { sendEmail } from '@/lib/email';
import {
  mirrorToPostgres,
  mirrorDonation,
  mirrorSponsorship,
  mirrorSubscription,
  mirrorSubscriptionDeleted,
  mirrorRefund,
  mirrorDripFields,
  mirrorCommunication,
  findDonationByPaymentIntent,
} from '@/lib/db/webhook-bridge';
import { db } from '@/lib/db/client';
import { fulfillments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { generateUniqueSponsorCode } from '@/lib/sponsor-codes';

// Allow up to 60 seconds for the webhook handler. The default 10s on
// Hobby plans is too tight — a shirt order does 8+ Airtable API calls,
// email sends, and Stripe subscription backfills.
export const maxDuration = 60;

const SHIRT_PRICE = 25; // dollars — used for subscription unit_amount and sponsorship records

// Initialize Stripe lazily
async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('[Webhook] STRIPE_SECRET_KEY is not set');
    throw new Error('Payment system configuration error');
  }
  return new StripeModule(secretKey, {
    apiVersion: '2025-12-15.clover',
  });
}

// Validate required environment variables for webhook
function validateWebhookEnvVars() {
  const required = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY,
    AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
  };
  
  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);
  
  if (missing.length > 0) {
    console.error('[Webhook] Missing required environment variables:', missing);
    // Don't throw - log and continue (webhook should still respond to Stripe)
  }
}

// Rate limiter for Airtable API (5 requests per second)
class RateLimiter {
  private queue: Array<() => void> = [];
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second

  constructor(maxTokens: number, perSeconds: number = 1) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = maxTokens / perSeconds;
    this.startRefill();
  }

  private startRefill() {
    setInterval(() => {
      this.tokens = Math.min(this.maxTokens, this.tokens + this.refillRate / 10);
      this.processQueue();
    }, 100); // Check every 100ms
  }

  private processQueue() {
    while (this.queue.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }
  }

  async removeTokens(count: number): Promise<void> {
    return new Promise((resolve) => {
      for (let i = 0; i < count; i++) {
        this.queue.push(resolve);
      }
      this.processQueue();
    });
  }
}

const airtableRateLimiter = new RateLimiter(5, 1);

// Airtable API helper with retry logic
async function airtableAPICall<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  await airtableRateLimiter.removeTokens(1);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      if (attempt === maxRetries) throw error;
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[Airtable] Retry attempt ${attempt} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

// Airtable API configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_DONORS_TABLE = process.env.AIRTABLE_DONORS_TABLE || 'Donors';
const AIRTABLE_DONATIONS_TABLE = process.env.AIRTABLE_DONATIONS_TABLE || 'Donations';
const AIRTABLE_COMMUNICATIONS_TABLE = process.env.AIRTABLE_COMMUNICATIONS_TABLE || 'Communications';
const AIRTABLE_SPONSORSHIPS_TABLE = process.env.AIRTABLE_SPONSORSHIPS_TABLE || 'Sponsorships';
const AIRTABLE_CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const AIRTABLE_SUBSCRIPTIONS_TABLE = 'Subscriptions';
const AIRTABLE_FULFILLMENT_TABLE_ID = 'tblkSZBRrMiHhT3MP';

function getAirtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Map free-text referral answer to one of the How They Heard single-select choices.
// Everything that doesn't match goes to Notes verbatim.
function classifyReferral(raw: string): { choice: string | null; rawNote: string } {
  const text = raw.trim();
  if (!text) return { choice: null, rawNote: '' };
  const lower = text.toLowerCase();

  if (/instagram|facebook|tiktok|twitter|x\.com|social|insta|fb|ig/.test(lower)) {
    return { choice: 'Social media', rawNote: text };
  }
  if (/shirt|tee|t-shirt/.test(lower)) {
    return { choice: 'Saw a shirt', rawNote: text };
  }
  if (/church|pastor|congregation|sermon/.test(lower)) {
    return { choice: 'Church', rawNote: text };
  }
  if (/event|fundrais|gala|dinner|speak/.test(lower)) {
    return { choice: 'Event', rawNote: text };
  }
  if (/news|article|podcast|radio|tv|press|media/.test(lower)) {
    return { choice: 'News/Media', rawNote: text };
  }
  if (/search|google|bing|duckduckgo/.test(lower)) {
    return { choice: 'Web search', rawNote: text };
  }
  if (/friend|family|mom|dad|sister|brother|told me|mentioned|referr|word of mouth|recommend/.test(lower)) {
    return { choice: 'Word of mouth', rawNote: text };
  }
  if (/sponsor/.test(lower)) {
    return { choice: 'Sponsor referral', rawNote: text };
  }
  return { choice: 'Other', rawNote: text };
}

// ---------------------------------------------------------------------------
// Fulfillment record auto-creation
// ---------------------------------------------------------------------------
// Determines print ink color based on shirt color. Dark shirts get white
// ink, light shirts get black ink. The function name and the Airtable
// field names ("Vinyl Front" / "Vinyl Back") are legacy from the HTV
// production era; production is now screen-printed but the semantics —
// what color sits on the shirt — are identical.
//
// 2026 lineup: Onyx → white ink. Sky / Meadow / Blossom → black ink.
// Old colorways (Black, Grey, Pink, Yellow, White) still mapped here so
// any in-flight historical orders / portal redirects still resolve.
function vinylColorForShirt(shirtColor: string): string {
  const lower = shirtColor.toLowerCase();
  if (lower === 'onyx' || lower === 'black' || lower === 'grey' || lower === 'gray') return 'White';
  return 'Black'; // Sky, Meadow, Blossom, White, Pink, Yellow, etc.
}

// Creates one Fulfillment record per shirt in Airtable. Non-fatal — if this
// fails the order still succeeds. Called from all three shirt flows.
// Idempotency guard for Stripe webhook retries (2026-07-10). When
// stripeSessionId + itemIndex are both provided, we skip the INSERT
// if a matching row already exists. The partial unique index at
// fulfillments_session_item_uniq_idx catches concurrent-retry doubles
// that slip past this app-layer pre-check. Callers that don't have a
// session id (backfills, manual inserts) omit both and get the old
// behavior — the index doesn't apply to NULL rows.
async function createFulfillmentRecord(opts: {
  // Stockpile model (May 2026 forward): shirts ship from pre-printed stock,
  // so the order # / matched child are no longer known at purchase time.
  // Kevin grabs a shirt that matches color+size from the pile, then
  // reconciles the number into the Fulfillment row when shipping.
  shirtNumber?: number | null;     // optional under stockpile model
  design: string;        // 2026 lineup: always "Number Tee" — must match singleSelect
  shirtColor: string;    // e.g. "Black" — must match singleSelect
  shirtSize: string;     // e.g. "L" — must match singleSelect
  buyerName: string;
  buyerEmail: string;
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  } | null;
  childName?: string | null;       // optional under stockpile model
  orderDate: string;     // ISO date string
  notes?: string;
  // Idempotency fields — both required for the guard to fire. Legacy
  // callers (backfill scripts) can omit and get the old behavior.
  stripeSessionId?: string;
  itemIndex?: number;
}): Promise<void> {
  const vinylFront = vinylColorForShirt(opts.shirtColor);
  const vinylBack = vinylColorForShirt(opts.shirtColor);

  // 1. Postgres — the source-of-truth write. Runs regardless of
  //    Airtable state, since Airtable is legacy read-only in a few
  //    admin surfaces (per project_state.md 2026-07-06) and the admin
  //    dashboard reads exclusively from fulfillments.* here in Postgres.
  //
  //    Discovered 2026-07-08: webhook was still Airtable-only, so every
  //    shirt order after 2026-06-22 (Postgres cutover date) silently
  //    skipped the Postgres fulfillments table. Admin "shirts to ship"
  //    card read empty even when real orders were sitting in donations.
  try {
    // Idempotency pre-check — cheap query to skip a retry before we
    // hit the partial unique index. The index is still the last line
    // of defense against concurrent retries; this saves the noisy
    // 23505 error path in the common case of a sequential retry.
    if (opts.stripeSessionId && typeof opts.itemIndex === 'number') {
      const existing = await db
        .select({ id: fulfillments.id })
        .from(fulfillments)
        .where(
          and(
            eq(fulfillments.stripeSessionId, opts.stripeSessionId),
            eq(fulfillments.itemIndex, opts.itemIndex)
          )
        )
        .limit(1);
      if (existing.length > 0) {
        console.log(
          `[WH] Fulfillment already exists for session=${opts.stripeSessionId} item=${opts.itemIndex} — skipping duplicate insert.`
        );
        return;
      }
    }
    await db.insert(fulfillments).values({
      orderNumber: typeof opts.shirtNumber === 'number' && !Number.isNaN(opts.shirtNumber) ? opts.shirtNumber : null,
      design: opts.design,
      shirtColor: opts.shirtColor,
      size: opts.shirtSize,
      vinylFront,
      vinylBack,
      buyerName: opts.buyerName,
      buyerEmail: opts.buyerEmail,
      shipName: opts.address ? opts.buyerName : null,
      shipStreet1: opts.address?.line1 || null,
      shipStreet2: opts.address?.line2 || null,
      shipCity: opts.address?.city || null,
      shipState: opts.address?.state || null,
      shipZip: opts.address?.postal_code || null,
      production: 'Pending',
      shipping: 'Not Shipped',
      childName: opts.childName || null,
      orderDate: opts.orderDate,
      notes: opts.notes || null,
      stripeSessionId: opts.stripeSessionId ?? null,
      itemIndex: typeof opts.itemIndex === 'number' ? opts.itemIndex : null,
    });
    const numLabel = typeof opts.shirtNumber === 'number' ? `#${opts.shirtNumber}` : '#TBD';
    console.log(`[WH] Fulfillment PG insert: ${numLabel} ${opts.design} / ${opts.shirtColor} / ${opts.shirtSize} / ${opts.buyerEmail}`);
  } catch (err: unknown) {
    // Concurrent-retry defense: if the pre-check missed a race window
    // and both retries reached INSERT, the partial unique index fires
    // 23505 on the second. Treat that as success (the first insert
    // already landed the row) — the retry was doing nothing anyway.
    const pgCode =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';
    if (pgCode === '23505') {
      console.log(
        `[WH] Fulfillment already existed (unique-index caught retry) for session=${opts.stripeSessionId} item=${opts.itemIndex}.`
      );
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WH] Fulfillment PG insert FAILED (queue will be missing this order):', message.slice(0, 300));
    // Don't return — Airtable dual-write below still gets a chance.

    // Ping Kevin inline so a PG-write failure isn't silently hidden
    // behind console noise. The admin queue reads Postgres now, so a
    // failed insert means a shirt Kevin can't see. This alert gives
    // him the order details to reconcile manually. Non-fatal: swallow
    // any send error so a bad SendGrid state can't cascade into the
    // whole webhook returning non-2xx (which would make Stripe retry
    // every part of the flow including the sponsor's confirmation).
    try {
      const alertTo = process.env.KEVIN_ALERT_EMAIL || 'kevin@beanumber.org';
      const escape = (s: string | null | undefined): string =>
        String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      const numLabel =
        typeof opts.shirtNumber === 'number'
          ? `#${opts.shirtNumber}`
          : '#TBD (stockpile)';
      const shipLines = [
        opts.address?.line1,
        opts.address?.line2,
        [opts.address?.city, opts.address?.state, opts.address?.postal_code]
          .filter(Boolean)
          .join(', '),
      ]
        .filter(Boolean)
        .map(l => escape(l))
        .join('<br>');
      await sendEmail({
        to: { email: alertTo, name: 'Kevin' },
        subject: `[BAN] Fulfillment write FAILED — reconcile ${numLabel}`,
        html: `
          <p>Stripe webhook fired successfully, but the Postgres
          fulfillment insert failed. The shirt buyer sees a normal
          confirmation, but the admin shirts-to-ship queue is
          missing this order. Reconcile manually.</p>
          <p><strong>Number:</strong> ${escape(numLabel)}<br>
          <strong>Design:</strong> ${escape(opts.design)}<br>
          <strong>Color / Size:</strong> ${escape(opts.shirtColor)} / ${escape(opts.shirtSize)}<br>
          <strong>Buyer:</strong> ${escape(opts.buyerName)} &lt;${escape(opts.buyerEmail)}&gt;<br>
          ${opts.childName ? `<strong>Child:</strong> ${escape(opts.childName)}<br>` : ''}
          <strong>Order date:</strong> ${escape(opts.orderDate)}<br>
          ${opts.notes ? `<strong>Notes:</strong> ${escape(opts.notes)}<br>` : ''}
          </p>
          ${shipLines ? `<p><strong>Ship to:</strong><br>${shipLines}</p>` : ''}
          <p><strong>DB error:</strong> <code>${escape(message.slice(0, 300))}</code></p>
          <p style="font-size:12px;color:#888">Sent from stripe webhook, non-fatal path.</p>
        `,
      });
    } catch (alertErr) {
      console.warn(
        '[WH] Fulfillment failure alert to Kevin also failed:',
        alertErr instanceof Error
          ? alertErr.message.slice(0, 200)
          : String(alertErr).slice(0, 200)
      );
    }
  }

  // 2. Airtable — legacy dual-write. Skipped when env is unset (Kevin
  //    has been removing AIRTABLE_API_KEY as part of the sunset).
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.log('[WH] Fulfillment: Airtable disabled by env, PG insert only');
    return;
  }

  const fields: Record<string, unknown> = {
    'fldsWHbE3yq7Xoyn4': opts.design,            // Design
    'fldaVW0nkpBjz0Gm7': opts.shirtColor,        // Shirt Color
    'fldicYGUVXRbCP4ze': opts.shirtSize,          // Size
    'fldwFBqD55i4G5yBf': vinylFront,              // Vinyl Front
    'fldp3RObd3abl3O7w': vinylBack,               // Vinyl Back
    'fldbGofwASSXDYj9R': opts.buyerName,          // Buyer
    'fldUakXkAhW2hYLxL': opts.buyerEmail,         // Email
    'fldnXiHlwBtEWP3io': opts.orderDate,          // Order Date
    'fldbBZtOLYVVDS28X': 'Pending',               // Production
    'fldJ6ehpDkpindHtO': 'Not Shipped',            // Shipping
  };

  // Order # and Child Name are only written when the assignment is known
  // (portal repeats, gift sponsorships). For initial purchases under the
  // stockpile model, both stay blank until Kevin records what shipped.
  if (typeof opts.shirtNumber === 'number' && !Number.isNaN(opts.shirtNumber)) {
    fields['fldsUZIXLFesyzg8u'] = opts.shirtNumber;  // Order #
  }
  if (opts.childName) {
    fields['fldkACkyAtFQCOPFL'] = opts.childName;    // Child Name
  }

  // Address fields (only set if we have an address object)
  if (opts.address) {
    fields['fldOhzT4xrR1jaJYC'] = opts.buyerName;                    // Ship Name
    fields['fldaNij76IbSJwf8l'] = opts.address.line1 || '';           // Ship Street1
    fields['fldIptRN8o5c1JYZV'] = opts.address.line2 || '';           // Ship Street2
    fields['fldklictYmJe4rW5C'] = opts.address.city || '';            // Ship City
    fields['fldqXjndiZ1dOoIZj'] = opts.address.state || '';           // Ship State
    fields['fld4TPxLBb9jaAa14'] = opts.address.postal_code || '';     // Ship ZIP
  }

  if (opts.notes) {
    fields['fldoX0697ASTKcDvD'] = opts.notes;                        // Notes
  }

  try {
    await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_FULFILLMENT_TABLE_ID}`,
        {
          method: 'POST',
          headers: getAirtableHeaders(),
          body: JSON.stringify({ fields }),
        }
      ).then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Fulfillment create failed (${res.status}): ${body}`);
        }
        return res.json();
      })
    );

    const numLabel = typeof opts.shirtNumber === 'number' ? `#${opts.shirtNumber}` : '#TBD';
    console.log(`[WH] Fulfillment record created: ${numLabel} ${opts.design} / ${opts.shirtColor} / ${opts.shirtSize}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WH] Fulfillment Airtable write failed (non-fatal):', message.slice(0, 300));
    return;
  }
}

// Find or create donor with deduplication.
//
// Returns an Airtable donor record ID when Airtable is healthy, else
// returns an empty string. Callers must treat an empty donor id as a
// "skip Airtable-only writes" signal and rely on the Postgres mirror
// (mirrorDonation / upsertDonorByEmail) to persist the donor by email.
//
// This is the result of a June 27 incident: Airtable rate-limit /
// quota failures were causing this function to throw, which bailed the
// entire webhook before the Postgres mirror could run. Donations
// stopped landing in Postgres on June 22. Postgres-first writes via
// mirrorDonation now run unconditionally; Airtable is best-effort.
async function findOrCreateDonor(
  stripeCustomerId: string | null,
  email: string | null,
  donorData: {
    name: string;
    organization?: string;
    email: string;
    phone?: string;
    address?: string;
    referral?: string;
  }
): Promise<string> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn('[WH] findOrCreateDonor: Airtable creds missing — returning empty donor id (Postgres mirror will create by email)');
    return '';
  }

  try {
    return await findOrCreateDonorViaAirtable(stripeCustomerId, email, donorData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WH] findOrCreateDonor: Airtable failed (non-fatal, falling back to Postgres-only):', message.slice(0, 300));
    // Even though Airtable failed, ensure the donor exists in Postgres
    // by email so downstream mirrorDonation/mirrorDripFields calls have
    // a row to attach to. mirrorDonation also calls upsertDonorByEmail
    // internally — this is a safety net to make sure the donor row is
    // present even if mirrorDonation hasn't fired yet (e.g. drip
    // enrollment path that runs before any donation).
    if (donorData.email) {
      await mirrorToPostgres('donor-fallback', async () => {
        const { upsertDonorByEmail } = await import('@/lib/db/mutations');
        await upsertDonorByEmail({
          email: donorData.email,
          name: donorData.name || null,
          organizationName: donorData.organization || null,
          mailingAddress: donorData.address || null,
          stripeCustomerId: stripeCustomerId || null,
        });
      });
    }
    return '';
  }
}

// Internal: the original Airtable-only path. May throw on any Airtable
// failure; the public findOrCreateDonor wrapper catches.
async function findOrCreateDonorViaAirtable(
  stripeCustomerId: string | null,
  email: string | null,
  donorData: {
    name: string;
    organization?: string;
    email: string;
    phone?: string;
    address?: string;
    referral?: string;
  }
): Promise<string> {
  // Step 1: Search by Stripe Customer ID first
  if (stripeCustomerId) {
    const formula = `{Stripe Customer ID} = "${stripeCustomerId}"`;
    const response = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
        {
          headers: getAirtableHeaders(),
        }
      )
    );

    if (response.ok) {
      const data = await response.json();
      if (data.records && data.records.length > 0) {
        console.log('[Airtable] Found donor by Stripe Customer ID:', data.records[0].id);
        return data.records[0].id;
      }
    }
  }

  // Step 2: Search by email if no Stripe ID match
  if (email) {
    const formula = `{Email Address} = "${email}"`;
    const response = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
        {
          headers: getAirtableHeaders(),
        }
      )
    );

    if (response.ok) {
      const data = await response.json();
      if (data.records && data.records.length > 0) {
        const donorId = data.records[0].id;
        console.log('[Airtable] Found donor by email:', donorId);
        
        // Update with Stripe Customer ID if we have it
        if (stripeCustomerId) {
          await airtableAPICall(() =>
            fetch(
              `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}/${donorId}`,
              {
                method: 'PATCH',
                headers: getAirtableHeaders(),
                body: JSON.stringify({
                  fields: {
                    'Stripe Customer ID': stripeCustomerId,
                  },
                }),
              }
            )
          );
        }
        
        return donorId;
      }
    }
  }

  // Step 3: Create new donor if no matches
  const newDonorFields: any = {
    'Donor Name': donorData.name,
    'Email Address': donorData.email,
  };

  if (donorData.organization) {
    newDonorFields['Organization Name'] = donorData.organization;
  }
  if (donorData.phone) {
    newDonorFields['Phone Number'] = donorData.phone;
  }
  if (donorData.address) {
    newDonorFields['Mailing Address'] = donorData.address;
  }
  if (stripeCustomerId) {
    newDonorFields['Stripe Customer ID'] = stripeCustomerId;
  }
  if (donorData.referral) {
    const { choice, rawNote } = classifyReferral(donorData.referral);
    if (choice) {
      newDonorFields['How They Heard'] = choice;
    }
    if (rawNote) {
      newDonorFields['Notes'] = `Heard about BAN via: "${rawNote}"`;
    }
  }

  const response = await airtableAPICall(() =>
    fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}`,
      {
        method: 'POST',
        headers: getAirtableHeaders(),
        body: JSON.stringify({
          fields: newDonorFields,
        }),
      }
    )
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable API error: ${error}`);
  }

  const data = await response.json();
  console.log('[Airtable] Created new donor:', data.id);
  return data.id;
}

// After creating a donation, recalculate the donor's summary fields.
// Keeps Total Lifetime Giving, First/Most Recent Donation, Donor Status,
// and Recurring Supporter current without manual intervention.
async function updateDonorSummary(donorId: string): Promise<void> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return;
  try {
    // Fetch all donations linked to this donor
    const formula = `FIND("${donorId}", ARRAYJOIN(RECORD_ID({Donor})))`;
    // Simpler: just fetch the donor's linked donation IDs, then get those records.
    // Actually, easier: get the donor record with its linked Donations, then
    // fetch those donation records for amounts and dates.
    const donorRes = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}/${donorId}?fields%5B%5D=Donations&fields%5B%5D=Subscriptions`,
        { headers: getAirtableHeaders() }
      )
    );
    if (!donorRes.ok) return;
    const donorData = await donorRes.json();
    const donationIds: string[] = (donorData.fields?.Donations || []).map(
      (d: any) => (typeof d === 'string' ? d : d.id)
    );

    if (donationIds.length === 0) return;

    // Fetch each donation's amount and date (batch-friendly: up to 100 per URL)
    let totalGiving = 0;
    let firstDate: string | null = null;
    let lastDate: string | null = null;

    // Airtable: fetch by record IDs using filterByFormula with OR(RECORD_ID()=...)
    // Simpler for small sets: just fetch each. Most donors have 1-3 donations.
    for (const donId of donationIds) {
      const dRes = await airtableAPICall(() =>
        fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}/${donId}?fields%5B%5D=Donation%20Amount&fields%5B%5D=Donation%20Date&fields%5B%5D=Payment%20Status`,
          { headers: getAirtableHeaders() }
        )
      );
      if (!dRes.ok) continue;
      const dData = await dRes.json();
      const status = dData.fields?.['Payment Status'];
      const statusName = typeof status === 'object' ? status?.name : status;
      if (statusName === 'Succeeded' || !statusName) {
        totalGiving += dData.fields?.['Donation Amount'] || 0;
      }
      const date = dData.fields?.['Donation Date'];
      if (date) {
        if (!firstDate || date < firstDate) firstDate = date;
        if (!lastDate || date > lastDate) lastDate = date;
      }
    }

    // Check subscription status
    const subIds: string[] = (donorData.fields?.Subscriptions || []).map(
      (s: any) => (typeof s === 'string' ? s : s.id)
    );
    let hasActiveSub = false;
    for (const subId of subIds) {
      const sRes = await airtableAPICall(() =>
        fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Subscriptions/${subId}?fields%5B%5D=Status`,
          { headers: getAirtableHeaders() }
        )
      );
      if (!sRes.ok) continue;
      const sData = await sRes.json();
      const st = sData.fields?.Status;
      const stName = typeof st === 'object' ? st?.name : st;
      if (stName === 'active' || stName === 'Active') {
        hasActiveSub = true;
        break;
      }
    }

    // Determine donor status
    let donorStatus = 'New';
    if (donationIds.length > 0) {
      if (hasActiveSub) {
        donorStatus = 'Active';
      } else if (lastDate) {
        const daysSince = Math.floor(
          (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        donorStatus = daysSince <= 180 ? 'Active' : 'Lapsed';
      }
    }

    // Write summary fields
    const fields: Record<string, any> = {
      'Total Lifetime Giving': totalGiving,
      'Donor Status': donorStatus,
      'Recurring Supporter': hasActiveSub,
    };
    if (firstDate) fields['First Donation Date'] = firstDate;
    if (lastDate) fields['Most Recent Donation'] = lastDate;

    await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}/${donorId}`,
        {
          method: 'PATCH',
          headers: getAirtableHeaders(),
          body: JSON.stringify({ fields }),
        }
      )
    );
    console.log('[WH] Donor summary updated:', donorId, `$${totalGiving}`, donorStatus);
  } catch (err) {
    // Non-fatal — log and continue
    console.error('[WH] Failed to update donor summary:', donorId, err);
  }
}

// Create or update donation record (idempotent)
async function upsertDonation(
  paymentIntentId: string,
  donationData: {
    sessionId: string;
    customerId: string | null;
    donorId: string;
    amount: number;
    currency: string;
    donationDate: string;
    isRecurring: boolean;
    subscriptionId: string | null;
    status: string;
    email: string;
    name: string;
    organization?: string;
    address?: any;
    donationSource?: string;
    notes?: string;
    childRecordId?: string;
  }
): Promise<string> {
  // Normalize donation source (used by both Postgres and Airtable writes).
  const VALID_SOURCES = new Set([
    'Website',
    'Manual Entry',
    'Event',
    'Other',
    'Portal Repeat',
    'Sponsorship',
    'Shirt Order',
    'Shirt + Monthly',
  ]);
  const rawSource = donationData.donationSource || 'Website';
  const sourceForAirtable = VALID_SOURCES.has(rawSource) ? rawSource : 'Website';
  const sourceLabelForNote = VALID_SOURCES.has(rawSource) ? null : rawSource;
  const noteParts: string[] = [];
  if (sourceLabelForNote) noteParts.push(`[${sourceLabelForNote}]`);
  if (donationData.notes) noteParts.push(donationData.notes);
  const finalNote = noteParts.join(' ') || undefined;

  // POSTGRES FIRST. Source of truth since the June 22 migration.
  // Previously this ran AFTER the Airtable write and only if the Airtable
  // write succeeded — meaning every Airtable failure (rate limit, quota
  // exhaustion, network blip) also silently dropped the Postgres mirror.
  // That's why donations stopped landing in Postgres after June 22 when
  // Airtable quota started failing writes. Postgres-first decouples the
  // mirror from Airtable's health and is itself idempotent on the payment
  // intent id (see lib/db/mutations.ts recordDonation).
  await mirrorToPostgres(
    `donation ${paymentIntentId}`,
    () =>
      mirrorDonation({
        donor: {
          email: donationData.email,
          name: donationData.name || null,
          organizationName: donationData.organization || null,
          mailingAddress: donationData.address
            ? typeof donationData.address === 'string'
              ? donationData.address
              : JSON.stringify(donationData.address)
            : null,
          stripeCustomerId: donationData.customerId || null,
        },
        donation: {
          donationAmount: donationData.amount,
          currency: donationData.currency,
          donationSource: donationData.donationSource || 'Website',
          paymentStatus: donationData.status,
          recurringDonation: donationData.isRecurring,
          stripePaymentIntentId: paymentIntentId,
          stripeCheckoutSessionId: donationData.sessionId || null,
          stripeCustomerId: donationData.customerId || null,
          donorEmailAtDonation: donationData.email,
          donationNote: finalNote || null,
          donationDate: donationData.donationDate || null,
        },
        // Pass legacy ChildID for FK resolution if the upstream
        // caller knew which kid this was for (sponsorship branch).
        // The childRecordId here is the Airtable record id — we
        // can&rsquo;t use it for Postgres FK; the bridge falls back to
        // text legacy id resolution via id_mapping if needed.
        designatedChildLegacyId: null,
      })
  );
  console.log('[WH] donation mirrored to Postgres:', paymentIntentId);

  // AIRTABLE BEST-EFFORT. Try the legacy mirror; failures (quota,
  // network, schema drift) are logged but no longer break the webhook
  // or block downstream Postgres operations.
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn('[WH] Airtable credentials not configured — skipping Airtable mirror');
    return paymentIntentId;
  }

  try {
    // Idempotency check: don't double-write to Airtable if the record
    // already exists.
    const formula = `{Stripe Payment Intent ID} = "${paymentIntentId}"`;
    const searchResponse = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
        { headers: getAirtableHeaders() }
      )
    );
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      if (searchData.records && searchData.records.length > 0) {
        console.log('[Airtable] Donation already exists:', searchData.records[0].id);
        return searchData.records[0].id;
      }
    }

    const donationFields: any = {
      'Stripe Payment Intent ID': paymentIntentId,
      'Stripe Checkout Session ID': donationData.sessionId,
      'Stripe Customer ID': donationData.customerId || '',
      'Donation Amount': donationData.amount,
      'Currency': donationData.currency.toUpperCase(),
      'Donation Date': donationData.donationDate,
      'Payment Status': donationData.status,
      'Recurring Donation': donationData.isRecurring,
      'Donor': [donationData.donorId],
      'Donor Email at Donation': donationData.email,
      'Donation Source': sourceForAirtable,
    };
    if (finalNote) donationFields['Donation Note'] = finalNote;
    if (donationData.childRecordId) donationFields['Child'] = [donationData.childRecordId];

    const response = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}`,
        {
          method: 'POST',
          headers: getAirtableHeaders(),
          body: JSON.stringify({ fields: donationFields }),
        }
      )
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[WH] Airtable donation REJECT (non-fatal):', response.status, error.slice(0, 300));
      return paymentIntentId;
    }

    const data = await response.json();
    console.log('[WH] donation also created in Airtable:', data.id);

    if (donationData.donorId) {
      updateDonorSummary(donationData.donorId).catch(() => {});
    }

    return data.id;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WH] Airtable donation write failed (non-fatal, Postgres has the donation):', message.slice(0, 300));
    return paymentIntentId;
  }
}

// Create communication record
async function createCommunicationRecord(
  donationId: string,
  donorId: string,
  emailData: {
    email: string;
    subject: string;
    body: string;
    status: string;
    emailType?: string; // 'Thank You' (default) | 'Drip' | 'Receipt' | etc.
    // Stripe Payment Intent ID — used by the Postgres mirror to link
    // the row to the donations table. All current webhook call sites
    // are inside handleCheckoutSessionCompleted where paymentIntentId
    // is in scope; passing it lets the mirror produce a fully-linked
    // audit row instead of a floating one.
    stripePaymentIntentId?: string | null;
  }
): Promise<string> {
  // Postgres-first: write the audit row to communications regardless of
  // Airtable health. Email itself already sent via SendGrid; this is
  // pure record-keeping. mirrorToPostgres swallows errors so a Postgres
  // outage can't block the Airtable write either.
  await mirrorToPostgres('communication', () =>
    mirrorCommunication({
      recipientEmail: emailData.email,
      subject: emailData.subject,
      status: emailData.status,
      emailType: emailData.emailType,
      stripePaymentIntentId: emailData.stripePaymentIntentId ?? null,
    })
  );

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn('[WH] Communication: missing Airtable creds, skipping Airtable side (Postgres mirrored)');
    return '';
  }

  const communicationFields: any = {
    'Subject': emailData.subject,
    'Email Body': emailData.body,
    'Send Date': new Date().toISOString(),
    'Recipient Email': emailData.email,
    'Status': emailData.status,
    'Email Type': 'Thank You',
    'Related Donation': [donationId],
    'Related Donor': [donorId],
  };

  try {
    const response = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_COMMUNICATIONS_TABLE}`,
        {
          method: 'POST',
          headers: getAirtableHeaders(),
          body: JSON.stringify({
            fields: communicationFields,
          }),
        }
      )
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[WH] Communication Airtable write rejected (non-fatal):', response.status, error.slice(0, 300));
      return '';
    }

    const data = await response.json();
    console.log('[Airtable] Created communication record:', data.id);
    return data.id;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WH] Communication Airtable write failed (non-fatal):', message.slice(0, 300));
    return '';
  }
}

// Send thank-you email via SendGrid
async function sendThankYouEmail(donationData: {
  email: string;
  name: string;
  amount: number;
  currency: string;
  isRecurring: boolean;
  donationDate: string;
}): Promise<void> {
  if (!donationData.email) {
    console.log('[Webhook] No customer email, skipping thank-you email');
    return;
  }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
  const firstName = donationData.name.split(' ')[0];
  const amountStr = `$${donationData.amount.toFixed(2)}`;
  const dateStr = new Date(donationData.donationDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const subject = donationData.isRecurring
    ? 'You just became a monthly sponsor.'
    : 'Thank you. This matters.';

  const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">

              <p style="margin-top: 0;">Hey ${firstName},</p>

              <p>I wanted to say thank you personally. Your ${donationData.isRecurring ? 'monthly ' : ''}gift of ${amountStr} goes directly to the ground. To a six-acre campus in Northern Uganda with a school built for 380 kids, a medical clinic that has treated 700+ patients, and vocational training where 60 women are learning trades.</p>

              ${donationData.isRecurring ? `<p>As a monthly sponsor, you\u2019re not just donating. You\u2019re becoming part of the system that keeps this community running. I\u2019ll make sure you hear from us regularly so you can see exactly what your support is doing.</p>` : `<p>Even a one-time gift moves the needle here. If you ever want to go deeper (sponsor a child, visit the campus, or just learn more about the work), I\u2019m always reachable.</p>`}

              <p style="color: #999; font-size: 14px; margin-top: 24px; margin-bottom: 4px;">Your receipt:</p>
              <p style="font-size: 14px; color: #555; margin-top: 0;">
                ${amountStr} \u00b7 ${donationData.isRecurring ? 'Monthly recurring' : 'One-time'} \u00b7 ${dateStr}<br>
                <span style="font-size: 13px; color: #999;">Tax-deductible under 501(c)(3) \u00b7 EIN: 93-1948872</span>
              </p>

              <p>Thanks for being part of this,<br>
              <strong>Kevin</strong></p>

              <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">

              <p style="font-size: 12px; color: #999; line-height: 1.5;">
                Be A Number, International<br>
                <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a> &nbsp;\u00b7&nbsp;
                <a href="mailto:Kevin@beanumber.org" style="color: #D4A843;">Kevin@beanumber.org</a>
              </p>
            </body>
          </html>
        `;

  const result = await sendEmail({
    to: { email: donationData.email, name: donationData.name },
    from: { email: fromEmail, name: 'Kevin at Be A Number' },
    subject,
    html,
  });

  if (!result.success) {
    console.error('[Webhook] Thank-you email failed:', result.error);
    return;
  }

  console.log('[Webhook] Thank-you email sent to:', donationData.email, 'via', result.data?.provider);
}

// Assign the next available child (lowest ShirtNumber, ShirtAssignedAt blank,
// Status active) to a shirt buyer. Writes the assignment atomically-ish by
// patching the Child record, then returns the child info so the caller can
// link the Donation and render the confirmation email.
//
// Returns null if no child is currently available. Caller should degrade
// gracefully (still send a confirmation, flag internally) rather than fail.
async function assignNextShirtChild(
  buyerEmail: string,
  buyerName: string
): Promise<{
  recordId: string;
  childId: string;
  displayName: string;
  shirtNumber: number;
  photoUrl?: string;
} | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn('[Webhook] Airtable not configured, skipping shirt assignment');
    return null;
  }

  // Query children where:
  // - ShirtNumber is populated (they have a number to give away)
  // - ShirtAssignedAt is blank (shirt not yet claimed by a buyer)
  // - Status is not 'Graduated' or 'Archived' (case-insensitive)
  // - ReservedForAuction is not checked (numbers 1, 7, 67, 69, 420, 911 etc
  //   are held back for live auctions and must never be auto-assigned)
  // Sorted ascending by ShirtNumber so lowest-numbered child is claimed first,
  // matching the enrollment-order policy.
  const formula = `AND(NOT({ShirtNumber}=BLANK()), {ShirtAssignedAt}=BLANK(), LOWER({Status})!="graduated", LOWER({Status})!="archived", NOT({ReservedForAuction}))`;
  const listUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_CHILDREN_TABLE}?filterByFormula=${encodeURIComponent(formula)}&sort%5B0%5D%5Bfield%5D=ShirtNumber&sort%5B0%5D%5Bdirection%5D=asc&maxRecords=1`;

  let candidate: any = null;
  try {
    const res = await airtableAPICall(() =>
      fetch(listUrl, { headers: getAirtableHeaders() })
    );
    if (!res.ok) {
      console.error('[Webhook] Child lookup for shirt assignment failed:', res.status);
      return null;
    }
    const data = await res.json();
    if (!data.records || data.records.length === 0) {
      console.warn('[Webhook] No available children to assign for shirt order', { buyerEmail });
      return null;
    }
    candidate = data.records[0];
  } catch (error) {
    console.error('[Webhook] Error during shirt assignment lookup:', error);
    return null;
  }

  // Claim this child by writing buyer info and a timestamp. If two webhooks
  // raced and both picked the same child, the second write still succeeds but
  // overwrites the first buyer's trail; acceptable given BAN's volume. If that
  // ever becomes a real risk we can move to a conditional-update pattern or
  // serialize via a dedicated queue.
  const nowIso = new Date().toISOString();
  const childRecordId = candidate.id as string;
  const displayName =
    candidate.fields?.DisplayName ||
    `${candidate.fields?.FirstName || 'Child'} ${candidate.fields?.LastInitial || ''}`.trim();
  const shirtNumber = Number(candidate.fields?.ShirtNumber);
  const photoUrl = candidate.fields?.ProfilePhoto?.[0]?.url;
  const childId = candidate.fields?.ChildID || childRecordId;

  try {
    const patchRes = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_CHILDREN_TABLE}/${childRecordId}`,
        {
          method: 'PATCH',
          headers: getAirtableHeaders(),
          body: JSON.stringify({
            fields: {
              ShirtAssignedAt: nowIso,
              ShirtBuyerEmail: buyerEmail,
              ShirtBuyerName: buyerName,
            },
          }),
        }
      )
    );
    if (!patchRes.ok) {
      const body = await patchRes.text();
      console.error('[Webhook] Failed to mark child assigned:', patchRes.status, body);
      return null;
    }
  } catch (error) {
    console.error('[Webhook] Error marking child assigned:', error);
    return null;
  }

  console.log('[Webhook] Assigned shirt #' + shirtNumber + ' (' + displayName + ') to ' + buyerEmail);

  return {
    recordId: childRecordId,
    childId,
    displayName,
    shirtNumber,
    photoUrl,
  };
}

// Send shirt order confirmation email via SendGrid.
//
// Under the May 2026 stockpile model, the buyer's specific number and
// matched child are NOT known at purchase time — Kevin pulls a shirt
// that matches the buyer's color+size from inventory and the number
// on the back of that shirt is what the buyer ends up with. This email
// reflects that: it does not name a child, does not show a number, and
// instructs the buyer to look at the back of the shirt when it arrives,
// then visit beanumber.org/[that number] to meet the child it belongs to.
//
// Portal repeat orders (active sponsors reordering with their existing
// number) still know the number and child upfront — Kevin hand-prints
// those. The isPortalRepeat branch handles that case.
//
// Shirt+monthly opt-in buyers get an "your monthly is active" block but
// no sponsor code (none generated yet under the stockpile model). The
// sponsor code + portal access activates once Kevin reconciles the
// shipped number into Airtable.
async function sendShirtConfirmationEmail(orderData: {
  email: string;
  name: string;
  shirtName: string;
  shirtColor: string;
  shirtSize: string;
  amount: number;
  // True when buyer checked the "keep sponsoring after this shirt" box at
  // checkout. Adds a monthly-sponsorship-active block to the email.
  alreadySponsoring?: boolean;
  // Sponsor code to include when alreadySponsoring is true.
  sponsorCode?: string;
  // Memo §5 portal repeat: existing sponsor reordering with their known
  // number. Suppresses the reveal-instructions block; adds context that
  // their monthly is unchanged.
  isPortalRepeat?: boolean;
  shirtNumber?: number;
  childDisplayName?: string;
}): Promise<void> {
  if (!orderData.email) {
    console.log('[Webhook] No customer email, skipping shirt confirmation email');
    return;
  }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
  const firstName = orderData.name.split(' ')[0];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';

  // The reveal block is generic for first-time buyers. Portal repeats
  // (sponsor reorders) get a different block — they already know who
  // their child is.
  const revealBlock = orderData.isPortalRepeat
    ? `
              <p>This one ships with <strong>#${orderData.shirtNumber || ''}</strong> pressed on the back &mdash; the same number you already know, connected to ${orderData.childDisplayName || 'your kid'}. Free shipping, no new sponsorship started, no new kid assigned.</p>
    `
    : `
              <p>When it arrives, look at the back of the shirt. There&rsquo;s a number pressed below the main design, and that number belongs to a real child at the campus in Northern Uganda. Go to <a href="${siteUrl}" style="color: #D4A843; font-weight: bold;">beanumber.org</a>, enter your number, and meet them &mdash; their name, their face, their story.</p>
              <p>Your $25 today supports school, meals, and medical care for the kids on that campus. The number on the shirt is your way in.</p>
    `;

  // Monthly sponsorship "your monthly is active" block. Under the stockpile
  // model, the sponsor code + portal access aren't issued at checkout —
  // they activate after the shirt ships and the matched number is recorded.
  const sponsorBlock = orderData.alreadySponsoring
    ? `
              <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">

              <p style="color: #D4A843; font-weight: bold; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px;">Your monthly sponsorship is active</p>

              <p>You opted to keep sponsoring after this shirt, so another $25 will be charged each month going forward. It goes straight to school, meals, and medical care at the campus.</p>

              <p>Once your shirt ships and you&rsquo;ve had a chance to meet the child on the back, I&rsquo;ll send you your sponsor code and portal access. That&rsquo;s where updates, photos, and letters will live going forward.</p>

              <p>You can cancel anytime, no questions asked.</p>
    `
    : '';

  const subject = orderData.isPortalRepeat
    ? `Your reorder is being made (#${orderData.shirtNumber || ''}).`
    : orderData.alreadySponsoring
      ? 'Your shirt is on its way (and your sponsorship is active).'
      : 'Your shirt is being made right now.';

  const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">

              <p style="margin-top: 0;">Hey ${firstName},</p>

              <p>Your shirt is in the works &mdash; I&rsquo;m screen-printing it by hand, and I&rsquo;ll get it in the mail as soon as I can.</p>

              <p style="color: #999; font-size: 14px; margin-bottom: 4px;">Your order:</p>
              <p style="font-size: 15px; color: #555; margin-top: 0;">
                ${orderData.shirtName} &nbsp;\u00b7&nbsp; ${orderData.shirtColor} &nbsp;\u00b7&nbsp; ${orderData.shirtSize}<br>
                <span style="color: #999;">$${orderData.amount.toFixed(2)}</span>
              </p>

              ${revealBlock}
              ${sponsorBlock}

              <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">

              <p style="color: #666; font-size: 14px; line-height: 1.6;">You&rsquo;re part of the BAN community now, so once a month you&rsquo;ll get a short update straight from the campus in Gulu &mdash; photos, progress, the small stuff. Unsubscribe anytime.</p>

              <p>Thanks for being part of this,<br>
              <strong>Kevin</strong></p>

              <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">

              <p style="font-size: 12px; color: #999; line-height: 1.5;">
                Be A Number, International<br>
                <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a> &nbsp;\u00b7&nbsp;
                <a href="mailto:Kevin@beanumber.org" style="color: #D4A843;">Kevin@beanumber.org</a>
              </p>
            </body>
          </html>
        `;

  const result = await sendEmail({
    to: { email: orderData.email, name: orderData.name },
    from: { email: fromEmail, name: 'Kevin at Be A Number' },
    subject,
    html,
  });

  if (!result.success) {
    console.error('[Webhook] Shirt confirmation email failed:', result.error);
    return;
  }

  console.log('[Webhook] Shirt confirmation email sent to:', orderData.email, 'via', result.data?.provider);
}

// ---------------------------------------------------------------------------
// Number Collection merch confirmation
// ---------------------------------------------------------------------------

/**
 * Confirmation email for hoodie / hat / sticker pack purchases from the
 * /[number] sponsor view. The matched child is named here because the
 * buyer is already a verified sponsor of that child — there's nothing
 * to spoil. Tone matches the shirt confirmation: warm, specific, short.
 */
async function sendMerchConfirmationEmail(orderData: {
  email: string;
  name: string;
  merchName: string;
  shirtNumber: string;
  size?: string;
  amount: number;
  childDisplayName?: string;
}): Promise<void> {
  if (!orderData.email) {
    console.log('[Webhook] No buyer email, skipping merch confirmation');
    return;
  }
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
  const firstName = orderData.name.split(' ')[0] || 'Friend';
  const childLine = orderData.childDisplayName
    ? ` Same number as ${orderData.childDisplayName}'s shirt.`
    : '';
  const sizeLine = orderData.size ? ` (Size ${orderData.size})` : '';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
        <p style="margin-top: 0;">Hey ${firstName},</p>
        <p>Your <strong>${orderData.merchName}</strong>${sizeLine} is on the make-bench. I&rsquo;ll press <strong>#${orderData.shirtNumber}</strong> on it by hand and get it in the mail as soon as I can.${childLine}</p>
        <p style="color: #999; font-size: 14px; margin-bottom: 4px;">Your order:</p>
        <p style="font-size: 15px; color: #555; margin-top: 0;">
          ${orderData.merchName}${sizeLine} &middot; #${orderData.shirtNumber}<br>
          <span style="color: #999;">$${orderData.amount.toFixed(2)} &middot; free shipping</span>
        </p>
        <p>Thanks for staying in the relationship.</p>
        <p>Kevin</p>
        <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">
        <p style="font-size: 12px; color: #999; line-height: 1.5;">
          Be A Number, International<br>
          <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a>
        </p>
      </body>
    </html>
  `;

  const result = await sendEmail({
    to: { email: orderData.email, name: orderData.name },
    from: { email: fromEmail, name: 'Kevin at Be A Number' },
    subject: `Your ${orderData.merchName} is being made (#${orderData.shirtNumber}).`,
    html,
  });
  if (!result.success) {
    console.error('[Webhook] Merch confirmation email failed:', result.error);
    return;
  }
  console.log('[Webhook] Merch confirmation email sent to:', orderData.email);
}

// ---------------------------------------------------------------------------
// Gift sponsorship emails (memo §11)
// ---------------------------------------------------------------------------

/**
 * Email to the RECIPIENT of a gift sponsorship. They learn for the first
 * time that someone gifted them a child to know. The matched child's
 * number + a link to /children/[number]?gift=true&from=[gifter] does the
 * reveal work.
 */
async function sendGiftCardEmail(data: {
  recipientEmail: string;
  recipientName: string;
  gifterName: string; // may be ''
  giftMessage: string; // may be ''
  shirtNumber: number;
  childDisplayName: string; // for internal-only context; NOT shown in email
}): Promise<void> {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
  const recipientFirst = data.recipientName.trim().split(/\s+/)[0] || 'friend';
  const fromLineRaw = data.gifterName.trim() || 'Someone who knows you';
  const fromLine = escapeHtml(fromLineRaw);
  const meetUrl =
    `${siteUrl}/children/${data.shirtNumber}?gift=true&from=` +
    encodeURIComponent(data.gifterName.trim() || '');

  // The reveal page handles the actual name-and-photo reveal. The email
  // intentionally does NOT name or show the child — that's preserved for
  // the click-through moment. Subject line uses unescaped string since
  // it's not HTML.
  const subject = `${fromLineRaw} sponsored a child in your honor.`;

  const messageBlock = data.giftMessage
    ? `
            <div style="background: #FFF8F0; border-left: 3px solid #D4A843; padding: 14px 18px; margin: 24px 0;">
              <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.15em; color: #D4A843;">
                A note from ${escapeHtml(data.gifterName.trim() || 'them')}
              </p>
              <p style="margin: 0; color: #444; font-style: italic; line-height: 1.6;">
                ${escapeHtml(data.giftMessage)}
              </p>
            </div>`
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px; background: #ffffff;">

        <p style="text-align: center; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.25em; color: #D4A843; margin: 0 0 16px 0;">
          A gift for you
        </p>

        <h1 style="text-align: center; font-size: 28px; font-weight: 600; color: #0d0d0d; margin: 0 0 8px 0; line-height: 1.25;">
          ${fromLine}<br>sponsored a child<br>in your honor.
        </h1>

        <p style="text-align: center; color: #777; margin: 0 0 28px 0; font-size: 15px;">
          A real kid at the campus in Northern Uganda.<br>
          Hey ${escapeHtml(recipientFirst)} — they&rsquo;re waiting for you to meet them.
        </p>

        ${messageBlock}

        <div style="text-align: center; background: #FFF8F0; border: 1px solid #e8e0d4; padding: 24px 20px; margin: 28px 0;">
          <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.2em; color: #999;">
            Your number
          </p>
          <p style="margin: 0 0 18px 0; font-size: 44px; font-weight: 700; color: #D4A843; letter-spacing: 0.05em; font-family: Georgia, serif;">
            #${data.shirtNumber}
          </p>
          <p style="margin: 0; color: #666; font-size: 14px;">
            That number belongs to a real child at the campus.
          </p>
        </div>

        <p style="text-align: center; margin: 28px 0;">
          <a href="${meetUrl}" style="display: inline-block; background: #D4A843; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 14px 32px; font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase;">
            Meet them
          </a>
        </p>

        <p style="color: #555; font-size: 15px; line-height: 1.7;">
          Their first month at the campus is already covered &mdash; school fees, breakfast and
          lunch every day, medical care if they need it. The gift was the introduction.
        </p>

        <p style="color: #555; font-size: 15px; line-height: 1.7;">
          If you want to stay with them after that, it&rsquo;s $25 a month and you can stop anytime.
          But there&rsquo;s no obligation. The point of this gift is the introduction; the rest is up to you.
        </p>

        <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 32px 0;">

        <p style="font-size: 12px; color: #999; line-height: 1.5;">
          Be A Number, International<br>
          <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a> &nbsp;·&nbsp;
          <a href="mailto:Kevin@beanumber.org" style="color: #D4A843;">Kevin@beanumber.org</a>
        </p>
      </body>
    </html>
  `;

  const result = await sendEmail({
    to: { email: data.recipientEmail, name: data.recipientName },
    from: { email: fromEmail, name: 'Kevin at Be A Number' },
    subject,
    html,
  });

  if (!result.success) {
    console.error('[Webhook] Gift card email failed:', result.error);
    return;
  }

  console.log(
    '[Webhook] Gift card email sent to:',
    data.recipientEmail,
    'for #' + data.shirtNumber,
    'via',
    result.data?.provider
  );
}

/**
 * Email to the GIFTER confirming the gift was sent. Receipt-style with
 * tax language; intentionally does not name or photo the recipient's
 * matched child (the reveal belongs to the recipient).
 */
async function sendGifterConfirmationEmail(data: {
  gifterEmail: string;
  gifterName: string;
  recipientName: string;
  recipientEmail: string;
  amount: number;
}): Promise<void> {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
  const firstName = (data.gifterName || 'friend').trim().split(/\s+/)[0] || 'friend';
  const subject = `Your gift is on its way to ${data.recipientName}.`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px; background: #ffffff;">

        <p style="margin-top: 0;">Hey ${escapeHtml(firstName)},</p>

        <p>
          Your gift sponsorship for <strong>${escapeHtml(data.recipientName)}</strong>
          (${escapeHtml(data.recipientEmail)}) just went out. They&rsquo;re getting an email right now
          with their matched child&rsquo;s number and a link to meet them.
        </p>

        <p>
          What happens from here is entirely their call. They can decide to stay with the child
          at $25/month, or they can just hold onto the introduction. Either way, the first
          month at the campus is already covered because of you.
        </p>

        <p>
          On behalf of the team at the campus &mdash; thank you. This is the kind of gift
          we don&rsquo;t take lightly.
        </p>

        <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 28px 0;">

        <p style="font-size: 13px; color: #888; line-height: 1.6;">
          <strong>Receipt:</strong> $${data.amount.toFixed(2)} on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.<br>
          Tax-deductible to the extent allowed by law. Be A Number, International is a 501(c)(3)
          public charity, EIN 93-1948872. No goods or services were exchanged.
        </p>

        <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 28px 0;">

        <p style="font-size: 12px; color: #999; line-height: 1.5;">
          Be A Number, International<br>
          <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a> &nbsp;·&nbsp;
          <a href="mailto:Kevin@beanumber.org" style="color: #D4A843;">Kevin@beanumber.org</a>
        </p>
      </body>
    </html>
  `;

  const result = await sendEmail({
    to: { email: data.gifterEmail, name: data.gifterName || data.gifterEmail },
    from: { email: fromEmail, name: 'Kevin at Be A Number' },
    subject,
    html,
  });

  if (!result.success) {
    console.error('[Webhook] Gifter confirmation email failed:', result.error);
    return;
  }

  console.log('[Webhook] Gifter confirmation email sent to:', data.gifterEmail, 'via', result.data?.provider);
}

/** Minimal HTML escape for user-supplied gift message + names. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Sponsor code minting lives in @/lib/sponsor-codes as
// generateUniqueSponsorCode() — DB-checked so we never mint a code
// that collides with an existing sponsorships row.

// Fetch a child record to enrich the sponsorship with display data
async function fetchChildRecord(childRecordId: string): Promise<any | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return null;
  try {
    const response = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_CHILDREN_TABLE}/${childRecordId}`,
        { headers: getAirtableHeaders() }
      )
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('[Airtable] Failed to fetch child record:', error);
    return null;
  }
}

// Create a new Sponsorship record linked to Child and Donor
async function createSponsorshipRecord(data: {
  childRecordId: string;
  childId: string;
  childDisplayName: string;
  childAge?: string;
  childLocation?: string;
  childPhoto?: any[];
  sponsorEmail: string;
  sponsorName?: string;
  donorRecordId: string;
  subscriptionId?: string | null;
  monthlyAmount?: number;
  // When true, set ChildRevealedAt to now so the sponsor portal skips
  // the lockbox view. Use this for sponsors who came in via a child's
  // profile page (they already know who they're supporting). Leave
  // false/undefined for shirt+monthly flow — those sponsors haven't
  // opened the shirt yet, and the reveal is supposed to be gated on
  // the physical moment.
  alreadyRevealed?: boolean;
}): Promise<{ recordId: string; sponsorCode: string }> {
  const sponsorCode = await generateUniqueSponsorCode();
  const today = new Date().toISOString().split('T')[0];

  // POSTGRES FIRST. Source of truth since the June 22 migration. Idempotent
  // on sponsor_code (uniquely indexed) — a webhook retry won't duplicate.
  // Mirrors before Airtable so an Airtable outage can't drop the sponsorship.
  await mirrorToPostgres(
    `sponsorship ${sponsorCode}`,
    () =>
      mirrorSponsorship({
        sponsorCode,
        sponsorEmail: data.sponsorEmail,
        sponsorName: data.sponsorName ?? null,
        monthlyAmount: data.monthlyAmount ?? 25,
        childLegacyId: data.childId,
        childDisplayName: data.childDisplayName,
        stripeSubscriptionId: data.subscriptionId ?? null,
        sponsorshipStartDate: today,
        revealedNow: !!data.alreadyRevealed,
      })
  );
  console.log('[WH] sponsorship mirrored to Postgres:', sponsorCode);

  // AIRTABLE BEST-EFFORT. Try the legacy mirror; failures (quota,
  // network, schema drift) are logged but no longer break the webhook
  // or block downstream Postgres operations.
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn('[WH] Sponsorship: missing Airtable creds, skipping Airtable mirror (non-fatal)');
    return { recordId: '', sponsorCode };
  }

  const sponsorshipFields: Record<string, unknown> = {
    SponsorCode: sponsorCode,
    SponsorEmail: data.sponsorEmail,
    ChildID: data.childId,
    ChildDisplayName: data.childDisplayName,
    AuthStatus: 'Active',
    Status: 'Active',
    VisibleToSponsor: true,
    SponsorshipStartDate: today,
    // Bidirectional link to child record
    Children: [data.childRecordId],
    // Bidirectional link to donor (full CRM profile)
    Donor: [data.donorRecordId],
    MonthlyAmount: data.monthlyAmount ?? 25,
  };

  if (data.sponsorName) sponsorshipFields.SponsorName = data.sponsorName;
  if (data.childAge) sponsorshipFields.ChildAge = data.childAge;
  if (data.childLocation) sponsorshipFields.ChildLocation = data.childLocation;
  if (data.childPhoto && data.childPhoto.length > 0) {
    sponsorshipFields.ChildPhoto = data.childPhoto;
  }
  if (data.subscriptionId) {
    sponsorshipFields.StripeSubscriptionID = data.subscriptionId;
  }
  if (data.alreadyRevealed) {
    sponsorshipFields.ChildRevealedAt = new Date().toISOString();
  }

  try {
    const response = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}`,
        {
          method: 'POST',
          headers: getAirtableHeaders(),
          body: JSON.stringify({ fields: sponsorshipFields }),
        }
      )
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[WH] Airtable Sponsorship create rejected (non-fatal):', response.status, error.slice(0, 300));
      return { recordId: '', sponsorCode };
    }

    const result = await response.json();
    console.log('[Airtable] Created sponsorship:', result.id, sponsorCode);
    return { recordId: result.id, sponsorCode };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WH] Airtable Sponsorship write failed (non-fatal, Postgres has the sponsorship):', message.slice(0, 300));
    return { recordId: '', sponsorCode };
  }
}

/**
 * Create a Sponsorship record for a cart+monthly checkout completion,
 * with NO Children link (per core_model.md §0 — no matching, ever).
 * The sponsor is a sponsor the second they pay. The kid associated with
 * any shirt they receive is derived from cycle math at display time,
 * not from this row.
 */
async function createSponsorshipFromCartCheckout(data: {
  sponsorCode: string;
  sponsorEmail: string;
  sponsorName?: string;
  monthlyAmount: number;
  stripeSubscriptionId: string;
  donorRecordId: string;
  sponsorshipStartDate: string;
}): Promise<{ recordId: string }> {
  // POSTGRES FIRST. Source of truth since the June 22 migration. No child
  // link — matches the cart-mode Airtable shape. Idempotent on sponsor_code.
  await mirrorToPostgres(
    `cart sponsorship ${data.sponsorCode}`,
    () =>
      mirrorSponsorship({
        sponsorCode: data.sponsorCode,
        sponsorEmail: data.sponsorEmail,
        sponsorName: data.sponsorName ?? null,
        monthlyAmount: data.monthlyAmount,
        childLegacyId: null,
        stripeSubscriptionId: data.stripeSubscriptionId,
        sponsorshipStartDate: data.sponsorshipStartDate,
        revealedNow: false,
      })
  );
  console.log('[WH] cart sponsorship mirrored to Postgres:', data.sponsorCode);

  // AIRTABLE BEST-EFFORT.
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn('[WH] Cart Sponsorship: missing Airtable creds, skipping Airtable mirror (non-fatal)');
    return { recordId: '' };
  }

  const fields: Record<string, unknown> = {
    SponsorCode: data.sponsorCode,
    SponsorEmail: data.sponsorEmail,
    AuthStatus: 'Active',
    Status: 'Active',
    VisibleToSponsor: true,
    SponsorshipStartDate: data.sponsorshipStartDate,
    Donor: [data.donorRecordId],
    MonthlyAmount: data.monthlyAmount,
    StripeSubscriptionID: data.stripeSubscriptionId,
  };
  if (data.sponsorName) fields.SponsorName = data.sponsorName;

  try {
    const response = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}`,
        {
          method: 'POST',
          headers: getAirtableHeaders(),
          body: JSON.stringify({ fields }),
        }
      )
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[WH] Airtable cart Sponsorship create rejected (non-fatal):', response.status, error.slice(0, 300));
      return { recordId: '' };
    }

    const result = await response.json();
    console.log('[Airtable] Created cart Sponsorship:', result.id, data.sponsorCode);
    return { recordId: result.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WH] Airtable cart Sponsorship write failed (non-fatal, Postgres has the sponsorship):', message.slice(0, 300));
    return { recordId: '' };
  }
}

// Send sponsor welcome email with sponsor code
async function sendSponsorWelcomeEmail(data: {
  email: string;
  name: string;
  childDisplayName: string;
  sponsorCode: string;
  amount: number;
  shirtNumber?: number | null;
}): Promise<void> {
  if (!data.email) {
    console.log('[Webhook] No customer email, skipping sponsor welcome email');
    return;
  }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
  const firstName = data.name.split(' ')[0] || 'Friend';
  // The kid is referred to by first name in the Surface 13 paragraph below;
  // "Aaron Ouma Joseph's classroom" reads stiff, "Aaron's classroom" reads
  // human. Display name stays for the formal references elsewhere.
  const childFirstName = (data.childDisplayName || '').split(/\s+/)[0] || data.childDisplayName;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org';
  // The kid's page is the sponsor's home base. No sponsor code shown \u2014
  // the browser remembers them via cookie, and the page itself has a
  // "send me a link back in" recovery if they're ever on a new device.
  const childUrl = typeof data.shirtNumber === 'number'
    ? `${siteUrl}/children/${data.shirtNumber}`
    : siteUrl;
  const childUrlLabel = typeof data.shirtNumber === 'number'
    ? `beanumber.org/${data.shirtNumber}`
    : 'beanumber.org';

  const html = `
          <!DOCTYPE html>
          <html>
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
            <body style="font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
              <p style="margin-top: 0;">Hey ${firstName},</p>

              <p>You're officially sponsoring <strong>${data.childDisplayName}</strong>. Your $${data.amount.toFixed(2)}/month supports the campus where they go to school, eat two meals a day, and get medical care.</p>

              <p><strong>Here&rsquo;s what you unlocked:</strong> you get a penpal, monthly photos, report cards, and campus updates. $25/month. ${childFirstName} is your penpal.</p>

              <p>One thing happens fast on the other side of this. The minute you clicked the button, we sent a note to Simon on the campus. Tomorrow morning over there &mdash; they&rsquo;re hours ahead of us &mdash; Simon is going to tell ${childFirstName} they have a sponsor. They don&rsquo;t know your name yet. They&rsquo;re going to ask.</p>

              <p style="background: #FFF8F0; border-left: 3px solid #D4A843; padding: 16px 20px; margin: 24px 0;"><strong>Reply to this email with your first penpal note for ${childFirstName}.</strong> One sentence. Two. Whatever feels right. We&rsquo;ll pass it on.</p>

              <p><strong>${data.childDisplayName}'s page is at <a href="${childUrl}" style="color: #D4A843;">${childUrlLabel}</a>.</strong> Bookmark it. That's where photos, updates, and penpal letters from the campus will show up over the year, and where you can pick up gear with their number on it. Your browser will remember you, so most of the time you'll land on your page when you visit.</p>

              <p>Here's what else to expect: a monthly newsletter from the campus in Gulu, photos of ${data.childDisplayName} every few months, and a year-end report card. You'll get an email each time your penpal writes back or something new lands on their page.</p>

              <p>If you ever want to write your penpal, visit, change your monthly, or ask anything at all, reply here. I read every one.</p>

              <p>Thanks for being in their corner,<br>
              <strong>Kevin</strong></p>

              <hr style="border: none; border-top: 1px solid #e8e0d4; margin: 30px 0;">

              <p style="font-size: 12px; color: #999; line-height: 1.5;">
                Be A Number, International<br>
                <a href="https://www.beanumber.org" style="color: #D4A843;">beanumber.org</a> \u00b7
                <a href="mailto:Kevin@beanumber.org" style="color: #D4A843;">Kevin@beanumber.org</a><br>
                Tax-deductible under 501(c)(3) \u00b7 EIN: 93-1948872
              </p>
            </body>
          </html>
        `;

  const result = await sendEmail({
    to: { email: data.email, name: data.name },
    from: { email: fromEmail, name: 'Kevin at Be A Number' },
    subject: `You're sponsoring ${data.childDisplayName}.`,
    html,
  });

  if (!result.success) {
    console.error('[Webhook] Sponsor welcome email failed:', result.error);
    return;
  }

  console.log('[Webhook] Sponsor welcome email sent to:', data.email, 'via', result.data?.provider);
}

// ────────────────────────────────────────────────────────────────────────────
// Admin order notification — ping Kevin whenever money lands.
//
// Fires once per completed checkout alongside whatever customer-facing email
// already goes out. Sends a rich HTML summary to ADMIN_NOTIFY_EMAIL
// (default: kevin@beanumber.org) with customer name/email, order details,
// amount, and a Stripe session link.
//
// Best-effort. Any failure is logged but does NOT fail the webhook;
// order records + customer emails must still go through.
// ────────────────────────────────────────────────────────────────────────────
async function sendAdminOrderNotification(data: {
  // One of 'Shirt', 'Shirt + Monthly', 'Sponsorship', 'Donation'
  kind: 'Shirt' | 'Shirt + Monthly' | 'Sponsorship' | 'Donation';
  customerName: string;
  customerEmail: string;
  amount: number;
  isRecurring: boolean;
  // Shirt-specific
  shirtName?: string;
  shirtColor?: string;
  shirtSize?: string;
  // Sponsorship-specific
  childDisplayName?: string;
  shirtNumber?: number;
  sponsorCode?: string;
  // For building the inspector link
  stripeSessionId?: string;
}): Promise<void> {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || 'kevin@beanumber.org';
  const amountStr = `$${data.amount.toFixed(2)}`;
  const recurringTag = data.isRecurring ? '/mo' : '';

  const shortLine = (() => {
    switch (data.kind) {
      case 'Shirt':
        return `${data.customerName} ordered ${data.shirtName} (${data.shirtColor}, ${data.shirtSize}) - ${amountStr}`;
      case 'Shirt + Monthly':
        return `${data.customerName} ordered ${data.shirtName} + sponsoring${data.childDisplayName ? ` ${data.childDisplayName}` : ''} - ${amountStr}/mo`;
      case 'Sponsorship':
        return `${data.customerName} sponsoring${data.childDisplayName ? ` ${data.childDisplayName}` : ''} - ${amountStr}/mo`;
      case 'Donation':
        return `${data.customerName} donated ${amountStr}${recurringTag}`;
    }
  })();

  const stripeLink = data.stripeSessionId
    ? `https://dashboard.stripe.com/payments/${data.stripeSessionId}`
    : '';

  // Rich HTML for the inbox copy. Kept compact and scannable — this email
  // is a ping, not a report.
  const detailsRows: string[] = [
    `<tr><td style="padding: 6px 12px 6px 0; color: #999; font-size: 13px;">Customer</td><td style="padding: 6px 0; font-size: 14px;"><strong>${data.customerName}</strong><br><a href="mailto:${data.customerEmail}" style="color: #D4A843;">${data.customerEmail}</a></td></tr>`,
    `<tr><td style="padding: 6px 12px 6px 0; color: #999; font-size: 13px;">Amount</td><td style="padding: 6px 0; font-size: 14px;"><strong>${amountStr}${recurringTag}</strong></td></tr>`,
    `<tr><td style="padding: 6px 12px 6px 0; color: #999; font-size: 13px;">Type</td><td style="padding: 6px 0; font-size: 14px;">${data.kind}</td></tr>`,
  ];
  if (data.shirtName) {
    detailsRows.push(
      `<tr><td style="padding: 6px 12px 6px 0; color: #999; font-size: 13px;">Shirt</td><td style="padding: 6px 0; font-size: 14px;">${data.shirtName} &middot; ${data.shirtColor} &middot; ${data.shirtSize}</td></tr>`
    );
  }
  if (data.childDisplayName) {
    const numStr = data.shirtNumber ? `#${data.shirtNumber} ` : '';
    detailsRows.push(
      `<tr><td style="padding: 6px 12px 6px 0; color: #999; font-size: 13px;">Child</td><td style="padding: 6px 0; font-size: 14px;">${numStr}${data.childDisplayName}</td></tr>`
    );
  }
  if (data.sponsorCode) {
    detailsRows.push(
      `<tr><td style="padding: 6px 12px 6px 0; color: #999; font-size: 13px;">Sponsor code</td><td style="padding: 6px 0; font-size: 14px; font-family: monospace;">${data.sponsorCode}</td></tr>`
    );
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px 20px; color: #111;">
        <p style="margin-top: 0; color: #D4A843; font-weight: bold; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;">New ${data.kind} order</p>
        <h2 style="margin: 4px 0 20px 0; font-size: 18px; color: #0d0d0d;">${shortLine}</h2>
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          ${detailsRows.join('\n          ')}
        </table>
        ${
          stripeLink
            ? `<p style="margin-top: 24px;"><a href="${stripeLink}" style="display: inline-block; background: #0d0d0d; color: #D4A843; padding: 10px 18px; text-decoration: none; font-size: 13px; font-weight: bold; letter-spacing: 0.05em;">View in Stripe</a></p>`
            : ''
        }
      </body>
    </html>
  `;

  // Send admin email notification. Best-effort — any failure is logged
  // but does NOT fail the webhook.
  try {
    const from = { email: fromEmail, name: 'BAN Orders' };

    const adminResult = await sendEmail({
      to: { email: adminEmail },
      from,
      subject: shortLine,
      html,
      text: `New ${data.kind.toLowerCase()}: ${shortLine}`,
    });

    if (!adminResult.success) {
      console.error('[Webhook] Admin notification email failed:', adminResult.error);
    }

    console.log('[Webhook] Admin notification sent:', {
      kind: data.kind,
      admin: adminEmail,
      adminProvider: adminResult.data?.provider,
    });
  } catch (error) {
    console.error('[Webhook] Admin notification failed (non-fatal):', error);
  }
}

/**
 * Zero-touch shipping refund for the legacy free-shirt program.
 *
 * When a checkout uses a promotion code whose coupon carries the
 * lookup_key 'legacy_sponsor_free_shirt_v1' (created by
 * scripts/legacy-sponsor-free-shirt.ts), the shirt line item is 100% off
 * but shipping ($5) remains. This helper detects that scenario and
 * refunds the shipping amount from the payment intent so the recipient
 * pays $0 net.
 *
 * Idempotent — uses a deterministic Stripe idempotency key derived from
 * the session ID, so webhook retries and duplicate deliveries won't
 * refund twice.
 *
 * Non-fatal — any error is logged and swallowed so the main checkout
 * flow continues unaffected.
 */
async function refundLegacyShippingIfApplicable(
  session: Stripe.Checkout.Session,
  stripe: Stripe
): Promise<void> {
  try {
    // Only payment-mode sessions have shipping; subscription mode has none.
    if (session.mode !== 'payment') return;

    // The applied promotion codes ride on session.discounts. Fast-exit
    // when no discounts were applied — most sessions have none.
    const discounts = session.discounts || [];
    if (discounts.length === 0) return;

    // Look up each applied promotion code and check the coupon's
    // lookup_key metadata. As soon as we find a legacy-program coupon,
    // trigger the refund path.
    let isLegacyCoupon = false;
    for (const d of discounts) {
      const promoCodeId =
        typeof d.promotion_code === 'string'
          ? d.promotion_code
          : d.promotion_code?.id;
      if (!promoCodeId) continue;
      // Stripe SDK v20 nests the coupon under `promotion.coupon` (was
      // top-level `coupon` in v19 and earlier). The API sometimes still
      // returns the legacy shape for backwards compatibility, so we
      // check both locations and use whichever is populated. Expanding
      // both paths is safe — Stripe ignores unknown expand entries.
      const pc = (await stripe.promotionCodes.retrieve(promoCodeId, {
        expand: ['promotion.coupon', 'coupon'],
      })) as Stripe.PromotionCode & {
        coupon?: string | Stripe.Coupon | null;
      };
      const coupon = pc.promotion?.coupon ?? pc.coupon;
      // Belt-and-suspenders null guard: typeof null === 'object' in JS,
      // so a bare typeof check isn't safe. The promotion code should
      // always have a coupon in practice — this just prevents an
      // exception if Stripe ever returns an unexpected shape.
      if (
        coupon &&
        typeof coupon === 'object' &&
        coupon.metadata?.lookup_key === 'legacy_sponsor_free_shirt_v1'
      ) {
        isLegacyCoupon = true;
        break;
      }
    }
    if (!isLegacyCoupon) return;

    // Nothing to refund if shipping was already $0 (e.g. someone chose
    // a free-shipping option manually).
    const shippingAmount = session.shipping_cost?.amount_total || 0;
    if (shippingAmount <= 0) return;

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!paymentIntentId) return;

    // Deterministic idempotency key — Stripe will return the SAME refund
    // if this key is reused, so webhook retries won't double-refund.
    const idempotencyKey = `legacy_ship_refund_${session.id}`;

    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: shippingAmount,
        reason: 'requested_by_customer',
        metadata: {
          legacy_shipping_refund: 'true',
          session_id: session.id,
          program: 'legacy_sponsor_free_shirt_v1',
        },
      },
      { idempotencyKey }
    );
    console.log(
      `[WH] Legacy shipping refund issued: ${refund.id} for $${
        shippingAmount / 100
      } on session ${session.id}`
    );
  } catch (err) {
    // Non-fatal — main checkout flow continues. Kevin will still see
    // the completed order; the $5 shipping refund can be issued
    // manually if this failed.
    console.error(
      '[WH] Legacy shipping refund failed (non-fatal):',
      err instanceof Error ? err.message : String(err)
    );
  }
}

// Handle successful checkout session
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('[WH] S0: checkout', session.id, 'mode=' + session.mode, 'type=' + (session.metadata?.order_type || 'donation'));

  // Kick off the zero-touch legacy shipping refund in parallel with the
  // main flow. Detects the coupon on the session and refunds shipping if
  // it matches. Non-blocking through the main body — we await in the
  // finally block below so it lands regardless of which return path
  // fires or whether the main flow throws.
  const stripeClient = await getStripe();
  const shippingRefundPromise = refundLegacyShippingIfApplicable(
    session,
    stripeClient
  );

  try {
    // Extract donor information directly from the session object.
    // The session already contains customer_details (name, email, phone,
    // address) and payment_status — we don't need to make additional Stripe
    // API calls to retrieve the PaymentIntent or Customer objects. Skipping
    // those two calls saves ~1s and keeps us inside the serverless timeout.
    const paymentIntentId = (session.payment_intent as string) || session.id;

    // ── IDEMPOTENCY GUARD ──────────────────────────────────────────────
    // Stripe retries webhook delivery when it doesn't get a 2xx in time.
    // We check the Donations table: if a donation already exists for this
    // payment intent, all critical side effects (child assignment,
    // fulfillment record creation) have already run — they execute BEFORE
    // the donation upsert in every flow.  Emails / drip / notifications
    // are non-fatal and safe to skip on retry.
    //
    // Postgres-first: ask the donations table directly. This is the only
    // store that's reliably available — Airtable can be down or quota-
    // limited and we still need idempotency to hold so Stripe retries
    // during an Airtable outage don't double-process the same payment
    // (duplicate admin emails, duplicate drip enrollment, etc.).
    // ────────────────────────────────────────────────────────────────────
    const pgIdempotency = await findDonationByPaymentIntent(paymentIntentId);
    if (pgIdempotency) {
      console.log(
        `[WH] IDEMPOTENCY (pg): donation already exists for PI ${paymentIntentId}, ` +
        `status=${pgIdempotency.paymentStatus}, id=${pgIdempotency.id}. Skipping all side effects.`
      );
      return;
    }

    // Secondary defense: the original Airtable-based check stays until we
    // cut over fully. If Postgres said "no row yet" but Airtable already
    // logged this PI (the most likely cause is a Postgres write that
    // hadn't landed at retry time), skip the side effects on Airtable's
    // word. If Airtable is down, this block is a no-op and Postgres
    // already had the final say above.
    if (AIRTABLE_API_KEY && AIRTABLE_BASE_ID) {
      const idempotencyFormula = `{Stripe Payment Intent ID} = "${paymentIntentId}"`;
      try {
        const idempotencyRes = await airtableAPICall(() =>
          fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}?filterByFormula=${encodeURIComponent(idempotencyFormula)}&maxRecords=1`,
            { headers: getAirtableHeaders() }
          )
        );
        if (idempotencyRes.ok) {
          const idempotencyData = await idempotencyRes.json();
          const existing = idempotencyData.records?.[0];
          if (existing) {
            const existingStatus = existing.fields?.Status || existing.fields?.['Status'] || '';
            console.log(
              `[WH] IDEMPOTENCY: donation already exists for PI ${paymentIntentId}, ` +
              `status=${existingStatus}, record=${existing.id}. Skipping all side effects.`
            );
            return;
          }
        }
      } catch (err) {
        // If the idempotency check itself fails, log and continue —
        // better to risk a duplicate than to silently drop a real order.
        console.error('[WH] IDEMPOTENCY check failed, proceeding anyway:', err);
      }
    }

    const email = session.customer_email || session.customer_details?.email || '';
    // Name resolution — three-way fallback (2026-07-10 middle-path fix).
    // 1. The name the buyer typed on our own cart form
    //    (metadata.customer_name from create-cart-checkout, or
    //     metadata.customer_name from portal-purchase — same key).
    // 2. Stripe's cardholder name (customer_details.name) collected
    //    at Stripe's hosted checkout page. This is the authoritative
    //    name on the payment method.
    // 3. Legacy metadata.donor_name (never actually written by the
    //    current cart, kept for old Donorbox migrations).
    // 4. 'Anonymous' fallback so downstream inserts never crash on
    //    NULL, but this now really means "we couldn't get a name
    //    from ANY source" — a rare case worth flagging in logs.
    //
    // Old order was Stripe-first, which meant buyers who typed a
    // name on our form but had a blank cardholder name on Stripe
    // still got recorded as whatever Stripe returned (often empty
    // → 'Anonymous'). The site form is the buyer's actual choice
    // and should win when present.
    const siteFormName =
      (session.metadata?.customer_name || '').trim() ||
      (session.metadata?.donor_name || '').trim();
    const stripeCardholderName = (session.customer_details?.name || '').trim();
    const name = siteFormName || stripeCardholderName || 'Anonymous';
    if (name === 'Anonymous') {
      console.log(
        `[WH] No name resolved from any source for session ${session.id}; recorded as Anonymous.`
      );
    }
    const organization = session.custom_fields?.find(f => f.key === 'organization')?.text?.value || '';
    const referralRaw = session.custom_fields?.find(f => f.key === 'referral')?.text?.value || '';
    const phone = session.customer_details?.phone || '';
    // Prefer shipping address (collected at checkout for shirt/cart orders)
    // over billing address (customer_details.address), which often only has
    // a postal code when the buyer's card is on file with minimal info.
    const address = (session as any).shipping_details?.address
      || session.customer_details?.address
      || null;

    // Format address as single string
    const addressString = address
      ? `${address.line1 || ''}${address.line2 ? ', ' + address.line2 : ''}, ${address.city || ''}, ${address.state || ''} ${address.postal_code || ''}, ${address.country || ''}`
      : undefined;

    const stripeCustomerId = session.customer as string || null;
    const amount = session.amount_total ? session.amount_total / 100 : 0;
    const currency = session.currency || 'usd';
    const isRecurring = session.mode === 'subscription';
    const subscriptionId = session.subscription as string | null;
    const donationDate = new Date().toISOString().split('T')[0];
    // session.payment_status is 'paid' | 'unpaid' | 'no_payment_required'.
    // For checkout.session.completed, it's always 'paid'.
    const status = session.payment_status === 'paid' ? 'Succeeded' : 'Pending';

    // Step 1: Find or create donor (shared for donations, shirt orders, sponsorships)
    // Branch: Shirt order, Shirt + Monthly, Sponsorship, or standard donation.
    // We determine the branch BEFORE calling findOrCreateDonor so we can
    // parallelize the donor lookup with path-specific Airtable work (child
    // assignment or child record fetch). This shaves ~1-2s off total time,
    // critical for staying inside the serverless timeout.
    const isShirtOrder = session.metadata?.order_type === 'shirt';
    const isShirtPlusMonthly = session.metadata?.order_type === 'shirt_plus_monthly';
    const isSponsorship = session.metadata?.order_type === 'sponsorship';
    const isCart = session.metadata?.order_type === 'cart';
    // Memo §5: "Shop Your Number" — active sponsor reordering with their
    // existing shirt number, no new child assignment, no new sponsorship.
    const isPortalRepeat = session.metadata?.order_type === 'portal_repeat';
    // Memo §11: Gift sponsorship — gifter pays $25 one-time, recipient
    // gets matched to a child and emailed an intro. Recipient may
    // convert to a $25/mo sponsor from the reveal page.
    const isGiftSponsorship = session.metadata?.order_type === 'gift_sponsorship';
    // Number Collection (Hoodie / Hat / Stickers): active sponsor buying
    // a merch item with their child's number on it. No Sponsorship
    // changes, no drip enrollment, no Fulfillment row — Kevin makes the
    // item by hand from the admin notification email and ships it.
    const isMerchPurchase = session.metadata?.order_type === 'merch_purchase';

    const donorArgs = {
      name,
      organization: organization || undefined,
      email,
      phone: phone || undefined,
      address: addressString,
      referral: referralRaw || undefined,
    };

    // Start the donor lookup — every path needs it.
    console.log('[WH] S1: donor lookup starting, email=' + email);
    const donorPromise = findOrCreateDonor(stripeCustomerId, email, donorArgs);

    if (isCart) {
      // --- CART ORDER FLOW ---
      // Multiple shirts in one payment-mode checkout. Each shirt gets its
      // own child assignment. Items with continueMonthly get a deferred
      // Stripe subscription created using the saved payment method.
      const itemsJson = session.metadata?.items_json || '[]';
      // Legacy sessions (pre-July 2026) carried n and c as separate
      // fields. New sessions omit both — they're derivable from s
      // (shirtId) via the SHIRT_NAMES map below. The type keeps both
      // as optional for the transition window; any in-flight legacy
      // session still parses cleanly and we fall back to item.n/item.c
      // if present.
      let cartItems: Array<{
        i: number;
        s: string;
        n?: string;
        c?: string;
        z: string;
        m: number;
      }> = [];
      try {
        cartItems = JSON.parse(itemsJson);
      } catch (e) {
        console.error('[WH] Failed to parse cart items_json:', e);
      }

      console.log('[WH] S2: cart flow, items=' + cartItems.length);

      const donorId = await donorPromise;
      console.log('[WH] S3: donor resolved for cart, id=' + donorId);

      // All 4 shirt designs are named after their color, so shirtName
      // and shirtColor collapse to the same titlecase string. Kept as
      // separate downstream fields because email templates + admin
      // surfaces still render them as separate columns.
      const SHIRT_NAMES: Record<string, string> = {
        onyx: 'Onyx',
        meadow: 'Meadow',
        blossom: 'Blossom',
        sky: 'Sky',
      };

      // Stockpile model (May 2026 forward): no per-item child assignment.
      // Kevin pulls pre-printed shirts that match color+size from inventory
      // and reconciles the shipped numbers into Fulfillment after shipping.
      const assignments: Array<{
        itemIndex: number;
        shirtName: string;
        shirtColor: string;
        shirtSize: string;
        continueMonthly: boolean;
      }> = cartItems.map(item => ({
        itemIndex: item.i,
        shirtName: item.n ?? SHIRT_NAMES[item.s] ?? item.s,
        shirtColor: item.c ?? SHIRT_NAMES[item.s] ?? item.s,
        shirtSize: item.z,
        continueMonthly: item.m === 1,
      }));

      // Create Fulfillment records FIRST — before the donation upsert.
      // Order # and Child Name stay blank; Kevin fills them in when he
      // reconciles which stockpile shirts went out.
      for (let i = 0; i < assignments.length; i++) {
        const a = assignments[i];
        try {
          await createFulfillmentRecord({
            design: 'Number Tee',
            shirtColor: a.shirtColor,
            shirtSize: a.shirtSize,
            buyerName: name,
            buyerEmail: email,
            address: address || null,
            orderDate: donationDate,
            notes: a.continueMonthly ? 'Cart item with monthly opt-in — match pending shipment' : 'Cart item — match pending shipment',
            // Idempotency: session + line-item index. Prevents Stripe
            // webhook retries from double-inserting the same cart row.
            stripeSessionId: session.id,
            itemIndex: i,
          });
        } catch (err: any) {
          console.error('[WH] Cart fulfillment record failed:', String(err?.message || err).slice(0, 200));
        }
      }

      // Create one donation record for the full cart amount. No child link
      // — matches resolved post-shipment.
      const assignmentNotes = assignments.map(a => {
        const monthlyNote = a.continueMonthly ? ' +monthly' : '';
        return `${a.shirtName} / ${a.shirtColor} / ${a.shirtSize} -> pending stockpile match${monthlyNote}`;
      });

      console.log('[WH] S4: upsert donation (cart)');
      const donationId = await upsertDonation(paymentIntentId, {
        sessionId: session.id,
        customerId: stripeCustomerId,
        donorId,
        amount,
        currency,
        donationDate,
        isRecurring: false,
        subscriptionId: null,
        status,
        email,
        name,
        organization: organization || undefined,
        address,
        donationSource: 'Shirt Order',
        notes: `[Cart: ${cartItems.length} shirts, stockpile fulfillment]${session.metadata?.ref_code ? ` [Ref: ${session.metadata.ref_code}]` : ''}${session.metadata?.promo_code ? ` [Promo: ${session.metadata.promo_code} ${session.metadata.promo_percent_off || ''}%]` : ''}\n${assignmentNotes.join('\n')}`,
        // childRecordId intentionally omitted — match resolved post-shipment
      });

      // Cart monthly opt-ins — the Shirt + Stay conversion path through
      // the cart.
      //
      // Two paths exist here for backwards compatibility:
      //
      //   (A) NEW (June 2026 onward): the cart checkout is created in
      //       `mode: 'subscription'` when +monthly is present. Stripe
      //       creates the subscription itself during checkout, so
      //       `session.subscription` is populated on the completed
      //       session. We skip the retroactive subscriptions.create()
      //       call entirely (it would create a duplicate) and just
      //       create the Sponsorship row with the existing sub ID.
      //
      //   (B) OLD (pre-June 2026): cart created in `mode: 'payment'`
      //       with no recurring line items. session.subscription is
      //       null. We retroactively call subscriptions.create() using
      //       the saved payment method. This path silently failed for
      //       4 buyers in June 2026 (see docs/claude/known_gotchas.md).
      //       Path retained only to handle any in-flight sessions
      //       created before the cart-checkout fix shipped.
      //
      // Per `core_model.md` §0: NO MATCHING. Sponsorship rows are
      // created with `Children` link blank, regardless of path. The
      // buyer is a sponsor the second they pay — no waiting on a kid
      // assignment that never happens.
      const monthlyOptIns = assignments.filter(a => a.continueMonthly);
      const existingSubscriptionId =
        (typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id) || null;

      if (monthlyOptIns.length > 0 && existingSubscriptionId) {
        // PATH A: subscription-mode cart. Stripe already made the sub.
        // Create the Sponsorship row with the sub ID, blank Children
        // link. One Sponsorship per cart (even if multiple +monthly
        // items rolled into one sub in subscription mode).
        try {
          const sponsorCode = await generateUniqueSponsorCode();
          const monthlyAmount = SHIRT_PRICE * monthlyOptIns.length;
          await createSponsorshipFromCartCheckout({
            sponsorCode,
            sponsorEmail: email,
            sponsorName: name,
            monthlyAmount,
            stripeSubscriptionId: existingSubscriptionId,
            donorRecordId: donorId,
            sponsorshipStartDate: donationDate,
          });
          console.log('[WH] Created cart Sponsorship row, code=' + sponsorCode + ', sub=' + existingSubscriptionId);
        } catch (err: any) {
          console.error('[WH] Cart Sponsorship row create failed:', String(err?.message || err).slice(0, 200));
          await sendEmail({
            to: { email: 'kevin@beanumber.org', name: 'Kevin' },
            subject: 'Cart Sponsorship row failed to create (sub exists in Stripe)',
            html: `<p>A cart+monthly checkout completed and the Stripe subscription was created (${existingSubscriptionId}), but the Airtable Sponsorship row failed to write.</p>
<p><strong>Buyer:</strong> ${name || 'unknown'} (${email})<br/>
<strong>Session:</strong> ${session.id}<br/>
<strong>Error:</strong> ${err?.message || String(err)}</p>
<p>Create the Sponsorship row manually with SponsorEmail=${email}, StripeSubscriptionID=${existingSubscriptionId}, Status=Active, MonthlyAmount=${SHIRT_PRICE * monthlyOptIns.length}.</p>`,
          }).catch(e => console.error('[WH] Failed to send Sponsorship-create alert:', e));
        }
      } else if (monthlyOptIns.length > 0 && !stripeCustomerId) {
        // CRITICAL: Cart checkout should have set customer_creation:'always'.
        // If we have monthly items but no customer, the saved-payment-method
        // path fails and we can't create deferred subscriptions.
        console.error('[WH] CRITICAL: Cart has ' + monthlyOptIns.length + ' monthly items but NO Stripe customer ID. Subscriptions cannot be created. Session: ' + session.id + ', email: ' + email);
        await sendEmail({
          to: { email: 'kevin@beanumber.org', name: 'Kevin' },
          subject: 'Cart monthly subscription needs manual setup (no Stripe customer)',
          html: `<p>A cart checkout completed with ${monthlyOptIns.length} monthly opt-in(s), but Stripe didn't create a customer record so deferred subscriptions could not be set up.</p>
<p><strong>Buyer:</strong> ${name || 'unknown'} (${email})<br/>
<strong>Session:</strong> ${session.id}</p>
<p>The shirts paid for went through fine. The monthly subscription(s) are NOT active — create them manually in Stripe.</p>`,
        }).catch(e => console.error('[WH] Failed to send subscription-failure alert:', e));
      }
      // OLD PATH (B) — DELETED June 2026.
      //
      // The retroactive subscriptions.create() block that used to live
      // here is gone. It had a quiet bug: it passed `price_data.product_data`
      // to stripe.subscriptions.create(), which that endpoint does not
      // accept (Checkout sessions do; subscriptions do not — they need
      // an existing product ID). The call always errored with
      // "Received unknown parameter: items[0][price_data][product_data]"
      // and the catch block fired sendEmail() to kevin@beanumber.org —
      // which also silently failed, so we got zero visible alerts for
      // four broken cart+monthly checkouts in June 2026.
      //
      // The fix at the architecture level is in /api/create-cart-checkout —
      // any +monthly cart now creates the checkout session in
      // mode:'subscription', so Stripe natively creates the sub during
      // checkout and `session.subscription` is set on completion. PATH A
      // above handles that case. There is no longer any "deferred"
      // subscription creation. If a future cart somehow lands here with
      // monthly items but no session.subscription, the alert below
      // surfaces it so we can fix manually.
      if (monthlyOptIns.length > 0 && !existingSubscriptionId) {
        console.error('[WH] Cart has ' + monthlyOptIns.length + ' monthly items but session.subscription is missing. Session: ' + session.id + ', email: ' + email);
        await sendEmail({
          to: { email: 'kevin@beanumber.org', name: 'Kevin' },
          subject: 'Cart +monthly checkout missing Stripe subscription',
          html: `<p>A cart checkout completed with ${monthlyOptIns.length} monthly opt-in(s), but session.subscription was not populated on completion. The Stripe subscription was not created automatically.</p>
<p><strong>Buyer:</strong> ${name || 'unknown'} (${email})<br/>
<strong>Session:</strong> ${session.id}</p>
<p>Action: hit /api/admin/backfill-subscriptions to create the sub from the saved payment method, or restart the buyer's subscription manually.</p>`,
        }).catch(e => console.error('[WH] Failed to send missing-sub alert:', e));
      }

      // Send one combined confirmation email
      let emailStatus = 'Sent';
      try {
        await sendShirtConfirmationEmail({
          email,
          name,
          shirtName: cartItems.length === 1
            ? assignments[0].shirtName
            : `${cartItems.length} shirts`,
          shirtColor: cartItems.length === 1
            ? assignments[0].shirtColor
            : 'assorted',
          shirtSize: cartItems.length === 1
            ? assignments[0].shirtSize
            : 'assorted',
          amount,
          alreadySponsoring: monthlyOptIns.length > 0,
        });
      } catch (err) {
        console.error('[WH] Cart confirmation email failed:', err);
        emailStatus = 'Failed';
      }

      // Communication record
      try {
        await createCommunicationRecord(donationId, donorId, {
          email,
          subject: `Your ${cartItems.length} shirt${cartItems.length > 1 ? 's are' : ' is'} being made.`,
          body: `Cart order: ${assignmentNotes.join('; ')}`,
          status: emailStatus,
          stripePaymentIntentId: paymentIntentId,
        });
      } catch (err) {
        console.error('[WH] Cart communication record failed:', err);
      }

      // Admin notification
      try {
        await sendAdminOrderNotification({
          kind: monthlyOptIns.length > 0 ? 'Shirt + Monthly' : 'Shirt',
          customerName: name,
          customerEmail: email,
          amount,
          isRecurring: monthlyOptIns.length > 0,
          shirtName: cartItems.length === 1 ? assignments[0].shirtName : `${cartItems.length} shirts`,
          shirtColor: cartItems.length === 1 ? assignments[0].shirtColor : 'assorted',
          shirtSize: cartItems.length === 1 ? assignments[0].shirtSize : 'assorted',
          stripeSessionId: session.id,
        });
      } catch (err: any) {
        console.error('[WH] Cart admin notify failed:', String(err?.message || err).slice(0, 200));
      }

      // Drip enrollment — under the stockpile model, names/numbers are
      // blank because no assignment happened. The drip templates branch
      // on whether a child name is set, so they'll render the generic
      // "the child connected to your shirt" copy.
      //
      // Pipeline selection:
      //   - any monthly opt-in    → 'shirt_sponsor' (online + market both)
      //   - shirt-only, online    → 'shirt_nurture' (10-day delay, "in mail")
      //   - shirt-only, in-person → 'shirt_nurture_inperson' (3-day delay,
      //                              "in your hands" stage-0 copy)
      if (donorId) {
        const isMarketCart = session.metadata?.sold_in_person === 'true';
        let pipeline: string;
        let dripDelayDays: number;
        if (monthlyOptIns.length > 0) {
          pipeline = 'shirt_sponsor';
          dripDelayDays = 10;
        } else if (isMarketCart) {
          pipeline = 'shirt_nurture_inperson';
          dripDelayDays = 3;
        } else {
          pipeline = 'shirt_nurture';
          dripDelayDays = 10;
        }
        const dripNextSendDate = new Date(Date.now() + dripDelayDays * 86400000);
        const dripNextSendStr = dripNextSendDate.toISOString().split('T')[0];

        try {
          await airtableAPICall(() =>
            fetch(
              `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}/${donorId}`,
              {
                method: 'PATCH',
                headers: getAirtableHeaders(),
                body: JSON.stringify({
                  fields: {
                    DripPipeline: pipeline,
                    DripStage: 0,
                    DripNextSend: dripNextSendStr,
                  },
                }),
              }
            )
          );
          console.log(`[WH] Cart: enrolled in ${pipeline} drip (no numbers yet), next send ${dripNextSendStr}`);
        } catch (err: any) {
          console.error('[WH] Cart drip enrollment failed:', String(err?.message || err).slice(0, 200));
        }

        // Mirror to Postgres so the drip cron (which queries Postgres)
        // can find this donor. Wrapped in mirrorToPostgres so a Postgres
        // failure logs without breaking the Airtable write or the receipt.
        const cartDonorEmail = email;
        if (cartDonorEmail) {
          await mirrorToPostgres('cart-drip-fields', async () => {
            await mirrorDripFields({
              email: cartDonorEmail,
              dripPipeline: pipeline,
              dripStage: 0,
              dripNextSend: dripNextSendDate,
            });
          });
        }
      }

      console.log('[WH] Cart order complete:', {
        sessionId: session.id,
        items: cartItems.length,
        assigned: 'pending stockpile reconciliation',
        monthlyOptIns: monthlyOptIns.length,
      });

      return { donorId, donationId, assignments };

    } else if (isSponsorship) {
      // --- SPONSORSHIP FLOW ---
      const childRecordId = session.metadata?.child_record_id || '';
      const childIdMeta = session.metadata?.child_id || '';
      const childDisplayNameMeta = session.metadata?.child_display_name || '';
      const referral = session.custom_fields?.find(f => f.key === 'referral')?.text?.value || '';

      console.log('[WH] S2: sponsorship flow, child=' + childRecordId);

      if (!childRecordId) {
        console.error('[Webhook] Sponsorship missing child_record_id in metadata');
      }

      // Parallelize: donor lookup + child record fetch
      const [donorId, childRecord] = await Promise.all([
        donorPromise,
        childRecordId ? fetchChildRecord(childRecordId) : Promise.resolve(null),
      ]);
      const childFields = childRecord?.fields || {};
      const childDisplayName = childFields.DisplayName || childDisplayNameMeta || 'a child';
      const childId = childFields.ChildID || childFields['Child ID'] || childIdMeta;
      const childPhoto = childFields.ProfilePhoto;
      const childLocation = childFields.SchoolLocation;
      const childShirtNumber =
        typeof childFields.ShirtNumber === 'number' ? childFields.ShirtNumber : null;

      // Step 2c: Record the first month as a donation tagged as Sponsorship
      console.log('[WH] S3: upsert donation, pi=' + paymentIntentId);
      const donationId = await upsertDonation(paymentIntentId, {
        sessionId: session.id,
        customerId: stripeCustomerId,
        donorId,
        amount,
        currency,
        donationDate,
        isRecurring: true,
        subscriptionId,
        status,
        email,
        name,
        organization: organization || undefined,
        address,
        donationSource: 'Sponsorship',
        notes: `Sponsorship of ${childDisplayName} (${childId || 'no id'})${referral ? ` \u00b7 Heard via: ${referral}` : ''}`,
        childRecordId: childRecordId || undefined,
      });

      // Step 3c: Create Sponsorship record (bidirectionally linked to Child)
      let sponsorCode = '';
      let sponsorshipRecordId = '';
      if (childRecordId) {
        try {
          const result = await createSponsorshipRecord({
            childRecordId,
            childId: childId || '',
            childDisplayName,
            childAge: childFields.DateOfBirth ? undefined : childFields.GradeClass,
            childLocation,
            childPhoto,
            sponsorEmail: email,
            sponsorName: name,
            donorRecordId: donorId,
            subscriptionId,
            monthlyAmount: amount,
            // Regular sponsorship path: the sponsor landed on this
            // child's /children/[n] page and chose to sponsor them,
            // so the reveal has already happened. Don't lock the
            // portal against someone who just met their child on
            // our own site.
            alreadyRevealed: true,
          });
          sponsorCode = result.sponsorCode;
          sponsorshipRecordId = result.recordId;
        } catch (err) {
          console.error('[Webhook] Failed to create sponsorship record:', err);
        }
      }

      // Step 4c: Send sponsor welcome email
      let emailStatus = 'Sent';
      try {
        if (sponsorCode) {
          await sendSponsorWelcomeEmail({
            email,
            name,
            childDisplayName,
            sponsorCode,
            amount,
            shirtNumber: childShirtNumber,
          });
        }
      } catch (err) {
        console.error('[Webhook] Failed to send sponsor welcome email:', err);
        emailStatus = 'Failed';
      }

      // Step 5c: Communication record
      try {
        await createCommunicationRecord(donationId, donorId, {
          email,
          subject: `You're sponsoring ${childDisplayName}.`,
          body: `Sponsorship welcome. Code: ${sponsorCode || 'N/A'}. Child: ${childDisplayName} (${childId || 'no id'}). $${amount.toFixed(2)}/mo.`,
          status: emailStatus,
          stripePaymentIntentId: paymentIntentId,
        });
      } catch (err) {
        console.error('[Webhook] Failed to create communication record:', err);
      }

      // Step 6c: Ping Kevin (email + SMS gateway) — non-fatal.
      console.log('[WH] S6: admin notify (sponsorship)');
      try {
        await sendAdminOrderNotification({
          kind: 'Sponsorship',
          customerName: name,
          customerEmail: email,
          amount,
          isRecurring: true,
          childDisplayName,
          sponsorCode: sponsorCode || undefined,
          stripeSessionId: session.id,
        });
      } catch (err: any) {
        console.error('[WH] admin notify failed:', String(err?.message || err).slice(0, 200));
      }

      console.log('[Webhook] Successfully processed sponsorship:', {
        sessionId: session.id,
        donorId,
        donationId,
        sponsorshipRecordId,
        sponsorCode,
        childRecordId,
      });

      return { donorId, donationId, sponsorshipRecordId, sponsorCode };
    } else if (isShirtPlusMonthly) {
      // --- SHIRT + MONTHLY SPONSORSHIP FLOW ---
      //
      // Under the May 2026 stockpile model the /shirts page hides the
      // "also sponsor monthly" toggle, so this branch should rarely fire.
      // It still exists as a defensive fallback for in-flight orders, deep
      // links, or session replays. When it does fire we:
      //   - record the Donation (the customer paid; they need a receipt)
      //   - NOT assign a child or create a Sponsorship (no number known yet)
      //   - NOT issue a sponsor code (no Sponsorship to attach it to)
      //   - send the standard shirt confirmation email plus a note that
      //     their monthly is active and portal access comes after shipping
      const shirtName = session.metadata?.shirt_name || 'Unknown';
      const shirtColor = session.metadata?.shirt_color || 'Unknown';
      const shirtSize = session.metadata?.shirt_size || 'Unknown';
      const shirtId = session.metadata?.shirt_id || 'unknown';
      const referral = session.custom_fields?.find(f => f.key === 'referral')?.text?.value || '';

      console.log('[WH] S2: shirt+monthly flow (no assignment), sub=' + subscriptionId);

      const donorId: string = await donorPromise;

      // Step 3: Backfill subscription metadata so retention analytics and
      // future reconciliation can find this subscription. No child yet —
      // Kevin links the child after he ships the shirt and records the
      // number that went out.
      if (subscriptionId) {
        try {
          const stripe = await getStripe();
          const backfillMeta: Record<string, string> = {
            order_type: 'shirt_plus_monthly',
            shirt_id: shirtId,
            shirt_name: shirtName,
            shirt_color: shirtColor,
            shirt_size: shirtSize,
            customer_name: name || '',
            continue_monthly: 'true',
            referring_shirt_session_id: session.id,
            pending_child_match: 'true',
          };
          await stripe.subscriptions.update(subscriptionId, {
            metadata: backfillMeta,
          });
          console.log('[Webhook] Backfilled subscription metadata:', subscriptionId);
        } catch (err) {
          console.error('[Webhook] Failed to backfill subscription metadata:', err);
        }
      }

      // Create Fulfillment record BEFORE the donation upsert.
      // Order # and Child Name stay blank — Kevin fills them in when he
      // reconciles which stockpile shirt was shipped.
      try {
        await createFulfillmentRecord({
          design: 'Number Tee',
          shirtColor,
          shirtSize,
          buyerName: name,
          buyerEmail: email,
          address: address || null,
          orderDate: donationDate,
          notes: 'Shirt + Monthly — match pending shipment',
          stripeSessionId: session.id,
          itemIndex: 0,
        });
      } catch (err: any) {
        console.error('[WH] Fulfillment record failed (shirt+monthly):', String(err?.message || err).slice(0, 200));
      }

      // Step 4: Record first month as a Donation. Tagged 'Shirt + Monthly'
      // for revenue-source reports. No child link yet \u2014 Kevin reconciles
      // after shipping.
      const assignmentNote = ' / Number + child match pending shipment (stockpile fulfillment)';
      console.log('[WH] S4: upsert donation (shirt+monthly)');
      const donationId = await upsertDonation(paymentIntentId, {
        sessionId: session.id,
        customerId: stripeCustomerId,
        donorId,
        amount,
        currency,
        donationDate,
        isRecurring: true,
        subscriptionId,
        status,
        email,
        name,
        organization: organization || undefined,
        address,
        donationSource: 'Shirt + Monthly',
        notes: `Shirt+Monthly: ${shirtName} / ${shirtColor} / ${shirtSize}${assignmentNote}${session.metadata?.ref_code ? ` [Ref: ${session.metadata.ref_code}]` : ''}${session.metadata?.promo_code ? ` [Promo: ${session.metadata.promo_code} ${session.metadata.promo_percent_off || ''}%]` : ''}${referral ? ` \u00b7 Heard via: ${referral}` : ''}`,
        // childRecordId intentionally omitted \u2014 match resolved post-shipment
      });

      // Step 5: Sponsorship record creation deferred under the stockpile
      // model. We can't link a sponsor to a child we haven't matched yet.
      // Kevin creates the Sponsorship row + issues the sponsor code manually
      // after shipping. The buyer's monthly is active in Stripe and tracked
      // on the Donation, just without portal access until reconciliation.

      // Step 6: Send shirt confirmation email. alreadySponsoring=true so the
      // email includes the "monthly is active" block — but with no sponsor
      // code (none generated yet). The reveal block stays generic.
      let emailStatus = 'Sent';
      try {
        await sendShirtConfirmationEmail({
          email,
          name,
          shirtName,
          shirtColor,
          shirtSize,
          amount,
          alreadySponsoring: true,
        });
      } catch (err) {
        console.error('[Webhook] Failed to send shirt+monthly welcome email:', err);
        emailStatus = 'Failed';
      }

      // Step 7: Communication record
      try {
        await createCommunicationRecord(donationId, donorId, {
          email,
          subject: 'Your shirt + monthly sponsorship is confirmed.',
          body: `Shirt+Monthly (stockpile, match pending): ${shirtName} (${shirtColor}, ${shirtSize}) / $${amount.toFixed(2)}/mo`,
          status: emailStatus,
          stripePaymentIntentId: paymentIntentId,
        });
      } catch (err) {
        console.error('[Webhook] Failed to create communication record (shirt+monthly):', err);
      }

      // Step 8: Ping Kevin (email + SMS gateway) — non-fatal.
      console.log('[WH] S8: admin notify (shirt+monthly)');
      try {
        await sendAdminOrderNotification({
          kind: 'Shirt + Monthly',
          customerName: name,
          customerEmail: email,
          amount,
          isRecurring: true,
          shirtName,
          shirtColor,
          shirtSize,
          stripeSessionId: session.id,
        });
      } catch (err: any) {
        console.error('[WH] admin notify failed:', String(err?.message || err).slice(0, 200));
      }

      // Step 9: Enroll into shirt_sponsor drip with no specific child/number.
      // The drip templates already branch on whether a child name is set, so
      // they'll render the generic "the child connected to your shirt" copy.
      try {
        await airtableAPICall(() =>
          fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}/${donorId}`,
            {
              method: 'PATCH',
              headers: getAirtableHeaders(),
              body: JSON.stringify({
                fields: {
                  DripPipeline: 'shirt_sponsor',
                  DripStage: 0,
                  // Drip kicks off 10 days from enrollment. See shirt-only
                  // branch for rationale.
                  DripNextSend: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
                  // DripChildName / DripShirtNumber left blank
                },
              }),
            }
          )
        );
        console.log('[WH] Enrolled in shirt_sponsor drip (no number yet)');
      } catch (err: any) {
        console.error('[WH] shirt_sponsor drip enrollment failed (non-fatal):', String(err?.message || err).slice(0, 200));
      }

      console.log('[Webhook] Successfully processed shirt + monthly:', {
        sessionId: session.id,
        donorId,
        donationId,
        shirt: `${shirtName} / ${shirtColor} / ${shirtSize}`,
        assigned: 'pending stockpile reconciliation',
      });

      return { donorId, donationId };

    } else if (isShirtOrder) {
      // --- SHIRT ORDER FLOW ---
      //
      // Stockpile model (May 2026 forward): we no longer assign a child or
      // shirt number at purchase time. Kevin pulls a pre-printed shirt that
      // matches the buyer's color+size from inventory, then reconciles the
      // shipped number into Fulfillment when the package goes out. The
      // buyer discovers their match by looking at the back of the shirt
      // when it arrives and visiting beanumber.org/[number].
      //
      // Everything below still happens — Fulfillment row, Donation, drip
      // enrollment, email — they just no longer carry a number or child.
      const shirtName = session.metadata?.shirt_name || 'Unknown';
      const shirtColor = session.metadata?.shirt_color || 'Unknown';
      const shirtSize = session.metadata?.shirt_size || 'Unknown';
      const shirtId = session.metadata?.shirt_id || 'unknown';

      console.log('[WH] S2: shirt-only flow (no assignment), shirt=' + shirtName);

      const donorId: string = await donorPromise;

      // Create Fulfillment record BEFORE the donation upsert.
      // The idempotency guard checks for an existing donation — if fulfillment
      // runs after the donation, a Stripe retry can skip it permanently.
      // Order # and Child Name stay blank; Kevin fills in the number that
      // physically shipped when he reconciles in Airtable.
      try {
        await createFulfillmentRecord({
          design: 'Number Tee',  // 2026 lineup: every shirt is the same design (4 colorways)
          shirtColor,
          shirtSize,
          buyerName: name,
          buyerEmail: email,
          address: address || null,
          orderDate: donationDate,
          stripeSessionId: session.id,
          itemIndex: 0,
        });
      } catch (err: any) {
        console.error('[WH] Fulfillment record failed (shirt-only):', String(err?.message || err).slice(0, 200));
      }

      // Step 3a: Create donation record tagged as shirt order. No child link
      // yet — that gets resolved manually when the shirt ships and the
      // buyer's number is known. Notes flag the order so Kevin can find
      // unreconciled shipments later.
      const assignmentNote = ' / Number assigned at shipment (stockpile fulfillment)';
      console.log('[WH] S3: upsert donation (shirt-only)');
      const donationId = await upsertDonation(paymentIntentId, {
        sessionId: session.id,
        customerId: stripeCustomerId,
        donorId,
        amount,
        currency,
        donationDate,
        isRecurring: false,
        subscriptionId: null,
        status,
        email,
        name,
        organization: organization || undefined,
        address,
        donationSource: 'Shirt Order',
        notes: `Shirt: ${shirtName} / ${shirtColor} / ${shirtSize}${assignmentNote}${session.metadata?.ref_code ? ` [Ref: ${session.metadata.ref_code}]` : ''}${session.metadata?.promo_code ? ` [Promo: ${session.metadata.promo_code} ${session.metadata.promo_percent_off || ''}%]` : ''}`,
        // childRecordId intentionally omitted — match not yet known
      });

      // Step 4a: Send shirt confirmation email. Generic copy — no number,
      // no child name. The match is revealed when the physical shirt
      // arrives and the buyer enters their number at beanumber.org.
      let emailStatus = 'Sent';
      try {
        await sendShirtConfirmationEmail({
          email,
          name,
          shirtName,
          shirtColor,
          shirtSize,
          amount,
        });
      } catch (error: any) {
        console.error('[Webhook] Failed to send shirt confirmation email:', error);
        emailStatus = 'Failed';
      }

      // Step 5a: Create communication record for shirt order.
      try {
        await createCommunicationRecord(donationId, donorId, {
          email,
          subject: 'Your shirt is being made right now.',
          body: `Shirt order (stockpile, number not yet assigned): ${shirtName} (${shirtColor}, ${shirtSize}) / $${amount.toFixed(2)}`,
          status: emailStatus,
          stripePaymentIntentId: paymentIntentId,
        });
      } catch (error) {
        console.error('[Webhook] Failed to create communication record:', error);
      }

      console.log('[Webhook] Successfully processed shirt order:', {
        sessionId: session.id,
        donorId,
        donationId,
        shirt: `${shirtName} / ${shirtColor} / ${shirtSize}`,
        assigned: 'pending stockpile reconciliation',
      });

      // Ping Kevin (email + SMS gateway) — non-fatal.
      console.log('[WH] S7: admin notify (shirt)');
      try {
        await sendAdminOrderNotification({
          kind: 'Shirt',
          customerName: name,
          customerEmail: email,
          amount,
          isRecurring: false,
          shirtName,
          shirtColor,
          shirtSize,
          stripeSessionId: session.id,
        });
      } catch (err: any) {
        console.error('[WH] admin notify failed:', String(err?.message || err).slice(0, 200));
      }

      // Step 8: Enroll shirt-only buyer into the nurture drip sequence.
      // The cron at /api/cron/drip picks them up and sends generic follow-up
      // emails over ~30 days nudging toward visiting their number and
      // sponsoring. Under the stockpile model, DripChildName / DripShirtNumber
      // stay blank — the drip templates already handle that case with
      // generic copy ("the child connected to your shirt") and fall back to
      // beanumber.org instead of a child-specific URL.
      //
      // Branch on session.metadata.sold_in_person to route market-booth
      // buyers (who have the shirt in hand) onto a different pipeline name
      // — 'shirt_nurture_inperson' — and a shorter first-email delay of 3
      // days instead of 10. The day-0 copy on the in-person variant says
      // "your shirt is in your hands" instead of "your shirt's in the mail."
      const isMarketSale = session.metadata?.sold_in_person === 'true';
      const dripPipelineName = isMarketSale ? 'shirt_nurture_inperson' : 'shirt_nurture';
      const dripDelayDays = isMarketSale ? 3 : 10;
      const dripNextSendDate = new Date(Date.now() + dripDelayDays * 86400000);
      const dripNextSendStr = dripNextSendDate.toISOString().split('T')[0];

      try {
        await airtableAPICall(() =>
          fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}/${donorId}`,
            {
              method: 'PATCH',
              headers: getAirtableHeaders(),
              body: JSON.stringify({
                fields: {
                  DripPipeline: dripPipelineName,
                  DripStage: 0,
                  DripNextSend: dripNextSendStr,
                  // DripChildName / DripShirtNumber left blank — match
                  // happens at unboxing/lookup, not at checkout
                },
              }),
            }
          )
        );
        console.log(`[WH] Enrolled in ${dripPipelineName} drip (no number yet), next send ${dripNextSendStr}`);
      } catch (err: any) {
        // Non-fatal — the purchase still succeeded even if drip enrollment fails
        console.error('[WH] Drip enrollment failed:', String(err?.message || err).slice(0, 200));
      }

      // Mirror to Postgres so the drip cron (which queries Postgres only)
      // can find this donor. Wrapped in mirrorToPostgres so a Postgres
      // failure logs without breaking the Airtable write or the Stripe
      // receipt. Email is the join key — mirrorDripFields updates by
      // lower(email) match.
      await mirrorToPostgres('drip-fields', async () => {
        await mirrorDripFields({
          email,
          dripPipeline: dripPipelineName,
          dripStage: 0,
          dripNextSend: dripNextSendDate,
        });
      });

      return { donorId, donationId };

    } else if (isPortalRepeat) {
      // --- SHOP YOUR NUMBER FLOW (memo §5) ---
      //
      // An active sponsor is reordering a shirt that ships stamped with
      // their EXISTING shirt number, not a newly-assigned one. The
      // sponsor-to-child relationship is already established; this is
      // just an additional physical product purchase.
      //
      // We skip: child assignment, new sponsorship creation, drip
      // enrollment, the lockbox/reveal flow.
      //
      // We do: update donor lifetime giving, create a Donation record
      // tagged 'Portal Repeat', create a Fulfillment row stamped with
      // the existing shirt number, send a brief reorder confirmation,
      // ping admin.
      const shirtName = session.metadata?.shirt_name || 'Unknown';
      const shirtColor = session.metadata?.shirt_color || 'Unknown';
      const shirtSize = session.metadata?.shirt_size || 'Unknown';
      const existingShirtNumber = parseInt(session.metadata?.existing_shirt_number || '0', 10);
      const childDisplayName = session.metadata?.child_display_name || '';
      const sponsorCode = session.metadata?.sponsor_code || '';

      console.log(
        `[WH] S2: portal-repeat flow, shirt=${shirtName}, #${existingShirtNumber}, sponsor=${sponsorCode}`
      );

      const donorId = await donorPromise;
      console.log('[WH] S3: donor resolved, id=' + donorId);

      // Fulfillment row BEFORE the donation upsert, same ordering reason
      // as the standard shirt flow (idempotency guard might short-circuit
      // a retry otherwise).
      if (existingShirtNumber > 0) {
        try {
          await createFulfillmentRecord({
            shirtNumber: existingShirtNumber,
            design: 'Number Tee',  // 2026 lineup: every shirt is the same design (4 colorways)
            shirtColor,
            shirtSize,
            buyerName: name,
            buyerEmail: email,
            address: address || null,
            childName: childDisplayName,
            orderDate: donationDate,
            stripeSessionId: session.id,
            itemIndex: 0,
            notes: `Portal reorder — sponsor ${sponsorCode} reordering with their existing #${existingShirtNumber}. Press that number on the back of the shirt below the main design (do NOT assign a new number).`,
          });
        } catch (err: any) {
          console.error('[WH] Fulfillment record failed (portal-repeat):', String(err?.message || err).slice(0, 200));
        }
      }

      console.log('[WH] S4: upsert donation (portal-repeat)');
      const donationId = await upsertDonation(paymentIntentId, {
        sessionId: session.id,
        customerId: stripeCustomerId,
        donorId,
        amount,
        currency,
        donationDate,
        isRecurring: false,
        subscriptionId: null,
        status,
        email,
        name,
        organization: organization || undefined,
        address,
        donationSource: 'Portal Repeat',
        notes: `Portal reorder: ${shirtName} / ${shirtColor} / ${shirtSize} / Re-using #${existingShirtNumber} (${childDisplayName})${session.metadata?.ref_code ? ` [Ref: ${session.metadata.ref_code}]` : ''}${session.metadata?.promo_code ? ` [Promo: ${session.metadata.promo_code} ${session.metadata.promo_percent_off || ''}%]` : ''}`,
      });

      let emailStatus = 'Sent';
      try {
        await sendShirtConfirmationEmail({
          email,
          name,
          shirtName,
          shirtColor,
          shirtSize,
          amount,
          isPortalRepeat: true,
          shirtNumber: existingShirtNumber,
          childDisplayName,
        });
      } catch (error: any) {
        console.error('[Webhook] Failed to send portal-repeat confirmation email:', error);
        emailStatus = 'Failed';
      }

      try {
        await createCommunicationRecord(donationId, donorId, {
          email,
          subject: `Your reorder is being made (#${existingShirtNumber}).`,
          body: `Portal reorder: ${shirtName} (${shirtColor}, ${shirtSize}) / $${amount.toFixed(2)} / Re-using #${existingShirtNumber} (${childDisplayName})`,
          status: emailStatus,
          stripePaymentIntentId: paymentIntentId,
        });
      } catch (error) {
        console.error('[Webhook] Failed to create communication record (portal-repeat):', error);
      }

      console.log('[Webhook] Successfully processed portal-repeat order:', {
        sessionId: session.id,
        donorId,
        donationId,
        shirt: `${shirtName} / ${shirtColor} / ${shirtSize}`,
        existingNumber: existingShirtNumber,
        sponsorCode,
      });

      try {
        await sendAdminOrderNotification({
          kind: 'Shirt',
          customerName: name,
          customerEmail: email,
          amount,
          isRecurring: false,
          shirtName,
          shirtColor,
          shirtSize,
          childDisplayName,
          shirtNumber: existingShirtNumber,
          stripeSessionId: session.id,
        });
      } catch (err: any) {
        console.error('[WH] admin notify failed (portal-repeat):', String(err?.message || err).slice(0, 200));
      }

      // Deliberately skip drip enrollment — they're already a sponsor.

      return { donorId, donationId, isPortalRepeat: true, existingShirtNumber };

    } else if (isMerchPurchase) {
      // --- NUMBER COLLECTION MERCH FLOW ---
      //
      // Active sponsor bought a hoodie / hat / sticker pack from the
      // /[number] page. The merch carries their child's shirt number.
      //
      // We deliberately skip Fulfillment row creation here — merch
      // volume is small and Kevin makes each piece by hand. The
      // admin notification email has everything needed to fulfill:
      // item, sponsor's number, size, ship-to address. We DO record
      // the Donation so retention/LTV reporting picks it up.
      const merchType = session.metadata?.merch_type || 'unknown';
      const merchName = session.metadata?.merch_name || 'Merch item';
      const shirtNumber = session.metadata?.shirt_number || '?';
      const size = session.metadata?.size || '';
      const sponsorCode = session.metadata?.sponsor_code || '';
      const childDisplayName = session.metadata?.child_display_name || '';

      console.log(
        `[WH] S2: merch flow, ${merchName}, #${shirtNumber}${size ? `, size ${size}` : ''}`
      );

      const donorId = await donorPromise;

      // Step 3: Donation record for accounting + LTV reporting. The
      // Donation Source 'Merch' isn't a singleSelect option yet, so the
      // VALID_SOURCES normalizer will route this to 'Website' and stash
      // the real label as a prefix on Donation Note. Once Kevin adds
      // 'Merch' as an Airtable option this flips to the real value
      // automatically.
      const donationId = await upsertDonation(paymentIntentId, {
        sessionId: session.id,
        customerId: stripeCustomerId,
        donorId,
        amount,
        currency,
        donationDate,
        isRecurring: false,
        subscriptionId: null,
        status,
        email,
        name,
        organization: organization || undefined,
        address,
        donationSource: 'Merch',
        notes: `Number Collection — ${merchName}${size ? ` (Size ${size})` : ''} stamped with #${shirtNumber}, connected to ${childDisplayName || 'sponsor kid'}. Sponsor ${sponsorCode}.`,
      });

      // Step 4: Confirmation email to the buyer.
      let emailStatus = 'Sent';
      try {
        await sendMerchConfirmationEmail({
          email,
          name,
          merchName,
          shirtNumber: String(shirtNumber),
          size,
          amount,
          childDisplayName,
        });
      } catch (err) {
        console.error('[WH] Failed to send merch confirmation email:', err);
        emailStatus = 'Failed';
      }

      // Step 5: Communication record (audit trail)
      try {
        await createCommunicationRecord(donationId, donorId, {
          email,
          subject: `Your ${merchName} order is being made.`,
          body: `Merch order: ${merchName}${size ? ` (${size})` : ''}, #${shirtNumber}, ${childDisplayName || ''} / $${amount.toFixed(2)}`,
          status: emailStatus,
          stripePaymentIntentId: paymentIntentId,
        });
      } catch (err) {
        console.error('[WH] Failed to create communication record (merch):', err);
      }

      // Step 6: Admin email — what Kevin needs to fulfill the order.
      console.log('[WH] S6: admin notify (merch)');
      try {
        const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'Kevin@beanumber.org';
        const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || 'kevin@beanumber.org';
        const shipAddr = address
          ? `${address.line1 || ''}${address.line2 ? `, ${address.line2}` : ''}, ${address.city || ''}, ${address.state || ''} ${address.postal_code || ''}`.replace(/^,\s*/, '')
          : '(no shipping address on file)';
        const adminHtml = `
          <p><strong>${name || 'unknown buyer'}</strong> just ordered a <strong>${merchName}</strong>${size ? ` (size ${size})` : ''} with <strong>#${shirtNumber}</strong> on it.</p>
          <p><strong>What to make:</strong> ${merchName}${size ? ` size ${size}` : ''}, press/embroider #${shirtNumber}.</p>
          <p><strong>Ship to:</strong><br>${name}<br>${shipAddr}</p>
          <p><strong>Sponsor:</strong> ${sponsorCode} (${childDisplayName || 'child'})<br><strong>Buyer email:</strong> ${email}</p>
          <p><strong>Paid:</strong> $${amount.toFixed(2)} (Stripe session ${session.id})</p>
        `;
        await sendEmail({
          to: { email: adminEmail, name: 'Kevin' },
          from: { email: fromEmail, name: 'BAN Orders' },
          subject: `Merch order: ${merchName} #${shirtNumber}${size ? ` (${size})` : ''}`,
          html: adminHtml,
        });
      } catch (err: any) {
        console.error('[WH] merch admin notify failed:', String(err?.message || err).slice(0, 200));
      }

      // No drip enrollment, no Sponsorship changes. The sponsor is
      // already in the relationship; this purchase deepens it but
      // doesn't change the relationship structure.

      return { donorId, donationId, isMerchPurchase: true, merchType, shirtNumber };

    } else if (isGiftSponsorship) {
      // --- GIFT SPONSORSHIP FLOW (memo §11) ---
      //
      // A gifter (the Stripe customer on this session) paid $25 to gift
      // a sponsorship to someone else. The recipient's identity comes in
      // via metadata. We:
      //  - Create the gifter as a Donor and book the $25 donation under them.
      //  - Assign the next available child to the RECIPIENT's email/name
      //    (the Child record's ShirtBuyer fields reflect the recipient
      //    because they're the future relationship owner — the gifter's
      //    identity stays on the Donation, not the Child).
      //  - Email the recipient a gift card with the assigned shirt number
      //    and a link to /children/[number]?gift=true&from=[gifter] so the
      //    reveal moment is preserved.
      //  - Email the gifter a confirmation/receipt.
      //  - No drip enrollment, no new sponsorship subscription. The
      //    recipient converts (if they choose) by clicking through to
      //    /[number] and using the SponsorButton from there.
      const recipientName = (session.metadata?.recipient_name || '').trim();
      const recipientEmail = (session.metadata?.recipient_email || '').trim().toLowerCase();
      const gifterName = (session.metadata?.gifter_name || '').trim() || name;
      const giftMessage = session.metadata?.gift_message || '';

      console.log(
        `[WH] S2: gift-sponsorship flow, gifter=${email}, recipient=${recipientEmail}`
      );

      if (!recipientEmail || !recipientName) {
        // Required fields missing — treat as a regular $25 donation so we
        // don't lose the money, but flag for manual fix.
        console.error('[WH] gift_sponsorship missing recipient info, falling back to donation', {
          sessionId: session.id,
        });
      }

      // Parallelize: gifter donor lookup + recipient's child assignment.
      let assignedChild: Awaited<ReturnType<typeof assignNextShirtChild>> = null;
      let donorId: string;
      try {
        const [donorResult, childResult] = await Promise.all([
          donorPromise,
          recipientEmail && recipientName
            ? assignNextShirtChild(recipientEmail, recipientName).catch(err => {
                console.error('[Webhook] Gift child assignment error:', err);
                return null;
              })
            : Promise.resolve(null),
        ]);
        donorId = donorResult;
        assignedChild = childResult;
      } catch (error) {
        throw error;
      }

      // Book the gifter's $25 donation. Source 'Gift Sponsorship' is not
      // (yet) an Airtable option — until Kevin adds it, the normalizer
      // falls back to 'Website' and prefixes '[Gift Sponsorship]' onto
      // the Donation Note, per trap 1.
      const assignmentNote = assignedChild
        ? ` / Assigned to #${assignedChild.shirtNumber} (${assignedChild.displayName})`
        : ' / No child assigned (out of stock or assignment failed)';
      const donationId = await upsertDonation(paymentIntentId, {
        sessionId: session.id,
        customerId: stripeCustomerId,
        donorId,
        amount,
        currency,
        donationDate,
        isRecurring: false,
        subscriptionId: null,
        status,
        email,
        name: gifterName,
        organization: organization || undefined,
        address,
        donationSource: 'Gift Sponsorship',
        notes:
          `Gift to ${recipientName || 'unknown'} <${recipientEmail || 'unknown'}>` +
          assignmentNote +
          (giftMessage ? ` / Message: ${giftMessage.slice(0, 200)}` : ''),
        childRecordId: assignedChild?.recordId,
      });

      // Email the recipient — the reveal hook.
      let recipientEmailStatus = 'Sent';
      if (recipientEmail && recipientName && assignedChild) {
        try {
          await sendGiftCardEmail({
            recipientEmail,
            recipientName,
            gifterName,
            giftMessage,
            shirtNumber: assignedChild.shirtNumber,
            childDisplayName: assignedChild.displayName,
          });
        } catch (err: any) {
          console.error('[Webhook] Gift card email failed:', String(err?.message || err).slice(0, 200));
          recipientEmailStatus = 'Failed';
        }
      } else {
        recipientEmailStatus = 'Skipped';
      }

      // Email the gifter — receipt + thanks.
      let gifterEmailStatus = 'Sent';
      try {
        await sendGifterConfirmationEmail({
          gifterEmail: email,
          gifterName,
          recipientName,
          recipientEmail,
          amount,
        });
      } catch (err: any) {
        console.error('[Webhook] Gifter confirmation failed:', String(err?.message || err).slice(0, 200));
        gifterEmailStatus = 'Failed';
      }

      // Communication record covers both emails as one transaction.
      try {
        await createCommunicationRecord(donationId, donorId, {
          email,
          subject: `Gift sponsorship → ${recipientEmail || 'unknown'} (#${assignedChild?.shirtNumber || '?'})`,
          body:
            `Gift sponsorship: gifter=${email} -> recipient=${recipientName} <${recipientEmail}> ` +
            `/ $${amount.toFixed(2)} ` +
            `/ Assigned #${assignedChild?.shirtNumber || 'none'} ${assignedChild?.displayName || ''} ` +
            `/ Recipient email: ${recipientEmailStatus} / Gifter email: ${gifterEmailStatus}`,
          status: recipientEmailStatus === 'Sent' ? 'Sent' : 'Failed',
          stripePaymentIntentId: paymentIntentId,
        });
      } catch (error) {
        console.error('[Webhook] Failed to create communication record (gift_sponsorship):', error);
      }

      console.log('[Webhook] Successfully processed gift sponsorship:', {
        sessionId: session.id,
        donorId,
        donationId,
        gifter: email,
        recipient: recipientEmail,
        assignedShirtNumber: assignedChild?.shirtNumber || null,
      });

      // Admin ping — Kevin sees a gift go out same as any other order.
      try {
        await sendAdminOrderNotification({
          kind: 'Sponsorship',
          customerName: gifterName + ' (gift to ' + recipientName + ')',
          customerEmail: email,
          amount,
          isRecurring: false,
          childDisplayName: assignedChild?.displayName,
          shirtNumber: assignedChild?.shirtNumber,
          stripeSessionId: session.id,
        });
      } catch (err: any) {
        console.error('[WH] admin notify failed (gift):', String(err?.message || err).slice(0, 200));
      }

      return { donorId, donationId, isGiftSponsorship: true, assignedChild };

    } else {
      // --- STANDARD DONATION FLOW ---
      console.log('[WH] S2: donation flow');
      const donorId = await donorPromise;
      console.log('[WH] S3: donor resolved, id=' + donorId);

      // Step 2b: Create donation record (idempotent)
      console.log('[WH] S4: upsert donation (standard)');
      const donationId = await upsertDonation(paymentIntentId, {
        sessionId: session.id,
        customerId: stripeCustomerId,
        donorId,
        amount,
        currency,
        donationDate,
        isRecurring,
        subscriptionId,
        status,
        email,
        name,
        organization: organization || undefined,
        address,
      });

      // Step 3b: Send thank-you email
      let emailStatus = 'Sent';
      try {
        await sendThankYouEmail({
          email,
          name,
          amount,
          currency,
          isRecurring,
          donationDate,
        });
      } catch (error: any) {
        console.error('[Webhook] Failed to send email:', error);
        emailStatus = 'Failed';
      }

      // Step 4b: Create communication record
      try {
        await createCommunicationRecord(donationId, donorId, {
          email,
          subject: isRecurring ? 'You just became a monthly sponsor.' : 'Thank you. This matters.',
          body: `${isRecurring ? 'Monthly sponsor' : 'One-time gift'} of $${amount.toFixed(2)}.`,
          status: emailStatus,
          stripePaymentIntentId: paymentIntentId,
        });
      } catch (error) {
        console.error('[Webhook] Failed to create communication record:', error);
      }

      console.log('[Webhook] Successfully processed donation:', {
        sessionId: session.id,
        donorId,
        donationId,
      });

      // Ping Kevin (email + SMS gateway) — non-fatal.
      console.log('[WH] S5: admin notify (donation)');
      try {
        await sendAdminOrderNotification({
          kind: 'Donation',
          customerName: name,
          customerEmail: email,
          amount,
          isRecurring,
          stripeSessionId: session.id,
        });
      } catch (err: any) {
        console.error('[WH] admin notify failed:', String(err?.message || err).slice(0, 200));
      }

      // Step 9: Enroll one-time donors into donor_convert drip.
      // Monthly donors (isRecurring) skip this — they're already committed.
      if (!isRecurring && donorId) {
        try {
          const dripStartDate = new Date();
          dripStartDate.setUTCDate(dripStartDate.getUTCDate() + 5);
          const dripNextSend = dripStartDate.toISOString().split('T')[0];

          await airtableAPICall(() =>
            fetch(
              `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}/${donorId}`,
              {
                method: 'PATCH',
                headers: getAirtableHeaders(),
                body: JSON.stringify({
                  fields: {
                    DripPipeline: 'donor_convert',
                    DripStage: 0,
                    DripNextSend: dripNextSend,
                  },
                }),
              }
            )
          );
          console.log('[WH] Enrolled in donor_convert drip, next send:', dripNextSend);
        } catch (err: any) {
          console.error('[WH] donor_convert drip enrollment failed:', String(err?.message || err).slice(0, 200));
        }
      }

      return { donorId, donationId };
    }
  } catch (error: any) {
    console.error('[WH] CRASH msg:', String(error?.message || error).slice(0, 300));
    console.error('[WH] CRASH stack:', String(error?.stack || '').slice(0, 500));
    throw error;
  } finally {
    // The handler has SEVEN distinct return branches inside the try
    // (cart, shirt, shirt+monthly, sponsorship, portal_repeat, merch,
    // gift, donation) and a throw path. Awaiting the shipping refund
    // in a finally block covers all of them — no matter which branch
    // fires or whether the main flow throws, the refund promise
    // settles before this function returns control to Vercel, so
    // serverless can't cut the refund off mid-flight.
    //
    // .catch on the await is defense-in-depth — the helper already
    // swallows its own errors, but if a bug ever escapes, the finally
    // shouldn't mask the primary error/return with a rejection.
    await shippingRefundPromise.catch(() => {});
  }
}

// Verify webhook signature
async function verifyWebhookSignature(
  request: NextRequest,
  stripe: Stripe
): Promise<Stripe.Event | null> {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    console.error('[Webhook] No signature found');
    return null;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET is not set');
    return null;
  }

  try {
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    return event;
  } catch (err: any) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return null;
  }
}

/**
 * Handle customer.subscription.deleted.
 *
 * A sponsor canceled (or their subscription ended). We find the Sponsorship
 * record by StripeSubscriptionID and mark it Ended + AuthStatus=Inactive so
 * they can't log in to the portal anymore and they drop out of active-sponsor
 * counts.
 *
 * ChildRevealedAt is left alone — they already met their child, and historical
 * reveal state should be preserved for auditability even after cancellation.
 */
async function handleSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void> {
  const subscriptionId = subscription.id;

  // POSTGRES FIRST. Source of truth — flip the sponsorship to ended regardless
  // of Airtable health so cancellations always land.
  await mirrorToPostgres(
    `sub.deleted ${subscriptionId}`,
    () => mirrorSubscriptionDeleted(subscriptionId)
  );

  // AIRTABLE BEST-EFFORT.
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn('[WH] Subscription canceled: missing Airtable creds, skipping Airtable mirror (non-fatal)');
    return;
  }

  try {
    // Find the Sponsorship row by StripeSubscriptionID
    const formula = `{StripeSubscriptionID} = "${subscriptionId}"`;
    const searchResponse = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
        { headers: getAirtableHeaders() }
      )
    );

    if (!searchResponse.ok) {
      const errText = await searchResponse.text();
      console.error('[WH] Failed to look up sponsorship for canceled subscription (non-fatal):', subscriptionId, errText.slice(0, 300));
      return;
    }

    const searchData = await searchResponse.json();
    const records = searchData.records ?? [];

    if (records.length === 0) {
      // Not every subscription cancellation is a sponsor — could be an old
      // recurring donor with no sponsorship row. Log and move on.
      console.log('[Webhook] No sponsorship found for canceled subscription:', subscriptionId);
      return;
    }

    // Defensive: if we somehow have duplicates, update them all
    for (const record of records) {
      const updateResponse = await airtableAPICall(() =>
        fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SPONSORSHIPS_TABLE}/${record.id}`,
          {
            method: 'PATCH',
            headers: getAirtableHeaders(),
            body: JSON.stringify({
              fields: {
                Status: 'Ended',
                AuthStatus: 'Inactive',
                VisibleToSponsor: false,
              },
            }),
          }
        )
      );

      if (updateResponse.ok) {
        console.log('[Webhook] Sponsorship marked Ended:', record.id, 'subscription:', subscriptionId);
      } else {
        const errText = await updateResponse.text();
        console.error('[Webhook] Failed to mark sponsorship Ended (non-fatal):', record.id, errText.slice(0, 300));
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WH] Airtable subscription-canceled mirror failed (non-fatal, Postgres has the cancellation):', message.slice(0, 300));
  }
}

/**
 * Handle charge.refunded.
 *
 * Stripe fires this on full and partial refunds. We find the Donation row by
 * the charge's payment_intent and flip Payment Status to Refunded. For partial
 * refunds we leave the original Donation Amount in place and append a note
 * with the refunded amount — keeps the paper trail intact.
 */
async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!paymentIntentId) {
    console.error('[Webhook] charge.refunded event has no payment_intent:', charge.id);
    return;
  }

  const amountRefundedCents = charge.amount_refunded ?? 0;
  const amountTotalCents = charge.amount ?? 0;
  const isFullRefund = amountRefundedCents >= amountTotalCents;
  const refundedDollars = (amountRefundedCents / 100).toFixed(2);

  // POSTGRES FIRST. Source of truth — record the refund regardless of
  // Airtable health so the donation status always reflects reality.
  await mirrorToPostgres(
    `refund ${paymentIntentId}`,
    () =>
      mirrorRefund({
        stripePaymentIntentId: paymentIntentId,
        partial: !isFullRefund,
        refundedAmount: amountRefundedCents / 100,
        refundedAt: new Date(),
      })
  );

  // AIRTABLE BEST-EFFORT.
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn('[WH] Charge refunded: missing Airtable creds, skipping Airtable mirror (non-fatal)');
    return;
  }

  try {
    // Find the Donation row by Stripe Payment Intent ID
    const formula = `{Stripe Payment Intent ID} = "${paymentIntentId}"`;
    const searchResponse = await airtableAPICall(() =>
      fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}?filterByFormula=${encodeURIComponent(formula)}`,
        { headers: getAirtableHeaders() }
      )
    );

    if (!searchResponse.ok) {
      const errText = await searchResponse.text();
      console.error('[WH] Failed to look up donation for refunded charge (non-fatal):', paymentIntentId, errText.slice(0, 300));
      return;
    }

    const searchData = await searchResponse.json();
    const records = searchData.records ?? [];

    if (records.length === 0) {
      // This can legitimately happen if the charge was from a test or from
      // before we started recording donations. Log and move on.
      console.log('[Webhook] No donation found for refunded charge, payment_intent:', paymentIntentId);
      return;
    }

    for (const record of records) {
      const existingNote = (record.fields?.['Donation Note'] as string | undefined) ?? '';
      const refundLabel = isFullRefund
        ? `[Refunded in full on ${new Date().toISOString().split('T')[0]}]`
        : `[Partially refunded $${refundedDollars} on ${new Date().toISOString().split('T')[0]}]`;
      const mergedNote = existingNote ? `${existingNote}\n${refundLabel}` : refundLabel;

      const updateResponse = await airtableAPICall(() =>
        fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONATIONS_TABLE}/${record.id}`,
          {
            method: 'PATCH',
            headers: getAirtableHeaders(),
            body: JSON.stringify({
              fields: {
                'Payment Status': 'Refunded',
                'Donation Note': mergedNote,
              },
            }),
          }
        )
      );

      if (updateResponse.ok) {
        console.log(
          '[Webhook] Donation marked Refunded:',
          record.id,
          isFullRefund ? '(full)' : `(partial $${refundedDollars})`
        );
      } else {
        const errText = await updateResponse.text();
        console.error('[Webhook] Failed to mark donation Refunded (non-fatal):', record.id, errText.slice(0, 300));
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WH] Airtable refund mirror failed (non-fatal, Postgres has the refund):', message.slice(0, 300));
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate environment variables (non-blocking for webhook)
    validateWebhookEnvVars();
    
    const stripe = await getStripe();
    const event = await verifyWebhookSignature(request, stripe);

    if (!event) {
      return NextResponse.json(
        { error: 'Webhook signature verification failed' },
        { status: 400 }
      );
    }

    console.log('[Webhook] Received event:', event.type);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[Webhook] Subscription event:', event.type, subscription.id);

        // When a subscription is created, the buyer has converted — clear any
        // active shirt_nurture drip so they stop getting conversion emails.
        if (event.type === 'customer.subscription.created') {
          try {
            // Look up donor by Stripe customer ID
            const custId = typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer?.id || '';
            if (custId && AIRTABLE_API_KEY && AIRTABLE_BASE_ID) {
              const formula = `{Stripe Customer ID} = "${custId}"`;
              const lookupRes = await fetch(
                `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`,
                { headers: getAirtableHeaders() }
              );
              if (lookupRes.ok) {
                const lookupData = await lookupRes.json();
                const donorRecord = lookupData.records?.[0];
                if (donorRecord) {
                  // Determine the target pipeline based on the subscription
                  // type. Sponsorship subs (order_type='sponsorship') go to
                  // sponsor_onboard; monthly donations (no order_type)
                  // go to monthly_donor.
                  const subMeta = subscription.metadata || {};
                  const isSponsorship = subMeta.order_type === 'sponsorship';
                  const targetPipeline = isSponsorship ? 'sponsor_onboard' : 'monthly_donor';

                  const currentPipeline = donorRecord.fields?.DripPipeline || '';

                  // Drip-drift fix (June 2026): the old rule was &ldquo;if the
                  // donor is already on shirt_sponsor or shirt_nurture,
                  // leave them there.&rdquo; That stranded converting buyers
                  // (Christina&rsquo;s case): they bought a shirt, entered the
                  // shirt_nurture drip, met their kid, sponsored — but
                  // kept getting &ldquo;have you sponsored yet?&rdquo; nudges
                  // because the webhook never moved them. The fix: when
                  // a sponsorship subscription is created, ALWAYS move the
                  // donor to sponsor_onboard regardless of where they
                  // started. shirt_sponsor + shirt_nurture are conversion
                  // drips with a single goal; once the conversion happens,
                  // they&rsquo;re done.
                  //
                  // The remaining preserve-don&rsquo;t-overwrite case is when
                  // a NON-sponsorship subscription lands (monthly donation
                  // from /donate) on a donor already in a shirt drip —
                  // their shirt journey is still relevant, the monthly
                  // donation is a side-channel relationship.
                  const isInShirtDrip =
                    currentPipeline === 'shirt_sponsor' ||
                    currentPipeline === 'shirt_nurture';
                  if (isInShirtDrip && !isSponsorship) {
                    console.log(`[WH] Donor in ${currentPipeline} + non-sponsorship sub created, leaving drip alone`);
                  } else {
                    const dripStartDate = new Date();
                    dripStartDate.setUTCDate(dripStartDate.getUTCDate() + 3);
                    const dripNextSend = dripStartDate.toISOString().split('T')[0];

                    await fetch(
                      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}/${donorRecord.id}`,
                      {
                        method: 'PATCH',
                        headers: getAirtableHeaders(),
                        body: JSON.stringify({
                          fields: {
                            DripPipeline: targetPipeline,
                            DripStage: 0,
                            DripNextSend: dripNextSend,
                            // Keep existing DripChildName/DripShirtNumber if set
                          },
                        }),
                      }
                    );
                    if (isInShirtDrip) {
                      console.log(`[WH] Migrated ${currentPipeline} → ${targetPipeline}:`, donorRecord.id);
                    } else {
                      console.log(`[WH] Enrolled in ${targetPipeline} drip:`, donorRecord.id);
                    }
                  }
                }
              }
            }
          } catch (err: any) {
            console.error('[WH] sponsor_onboard drip enrollment failed (non-fatal):', String(err?.message || err).slice(0, 200));
          }
        }

        // Write/update the Subscriptions table so Airtable mirrors Stripe state.
        // This was missing entirely before — the table was always empty.
        if (AIRTABLE_API_KEY && AIRTABLE_BASE_ID) {
          try {
            const subId = subscription.id;
            const subStatus = subscription.status; // active, past_due, canceled, etc.
            const custId = typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer?.id || '';

            // Check if a record already exists for this subscription
            const existFormula = `{Subscription ID} = "${subId}"`;
            const existRes = await airtableAPICall(() =>
              fetch(
                `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SUBSCRIPTIONS_TABLE}?filterByFormula=${encodeURIComponent(existFormula)}&maxRecords=1`,
                { headers: getAirtableHeaders() }
              )
            );

            // Find the linked donor record for the Donor field
            let donorRecordId: string | null = null;
            if (custId) {
              const donorFormula = `{Stripe Customer ID} = "${custId}"`;
              const donorRes = await airtableAPICall(() =>
                fetch(
                  `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_DONORS_TABLE}?filterByFormula=${encodeURIComponent(donorFormula)}&maxRecords=1`,
                  { headers: getAirtableHeaders() }
                )
              );
              if (donorRes.ok) {
                const donorData = await donorRes.json();
                donorRecordId = donorData.records?.[0]?.id || null;
              }
            }

            // Cast to any for fields that vary across Stripe API versions
            const subAny = subscription as any;
            const amount = subAny.items?.data?.[0]?.price?.unit_amount
              ? subAny.items.data[0].price.unit_amount / 100
              : 25;
            const periodEnd = subAny.current_period_end
              ? new Date(subAny.current_period_end * 1000).toISOString().split('T')[0]
              : undefined;
            const startDate = subAny.start_date
              ? new Date(subAny.start_date * 1000).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];

            const subFields: Record<string, unknown> = {
              'Subscription ID': subId,
              Status: subStatus,
              Amount: amount,
              Frequency: 'Monthly',
            };
            if (periodEnd) subFields['Current Period End'] = periodEnd;
            if (donorRecordId) subFields.Donor = [donorRecordId];

            if (existRes.ok) {
              const existData = await existRes.json();
              if (existData.records?.length > 0) {
                // Update existing record
                const recId = existData.records[0].id;
                await airtableAPICall(() =>
                  fetch(
                    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SUBSCRIPTIONS_TABLE}/${recId}`,
                    {
                      method: 'PATCH',
                      headers: getAirtableHeaders(),
                      body: JSON.stringify({ fields: subFields }),
                    }
                  )
                );
                console.log('[WH] Updated Subscriptions record:', recId, subId, subStatus);
              } else {
                // Create new record
                subFields['Start Date'] = startDate;
                await airtableAPICall(() =>
                  fetch(
                    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_SUBSCRIPTIONS_TABLE}`,
                    {
                      method: 'POST',
                      headers: getAirtableHeaders(),
                      body: JSON.stringify({ fields: subFields }),
                    }
                  )
                );
                console.log('[WH] Created Subscriptions record for:', subId, subStatus);
              }
            }
          } catch (err: any) {
            console.error('[WH] Subscriptions table write failed (non-fatal):', String(err?.message || err).slice(0, 200));
          }
        }

        // Dual-write to Postgres: shadow the Subscriptions table and
        // any drip-pipeline changes from the .created branch above.
        {
          const custIdMirror =
            typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer?.id || '';
          const subAnyM = subscription as any;
          const amountM = subAnyM.items?.data?.[0]?.price?.unit_amount
            ? subAnyM.items.data[0].price.unit_amount / 100
            : 25;
          const periodEndM = subAnyM.current_period_end
            ? new Date(subAnyM.current_period_end * 1000)
            : null;
          const startDateM = subAnyM.start_date
            ? new Date(subAnyM.start_date * 1000)
            : new Date();

          // Resolve donor email — Stripe customer.email is the
          // canonical source; if the bridge can&rsquo;t find a donor by
          // customer id it&rsquo;ll fall back to email or stub-create.
          let donorEmailMirror = '';
          try {
            const stripeM = await getStripe();
            const customer = custIdMirror
              ? await stripeM.customers.retrieve(custIdMirror)
              : null;
            if (customer && !('deleted' in customer && customer.deleted)) {
              donorEmailMirror =
                (customer as Stripe.Customer).email || '';
            }
          } catch (e) {
            console.warn('[WH] customer lookup for pg mirror failed:', e);
          }

          await mirrorToPostgres(
            `subscription ${subscription.id}`,
            () =>
              mirrorSubscription({
                stripeSubscriptionId: subscription.id,
                stripeCustomerId: custIdMirror,
                donorEmail: donorEmailMirror,
                status: subscription.status,
                amount: amountM,
                frequency: 'monthly',
                startDate: startDateM,
                currentPeriodEnd: periodEndM,
              })
          );

          // Mirror drip-field updates for the .created branch.
          if (event.type === 'customer.subscription.created' && donorEmailMirror) {
            const subMetaM = subscription.metadata || {};
            const isSponsorshipM = subMetaM.order_type === 'sponsorship';
            const targetPipelineM = isSponsorshipM
              ? 'sponsor_onboard'
              : 'monthly_donor';
            const dripStartM = new Date();
            dripStartM.setUTCDate(dripStartM.getUTCDate() + 3);
            await mirrorToPostgres(
              `drip ${donorEmailMirror}`,
              () =>
                mirrorDripFields({
                  email: donorEmailMirror,
                  dripPipeline: targetPipelineM,
                  dripStage: 0,
                  dripNextSend: dripStartM,
                })
            );
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[Webhook] Subscription canceled:', subscription.id);
        await handleSubscriptionCanceled(subscription);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        console.log('[Webhook] Charge refunded:', charge.id, 'payment_intent:', charge.payment_intent);
        await handleChargeRefunded(charge);
        break;
      }

      case 'invoice.payment_succeeded': {
        // Cast to any to access all invoice properties (Stripe types can be restrictive)
        const invoice = event.data.object as Record<string, any>;
        console.log('[Webhook] Invoice payment succeeded:', invoice.id);

        // Import the recurring payment tool dynamically to avoid circular deps
        const { processRecurringPaymentTool } = await import('@/lib/tools');

        // Process recurring subscription payments
        const result = await processRecurringPaymentTool({
          invoiceId: invoice.id || '',
          subscriptionId: (typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id) || '',
          customerId: (typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id) || '',
          email: invoice.customer_email || '',
          name: invoice.customer_name || 'Supporter',
          amountCents: invoice.amount_paid || 0,
          currency: invoice.currency || 'usd',
          paymentDate: new Date((invoice.created || Date.now() / 1000) * 1000).toISOString(),
          billingReason: invoice.billing_reason || 'unknown',
        });

        if (result.success) {
          if (result.data?.skipped) {
            console.log('[Webhook] Invoice skipped:', result.data.skipReason);
          } else {
            console.log('[Webhook] Recurring payment processed:', {
              invoiceId: invoice.id,
              donationId: result.data?.donationId,
              emailSent: result.data?.emailSent,
            });
          }
        } else {
          console.error('[Webhook] Failed to process recurring payment:', result.error);
        }
        break;
      }

      default:
        console.log('[Webhook] Unhandled event type:', event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('[WH] POST-FAIL msg:', String(error?.message || error).slice(0, 300));
    console.error('[WH] POST-FAIL stack:', String(error?.stack || '').slice(0, 500));
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
