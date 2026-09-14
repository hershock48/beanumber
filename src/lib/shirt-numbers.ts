/**
 * Shirt-number assignment for the Printful line.
 *
 * In-house tees get their number when Kevin presses it, at shipping
 * time, and the site never records which number went to whom (the
 * buyer tells us by claiming). A Printful piece is different: the
 * number has to be on the print file before the order is placed, so
 * it is assigned here, at order time, and written to the fulfillment
 * row.
 *
 * The pool is the current Active batch (src/lib/cycle.ts). Every
 * number in a batch resolves to a kid, so any free number is a real
 * relationship. A number is taken when any of these is true:
 *
 *   - a fulfillment row already carries it (Printful rows, portal
 *     reorders, legacy assigned rows)
 *   - a sponsorship row has claimed it
 *   - it is in stocked_numbers (printed on an in-house tee, ever)
 *   - it is a canonical number whose kid is reserved for auction
 *
 * Concurrency: the pick and the write happen inside one transaction
 * under a Postgres advisory lock, so two webhook deliveries that land
 * together cannot pick the same number.
 */

import { and, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from './db/client';
import { children, fulfillments, sponsorships, stockedNumbers } from './db/schema';
import { listBatches, type BatchRecord } from './cycle';
import { CANONICAL_ROSTER_MAX } from './roster-config';

const LOCK_KEY = 48_211_7; // arbitrary, only has to be stable

export class NoOpenBatchError extends Error {
  constructor() {
    super('No Active batch: open one on /admin/batches before the Printful line can assign numbers.');
    this.name = 'NoOpenBatchError';
  }
}

export class BatchExhaustedError extends Error {
  constructor(batch: BatchRecord) {
    super(`Batch "${batch.name}" (${batch.startShirtNumber} to ${batch.endShirtNumber}) has no free numbers left.`);
    this.name = 'BatchExhaustedError';
  }
}

async function activeBatch(): Promise<BatchRecord> {
  const all = await listBatches();
  const active = all.filter(b => b.status === 'Active');
  if (active.length === 0) throw new NoOpenBatchError();
  // Lowest range first: fill the current batch before a later one.
  active.sort((a, b) => a.startShirtNumber - b.startShirtNumber);
  return active[0];
}

/**
 * Pick the lowest free number in the active batch and stamp it on the
 * fulfillment row in the same transaction. If the row already has a
 * number (a retry), that number is returned untouched.
 */
export async function assignNumberToFulfillment(fulfillmentId: string): Promise<number> {
  const batch = await activeBatch();

  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`);

    const existing = await tx
      .select({ orderNumber: fulfillments.orderNumber })
      .from(fulfillments)
      .where(eq(fulfillments.id, fulfillmentId))
      .limit(1);
    if (!existing[0]) throw new Error(`Fulfillment ${fulfillmentId} not found`);
    if (existing[0].orderNumber != null) return existing[0].orderNumber;

    const lo = batch.startShirtNumber;
    const hi = batch.endShirtNumber;
    const taken = new Set<number>();

    const usedRows = await tx
      .select({ n: fulfillments.orderNumber })
      .from(fulfillments)
      .where(and(isNotNull(fulfillments.orderNumber), gte(fulfillments.orderNumber, lo), lte(fulfillments.orderNumber, hi)));
    for (const r of usedRows) if (r.n != null) taken.add(r.n);

    const claimedRows = await tx
      .select({ n: sponsorships.claimedShirtNumber })
      .from(sponsorships)
      .where(and(isNotNull(sponsorships.claimedShirtNumber), gte(sponsorships.claimedShirtNumber, lo), lte(sponsorships.claimedShirtNumber, hi)));
    for (const r of claimedRows) if (r.n != null) taken.add(r.n);

    const stocked = await tx
      .select({ n: stockedNumbers.shirtNumber })
      .from(stockedNumbers)
      .where(and(gte(stockedNumbers.shirtNumber, lo), lte(stockedNumbers.shirtNumber, hi)));
    for (const r of stocked) taken.add(r.n);

    if (lo <= CANONICAL_ROSTER_MAX) {
      const reserved = await tx
        .select({ n: children.shirtNumber })
        .from(children)
        .where(and(eq(children.reservedForAuction, true), isNotNull(children.shirtNumber)));
      for (const r of reserved) if (r.n != null) taken.add(r.n);
    }

    let pick: number | null = null;
    for (let n = lo; n <= hi; n++) {
      if (!taken.has(n)) {
        pick = n;
        break;
      }
    }
    if (pick == null) throw new BatchExhaustedError(batch);

    await tx
      .update(fulfillments)
      .set({ orderNumber: pick, updatedAt: new Date() })
      .where(eq(fulfillments.id, fulfillmentId));

    return pick;
  });
}

// ── Stocked numbers (admin) ─────────────────────────────────────

export async function listStockedNumbers(): Promise<number[]> {
  const rows = await db.select({ n: stockedNumbers.shirtNumber }).from(stockedNumbers).orderBy(stockedNumbers.shirtNumber);
  return rows.map(r => r.n);
}

/** Replace the whole list. The admin page edits it as one text field. */
export async function replaceStockedNumbers(numbers: number[]): Promise<number[]> {
  const clean = Array.from(new Set(numbers.filter(n => Number.isInteger(n) && n > 0))).sort((a, b) => a - b);
  await db.transaction(async tx => {
    await tx.delete(stockedNumbers);
    if (clean.length > 0) {
      await tx.insert(stockedNumbers).values(clean.map(n => ({ shirtNumber: n })));
    }
  });
  return clean;
}

/** Parse "1-53, 60, 62" style input from the admin textarea. */
export function parseNumberList(text: string): number[] {
  const out: number[] = [];
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(token);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      if (a <= b && b - a <= 10_000) for (let n = a; n <= b; n++) out.push(n);
      continue;
    }
    const n = parseInt(token, 10);
    if (Number.isInteger(n) && n > 0) out.push(n);
  }
  return out;
}
