import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { db } from '@/lib/db/client';
import { children, donations, donationChildren } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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
  const all: Stripe.Checkout.Session[] = [];
  for await (const session of stripe.checkout.sessions.list({ limit: 100 })) {
    if (session.status !== 'complete') continue;
    if (session.metadata?.order_type !== 'shirt') continue;
    all.push(session);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Postgres helpers
// ---------------------------------------------------------------------------

interface ChildLite {
  id: string;
  childId: string;
  reservedForAuction: boolean | null;
}

interface DonationLinkLite {
  /** kid record id (uuid) */
  childRecordId: string;
}

async function loadChildren(): Promise<ChildLite[]> {
  return db
    .select({
      id: children.id,
      childId: children.childId,
      reservedForAuction: children.reservedForAuction,
    })
    .from(children);
}

async function loadDonationLinks(): Promise<DonationLinkLite[]> {
  // We only need the kid-side of the relationship for coverage counting.
  // Filter to succeeded donations so we don't credit failed attempts.
  const rows = await db
    .select({
      childRecordId: donationChildren.childId,
    })
    .from(donationChildren)
    .innerJoin(donations, eq(donations.id, donationChildren.donationId))
    .where(eq(donations.paymentStatus, 'Succeeded'));
  return rows;
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

function computeActivation(
  shirtSessions: Stripe.Checkout.Session[],
  subscriptions: Stripe.Subscription[]
): ActivationRow[] {
  const subStartByShirtSession = new Map<string, number>();
  const subStartByCustomer = new Map<string, number>();
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

function computeRetention(subscriptions: Stripe.Subscription[]): CohortRow[] {
  const MAX_OFFSET = 6;
  const nowKey = monthKey(new Date());

  const byCohort = new Map<string, Stripe.Subscription[]>();
  for (const sub of subscriptions) {
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
          counts.push(null);
          continue;
        }
        let alive = 0;
        for (const sub of subs) {
          const endedSecs = sub.canceled_at || sub.ended_at || null;
          const endedKey = endedSecs ? monthKey(endedSecs) : null;
          const [y, m] = cohort.split('-').map(Number);
          const target = new Date(Date.UTC(y, m - 1 + offset, 1));
          const targetKey = monthKey(target);
          if (!endedKey || monthsBetween(targetKey, endedKey) > 0 || (endedKey === targetKey && !endedSecs)) {
            alive += 1;
          } else if (endedKey && monthsBetween(targetKey, endedKey) >= 0) {
            if (monthsBetween(targetKey, endedKey) > 0) alive += 1;
          }
        }
        counts.push(alive);
      }
      return { cohort, startSize: subs.length, counts };
    });
}

function computeMrr(subscriptions: Stripe.Subscription[]): MrrRow[] {
  const rows = new Map<string, MrrRow>();

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

function computeStoryCoverage(
  kids: ChildLite[],
  donationLinks: DonationLinkLite[],
  subscriptions: Stripe.Subscription[]
): StoryCoverage {
  const connectionsByChild = new Map<string, number>();
  const activeSponsorsByChild = new Map<string, number>();

  const activeStatuses = new Set(['active', 'trialing', 'past_due']);
  // Stripe subs may carry either a UUID (child_record_id) or the legacy
  // ChildID string. Match both.
  const childIdByLegacy = new Map<string, string>();
  for (const c of kids) childIdByLegacy.set(c.childId, c.id);

  for (const sub of subscriptions) {
    if (!activeStatuses.has(sub.status)) continue;
    const meta = sub.metadata || {};
    const childRecordId = meta.child_record_id || meta.childRecordId || '';
    const childIdLegacy = meta.child_id || meta.childId || '';
    const id = childRecordId || childIdByLegacy.get(childIdLegacy) || '';
    if (!id) continue;
    activeSponsorsByChild.set(id, (activeSponsorsByChild.get(id) || 0) + 1);
  }

  for (const link of donationLinks) {
    connectionsByChild.set(
      link.childRecordId,
      (connectionsByChild.get(link.childRecordId) || 0) + 1
    );
  }

  const realChildren = kids.filter(c => !c.reservedForAuction);

  let childrenWithAnyConnection = 0;
  let childrenWithActiveSponsor = 0;
  let maxConnectionsOnOneChild = 0;
  const buckets = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };

  for (const child of realChildren) {
    const conns = connectionsByChild.get(child.id) || 0;
    const activeSponsors = activeSponsorsByChild.get(child.id) || 0;
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

  let kids: ChildLite[] = [];
  let donationLinks: DonationLinkLite[] = [];
  try {
    [kids, donationLinks] = await Promise.all([loadChildren(), loadDonationLinks()]);
  } catch (e) {
    warnings.push(
      'Postgres data could not be loaded — ' +
        (e instanceof Error ? e.message : 'unknown error') +
        '. Children + donation coverage will be empty.'
    );
  }

  const activeStatuses = new Set(['active', 'trialing', 'past_due']);
  const activeSubs = subscriptions.filter(s => activeStatuses.has(s.status));
  const mrrByMonth = computeMrr(subscriptions);
  const currentMrrCents = mrrByMonth[mrrByMonth.length - 1]?.mrrCents ?? 0;

  const activation = computeActivation(shirtSessions, subscriptions);
  const retention = computeRetention(subscriptions);
  const storyCoverage = computeStoryCoverage(kids, donationLinks, subscriptions);

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
