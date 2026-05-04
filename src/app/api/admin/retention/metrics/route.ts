import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function getStripe() {
  const StripeModule = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set');
  return new StripeModule(secretKey, { apiVersion: '2025-12-15.clover' });
}

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CHILDREN_TABLE = process.env.AIRTABLE_CHILDREN_TABLE || 'Children';
const AIRTABLE_DONATIONS_TABLE = process.env.AIRTABLE_DONATIONS_TABLE || 'Donations';

function verifyAdminToken(request: NextRequest): boolean {
  const adminToken = process.env.ADMIN_API_TOKEN;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminToken && !adminPassword) return false;
  const requestToken =
    request.headers.get('X-Admin-Token') ||
    request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  return requestToken === adminToken || (!!adminPassword && requestToken === adminPassword);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CohortRow {
  /** ISO month label, e.g. "2026-03" */
  cohort: string;
  /** How many sponsors started their first paid month in this cohort */
  startSize: number;
  /**
   * Retention by month-offset. counts[0] === startSize.
   * counts[n] is "how many are still active n months later".
   * Open months (haven't elapsed yet) are null.
   */
  counts: (number | null)[];
}

interface ActivationRow {
  /** ISO month label of the shirt purchase */
  cohort: string;
  shirtsPurchased: number;
  /** Of those shirts, how many buyers started a subscription within 30 days */
  converted30d: number | null;
  /** Within 60 days — null if month isn't old enough yet */
  converted60d: number | null;
}

interface MrrRow {
  month: string;
  mrrCents: number;
  activeSubscribers: number;
  newSubscribers: number;
  churnedSubscribers: number;
}

interface StoryCoverage {
  totalChildren: number;
  childrenWithAnyConnection: number;
  childrenWithActiveSponsor: number;
  childrenWithNoConnection: number;
  maxConnectionsOnOneChild: number;
  distribution: { bucket: string; children: number }[];
}

interface MetricsResponse {
  generatedAt: string;
  dataState: 'empty' | 'partial' | 'ready';
  totals: {
    shirtsAllTime: number;
    subscriptionsAllTime: number;
    activeSubscribers: number;
    mrrCents: number;
    mrrUsd: number;
  };
  activation: ActivationRow[];
  retention: CohortRow[];
  mrrByMonth: MrrRow[];
  storyCoverage: StoryCoverage;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Stripe fetch helpers (paginated, full-history)
// ---------------------------------------------------------------------------

async function fetchAllSubscriptions(stripe: Stripe): Promise<Stripe.Subscription[]> {
  const all: Stripe.Subscription[] = [];
  // status: 'all' includes canceled, incomplete, past_due, etc. — we need them
  // all to compute retention curves accurately. Expand the customer so we
  // have emails available for activation matching (see computeActivation).
  for await (const sub of stripe.subscriptions.list({
    status: 'all',
    limit: 100,
    expand: ['data.customer'],
  })) {
    all.push(sub);
  }
  return all;
}

/**
 * Pulls the email off a (possibly expanded) Stripe customer reference.
 * Returns lowercased string or null.
 */
function customerEmail(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
  if (!customer || typeof customer === 'string') return null;
  if ('deleted' in customer && customer.deleted) return null;
  const c = customer as Stripe.Customer;
  return c.email ? c.email.toLowerCase() : null;
}

async function fetchShirtCheckouts(stripe: Stripe): Promise<Stripe.Checkout.Session[]> {
  // We need completed shirt checkouts. Stripe doesn't let us filter on metadata
  // at list time, so pull everything completed and filter client-side.
  const all: Stripe.Checkout.Session[] = [];
  for await (const session of stripe.checkout.sessions.list({ limit: 100 })) {
    if (session.status !== 'complete') continue;
    if (session.metadata?.order_type !== 'shirt') continue;
    all.push(session);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Airtable helpers
// ---------------------------------------------------------------------------

async function airtableList<T>(endpoint: string): Promise<T[]> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return [];
  const all: T[] = [];
  let offset: string | undefined = undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}${endpoint}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[retention/metrics] Airtable error', res.status, await res.text().catch(() => ''));
      return all;
    }
    const data = (await res.json()) as { records: T[]; offset?: string };
    all.push(...data.records);
    offset = data.offset;
  } while (offset);
  return all;
}

interface AirtableDonationRecord {
  id: string;
  fields: {
    'Stripe Checkout Session ID'?: string;
    Amount?: number;
    'Donation Type'?: string;
    Status?: string;
    Child?: string[];
    CreatedTime?: string;
    Created?: string;
  };
  createdTime: string;
}

