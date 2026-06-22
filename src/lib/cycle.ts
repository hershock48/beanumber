/**
 * Cycle resolver — shirt # to kid record ID.
 *
 * Reads from the Postgres `batches` table (formerly Airtable Batches).
 * Each batch defines a block of shirt numbers + the locked roster
 * snapshot that block cycles through. The math inside a batch is:
 *
 *     index = (shirtNumber - batch.start) mod batch.snapshot.length
 *     kid = batch.snapshot[index]
 *
 * See docs/claude/core_model.md for the full model — including the
 * pool-funding rule (no per-kid sponsor counts in UI), the batch
 * lock invariant (mid-batch additions queue for next batch), and
 * the partner-org joining flow.
 *
 * The roster snapshot is stored as a newline-separated string of
 * record IDs in the Airtable era; that format is preserved verbatim
 * in Postgres so cycle math stays untouched during the cutover.
 */

import { listBatches as listBatchesFromDb } from './db/queries';

export interface BatchRecord {
  id: string;
  name: string;
  startShirtNumber: number;
  endShirtNumber: number;
  snapshot: string[]; // Child record IDs in cycle order
  status: 'Planned' | 'Active' | 'Closed' | string;
  openedAt: string | null;
  closedAt: string | null;
  notes: string;
}

let batchCache: { at: number; batches: BatchRecord[] } | null = null;
const BATCH_TTL_MS = 30_000;

function clearCache() {
  batchCache = null;
}
export const __test_clearBatchCache = clearCache;

/**
 * List every batch from Postgres, sorted by startShirtNumber.
 * Cached for 30 seconds per serverless instance because cycle math
 * runs on every kid-page render and the underlying batches change
 * rarely (multiple times per year, not per hour).
 */
export async function listBatches(): Promise<BatchRecord[]> {
  if (batchCache && Date.now() - batchCache.at < BATCH_TTL_MS) {
    return batchCache.batches;
  }
  const rows = await listBatchesFromDb();
  const out: BatchRecord[] = rows.map(b => ({
    id: b.id,
    name: b.batchName || '(unnamed)',
    startShirtNumber: b.startShirtNumber ?? 0,
    endShirtNumber: b.endShirtNumber ?? 0,
    snapshot: (b.rosterSnapshot || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0),
    status: b.status ?? '',
    openedAt: b.openedAt ? new Date(b.openedAt).toISOString() : null,
    closedAt: b.closedAt ? new Date(b.closedAt).toISOString() : null,
    notes: b.notes || '',
  }));
  out.sort((a, b) => a.startShirtNumber - b.startShirtNumber);
  batchCache = { at: Date.now(), batches: out };
  return out;
}

/** Find which batch covers a given shirt number. */
export function batchForShirtNumber(
  shirtNumber: number,
  batches: BatchRecord[]
): BatchRecord | null {
  for (const b of batches) {
    if (shirtNumber >= b.startShirtNumber && shirtNumber <= b.endShirtNumber) {
      return b;
    }
  }
  return null;
}

/**
 * Resolve a shirt number to the kid record ID + which batch the
 * assignment came from. Returns null if no batch covers that
 * number. Pass the batches array if you've already loaded it; the
 * function will fetch if you don't.
 */
export async function resolveShirtToKid(
  shirtNumber: number,
  batches?: BatchRecord[]
): Promise<{
  childRecordId: string;
  batch: BatchRecord;
  positionInBatch: number; // 0-indexed
} | null> {
  const all = batches || (await listBatches());
  const batch = batchForShirtNumber(shirtNumber, all);
  if (!batch || batch.snapshot.length === 0) return null;
  const positionInBatch =
    (shirtNumber - batch.startShirtNumber) % batch.snapshot.length;
  const childRecordId = batch.snapshot[positionInBatch];
  if (!childRecordId) return null;
  return { childRecordId, batch, positionInBatch };
}

/**
 * For a given kid record ID, list every shirt number across every
 * batch that resolves to them. The per-kid "number footprint" —
 * answers Kevin's question "what numbers is this kid the face of."
 */
export function shirtNumbersForKid(
  childRecordId: string,
  batches: BatchRecord[]
): Array<{ shirtNumber: number; batchId: string; batchName: string }> {
  const out: Array<{
    shirtNumber: number;
    batchId: string;
    batchName: string;
  }> = [];
  for (const b of batches) {
    const positions: number[] = [];
    for (let i = 0; i < b.snapshot.length; i++) {
      if (b.snapshot[i] === childRecordId) positions.push(i);
    }
    if (positions.length === 0) continue;
    const total = b.endShirtNumber - b.startShirtNumber + 1;
    for (const p of positions) {
      for (let k = 0; k * b.snapshot.length + p < total; k++) {
        const shirtNumber = b.startShirtNumber + p + k * b.snapshot.length;
        if (shirtNumber > b.endShirtNumber) break;
        out.push({
          shirtNumber,
          batchId: b.id,
          batchName: b.name,
        });
      }
    }
  }
  out.sort((a, b) => a.shirtNumber - b.shirtNumber);
  return out;
}

/**
 * Compatibility shim — resolves shirt N to a kid and returns that
 * kid's PRIMARY ShirtNumber via the provided lookup callback.
 * Returns null when the resolved kid has no primary ShirtNumber.
 */
export async function canonicalShirtNumberFromBatches(
  shirtNumber: number,
  childrenLookup: (recordId: string) => Promise<number | null>
): Promise<number | null> {
  const resolved = await resolveShirtToKid(shirtNumber);
  if (!resolved) return null;
  return childrenLookup(resolved.childRecordId);
}