interface AirtableChildRecord {
  id: string;
  fields: {
    ChildID?: string;
    DisplayName?: string;
    FirstName?: string;
    ShirtNumber?: number;
    Status?: string;
    ReservedForAuction?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Metric computation
// ---------------------------------------------------------------------------

function monthKey(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d * 1000) : d;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return monthKey(d);
}

/**
 * Activation = shirt buyers who went on to start a subscription.
 *
 * Three-tier attribution, in order of reliability:
 *
 *   1. Deterministic: subscription.metadata.referring_shirt_session_id ==
 *      shirt_session.id. Set when the sponsor arrives via the shirt success
 *      page (we thread the id through the URL → checkout body → metadata).
 *      100% accurate when present.
 *
 *   2. Stripe customer id match. Same customer who bought the shirt later
 *      subscribed. Breaks when the shirt was bought as a guest OR when
 *      Stripe created a new customer for the subscription (different email,
 *      same human).
 *
 *   3. Email match. Lowercased customer_details.email on the shirt session
 *      == email on the subscription's expanded customer. Catches cross-device
 *      returns where the same email was used but Stripe didn't reuse the
 *      customer record.
 *
 * For each shirt session we take the EARLIEST subscription that matches via
 * any tier. That lets a single sponsor be attributed to their shirt even if
 * they later started additional subscriptions.
 */
function computeActivation(
  shirtSessions: Stripe.Checkout.Session[],
  subscriptions: Stripe.Subscription[]
): ActivationRow[] {
  // Tier 1: session id → earliest matching subscription start
  const subStartByShirtSession = new Map<string, number>();
  // Tier 2: customer id → earliest subscription start
  const subStartByCustomer = new Map<string, number>();
  // Tier 3: email (lowercased) → earliest subscription start
  const subStartByEmail = new Map<string, number>();

  for (const sub of subscriptions) {
    const created = sub.created;

    const sessionRef = sub.metadata?.referring_shirt_session_id;
    if (sessionRef) {
      const prev = subStartByShirtSession.get(sessionRef);
      if (!prev || created < prev) subStartByShirtSession.set(sessionRef, created);
    }

    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    if (customerId) {
      const prev = subStartByCustomer.get(customerId);
      if (!prev || created < prev) subStartByCustomer.set(customerId, created);
    }

    const email = customerEmail(sub.customer);
    if (email) {
      const prev = subStartByEmail.get(email);
      if (!prev || created < prev) subStartByEmail.set(email, created);
    }
  }

  // Cohort by shirt-purchase month
  const byCohort = new Map<
    string,
    { shirts: number; conv30: number; conv60: number; purchaseTimes: number[] }
  >();

  for (const session of shirtSessions) {
    if (!session.created) continue;
    const cohort = monthKey(session.created);
    const row = byCohort.get(cohort) || { shirts: 0, conv30: 0, conv60: 0, purchaseTimes: [] };
    row.shirts += 1;
    row.purchaseTimes.push(session.created);

    // Three-tier lookup. Take the earliest match across tiers so we don't
    // penalize a legitimate match if the metadata breadcrumb is missing.
    const candidates: number[] = [];
    const deterministic = subStartByShirtSession.get(session.id);
    if (deterministic) candidates.push(deterministic);

    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (customerId) {
      const byCust = subStartByCustomer.get(customerId);
      if (byCust) candidates.push(byCust);
    }

    const sessionEmail = session.customer_details?.email?.toLowerCase();
    if (sessionEmail) {
      const byEmail = subStartByEmail.get(sessionEmail);
      if (byEmail) candidates.push(byEmail);
    }

    // Best match = earliest subscription that started AFTER the shirt
    // purchase. We exclude subs that existed before the shirt (those are
    // pre-existing sponsors, not new activations).
    const afterShirt = candidates.filter(t => t >= session.created);
    if (afterShirt.length > 0) {
      const subStart = Math.min(...afterShirt);
      const daysToConvert = (subStart - session.created) / 86400;
      if (daysToConvert <= 30) row.conv30 += 1;
      if (daysToConvert <= 60) row.conv60 += 1;
    }
    byCohort.set(cohort, row);
  }

  const nowSecs = Math.floor(Date.now() / 1000);

  return [...byCohort.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([cohort, row]) => {
      // If the cohort month is less than 30 days old on average, report null
      // for conv30 (avoid showing misleading partial data).
      const avgPurchase = row.purchaseTimes.reduce((s, t) => s + t, 0) / row.purchaseTimes.length;
      const ageDays = (nowSecs - avgPurchase) / 86400;
      return {
        cohort,
        shirtsPurchased: row.shirts,
        converted30d: ageDays >= 30 ? row.conv30 : null,
        converted60d: ageDays >= 60 ? row.conv60 : null,
      };
    });
}

/**
 * Classic subscription cohort retention.
 * For each cohort month C, for each offset n in 0..MAX,
 * count subscriptions that were still "active-equivalent" at C+n months.
 *
 * "Active at offset n" means: the subscription was created in or before
 * C+n and is either still active now, or was canceled/ended at some point
 * after C+n. We use canceled_at (or ended_at) as the end of life; a null
 * canceled_at with status != 'canceled' means still alive.
 */
function computeRetention(subscriptions: Stripe.Subscription[]): CohortRow[] {
  const MAX_OFFSET = 6;
  const nowKey = monthKey(new Date());

  const byCohort = new Map<string, Stripe.Subscription[]>();
  for (const sub of subscriptions) {
    // Ignore incompletes — they never actually started.
    if (sub.status === 'incomplete' || sub.status === 'incomplete_expired') continue;
    const cohort = monthKey(sub.created);
    const list = byCohort.get(cohort) || [];
    list.push(sub);
    byCohort.set(cohort, list);
  }

  return [...byCohort.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([cohort, subs]) => {
      const counts: (number | null)[] = [];
      const maxElapsed = monthsBetween(cohort, nowKey);
      for (let offset = 0; offset <= MAX_OFFSET; offset++) {
        if (offset > maxElapsed) {
          counts.push(null); // month hasn't happened yet
          continue;
        }
        let alive = 0;
        for (const sub of subs) {
          // Determine effective end month
          const endedSecs = sub.canceled_at || sub.ended_at || null;
          const endedKey = endedSecs ? monthKey(endedSecs) : null;
          // Target month = cohort + offset
          const [y, m] = cohort.split('-').map(Number);
          const target = new Date(Date.UTC(y, m - 1 + offset, 1));
          const targetKey = monthKey(target);
          if (!endedKey || monthsBetween(targetKey, endedKey) > 0 || (endedKey === targetKey && !endedSecs)) {
            alive += 1;
          } else if (endedKey && monthsBetween(targetKey, endedKey) >= 0) {
            // Subscription was still active during target month (ended in target month or later)
            // Only count if ended strictly after target month starts
            // (We treat the subscription as "alive at offset n" if it was
            // present during any part of that month.)
            if (monthsBetween(targetKey, endedKey) > 0) alive += 1;
          }
        }
        counts.push(alive);
      }
      return { cohort, startSize: subs.length, counts };
    });
}

/**
 * Month-over-month MRR, plus new/churned subscriber counts per month.
 * MRR is expressed in the subscription's effective monthly amount.
 */
function computeMrr(subscriptions: Stripe.Subscription[]): MrrRow[] {
  const rows = new Map<string, MrrRow>();

  // Seed the last 12 months so empty months show up as 0 (not missing)
  for (let i = 11; i >= 0; i--) {
    const m = monthsAgo(i);
    rows.set(m, { month: m, mrrCents: 0, activeSubscribers: 0, newSubscribers: 0, churnedSubscribers: 0 });
  }

  function subscriptionMonthlyCents(sub: Stripe.Subscription): number {
    let total = 0;
    for (const item of sub.items?.data || []) {
      const unit = item.price?.unit_amount ?? 0;
      const qty = item.quantity ?? 1;
      const interval = item.price?.recurring?.interval;
      const count = item.price?.recurring?.interval_count || 1;
      let monthly = unit * qty;
      if (interval === 'year') monthly = (unit * qty) / (12 * count);
      else if (interval === 'week') monthly = ((unit * qty) * 52) / 12 / count;
      else if (interval === 'day') monthly = ((unit * qty) * 365) / 12 / count;
      else monthly = (unit * qty) / count;
      total += monthly;
    }
    return Math.round(total);
  }

  // Walk each month and ask: which subs were alive during that month?
  const monthKeys = [...rows.keys()];
  for (const m of monthKeys) {
    const [y, mo] = m.split('-').map(Number);
    const monthStart = Date.UTC(y, mo - 1, 1) / 1000;
    const monthEnd = Date.UTC(y, mo, 1) / 1000;

    for (const sub of subscriptions) {
      if (sub.status === 'incomplete' || sub.status === 'incomplete_expired') continue;
      const start = sub.created;
      const end = sub.canceled_at || sub.ended_at || null;

      const aliveDuringMonth = start < monthEnd && (end === null || end > monthStart);
      if (!aliveDuringMonth) continue;

      const row = rows.get(m)!;
      row.activeSubscribers += 1;
      row.mrrCents += subscriptionMonthlyCents(sub);
      if (start >= monthStart && start < monthEnd) row.newSubscribers += 1;
      if (end && end >= monthStart && end < monthEnd) row.churnedSubscribers += 1;
    }
  }

  return [...rows.values()];
}

/**
 * Story coverage: how many children have at least one connection (shirt
 * purchase or donation) and how many have an active monthly sponsor right now.
 * This is an operational metric — NOT surfaced to sponsors — because it
 * informs content production (whose letters do we send this month).
 */
function computeStoryCoverage(
  children: AirtableChildRecord[],
  donations: AirtableDonationRecord[],
  subscriptions: Stripe.Subscription[]
): StoryCoverage {
  const connectionsByChild = new Map<string, number>();
  const activeSponsorsByChild = new Map<string, number>();

  // Active sponsor = subscription status in {active, trialing, past_due} —
  // essentially "currently expected to pay." We tie subscriptions to children
  // via metadata.child_id if present.
  const activeStatuses = new Set(['active', 'trialing', 'past_due']);
  for (const sub of subscriptions) {
    if (!activeStatuses.has(sub.status)) continue;
    const childId = sub.metadata?.child_id;
    if (!childId) continue;
    activeSponsorsByChild.set(childId, (activeSponsorsByChild.get(childId) || 0) + 1);
  }

  for (const d of donations) {
    const links = d.fields.Child || [];
    for (const linkedId of links) {
      connectionsByChild.set(linkedId, (connectionsByChild.get(linkedId) || 0) + 1);
    }
  }

  // Filter out reserved-for-auction slots (they're placeholders, not real kids)
  const realChildren = children.filter(c => !c.fields.ReservedForAuction);

  let childrenWithAnyConnection = 0;
  let childrenWithActiveSponsor = 0;
  let maxConnectionsOnOneChild = 0;
  const buckets = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };

  for (const child of realChildren) {
    const childId = child.fields.ChildID;
    const conns =
      (childId ? connectionsByChild.get(childId) : 0) ||
      connectionsByChild.get(child.id) ||
      0;
    const activeSponsors =
      (childId ? activeSponsorsByChild.get(childId) : 0) ||
      activeSponsorsByChild.get(child.id) ||
      0;
    if (conns > 0) childrenWithAnyConnection += 1;
    if (activeSponsors > 0) childrenWithActiveSponsor += 1;
    if (conns > maxConnectionsOnOneChild) maxConnectionsOnOneChild = conns;

    const key =
      conns === 0 ? '0' : conns === 1 ? '1' : conns === 2 ? '2' : conns === 3 ? '3' : conns === 4 ? '4' : '5+';
    buckets[key as keyof typeof buckets] += 1;
  }

  return {
    totalChildren: realChildren.length,
    childrenWithAnyConnection,
    childrenWithActiveSponsor,
    childrenWithNoConnection: realChildren.length - childrenWithAnyConnection,
    maxConnectionsOnOneChild,
    distribution: Object.entries(buckets).map(([bucket, count]) => ({ bucket, children: count })),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const warnings: string[] = [];
  let subscriptions: Stripe.Subscription[] = [];
  let shirtSessions: Stripe.Checkout.Session[] = [];

  try {
    const stripe = await getStripe();
    try {
      [subscriptions, shirtSessions] = await Promise.all([
        fetchAllSubscriptions(stripe),
        fetchShirtCheckouts(stripe),
      ]);
    } catch (e) {
      warnings.push(
        'Stripe data could not be loaded — ' +
          (e instanceof Error ? e.message : 'unknown error') +
          '. Retention numbers will be zeros until Stripe credentials are valid.'
      );
    }
  } catch (e) {
    warnings.push(
      'Stripe is not configured yet — ' + (e instanceof Error ? e.message : 'unknown error')
    );
  }

  const [children, donations] = await Promise.all([
    airtableList<AirtableChildRecord>(`/${encodeURIComponent(AIRTABLE_CHILDREN_TABLE)}`),
    airtableList<AirtableDonationRecord>(`/${encodeURIComponent(AIRTABLE_DONATIONS_TABLE)}`),
  ]);

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    warnings.push('Airtable is not configured. Children and donation data are empty.');
  }

  // Active = subscription status currently expected to pay
  const activeStatuses = new Set(['active', 'trialing', 'past_due']);
  const activeSubs = subscriptions.filter(s => activeStatuses.has(s.status));
  const mrrByMonth = computeMrr(subscriptions);
  const currentMrrCents = mrrByMonth[mrrByMonth.length - 1]?.mrrCents ?? 0;

  const activation = computeActivation(shirtSessions, subscriptions);
  const retention = computeRetention(subscriptions);
  const storyCoverage = computeStoryCoverage(children, donations, subscriptions);

  const dataState: MetricsResponse['dataState'] =
    subscriptions.length === 0 && shirtSessions.length === 0
      ? 'empty'
      : subscriptions.length < 10 || shirtSessions.length < 10
      ? 'partial'
      : 'ready';

  const response: MetricsResponse = {
    generatedAt: new Date().toISOString(),
    dataState,
    totals: {
      shirtsAllTime: shirtSessions.length,
      subscriptionsAllTime: subscriptions.length,
      activeSubscribers: activeSubs.length,
      mrrCents: currentMrrCents,
      mrrUsd: currentMrrCents / 100,
    },
    activation,
    retention,
    mrrByMonth,
    storyCoverage,
    warnings,
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
