/**
 * Cycle resolver — shirt # to kid record ID.
 *
 * Reads from the Airtable `Batches` table. Each batch defines a
 * block of shirt numbers + the locked roster snapshot that block
 * cycles through. The math inside a batch is:
 *
 *     index = (shirtNumber - batch.start) mod batch.snapshot.length
 *     kid = batch.snapshot[index]
 *
 * See docs/claude/core_model.md for the full model — including the
 * pool-funding rule (no per-kid sponsor counts in UI), the batch
 * lock invariant (mid-batch additions queue for next batch), and
 * the partner-org joining flow.
 */

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_API_KEY =
  process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
const BATCHES_TABLE = process.env.AIRTABLE_BATCHES_TABLE || 'Batches';

function atHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

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

/** List every batch from Airtable, sorted by StartShirtNumber. */
export async function listBatches(): Promise<BatchRecord[]> {
  if (batchCache && Date.now() - batchCache.at < BATCH_TTL_MS) {
    return batchCache.batches;
  }
  const out: BatchRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    if (offset) params.set('offset', offset);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      BATCHES_TABLE
    )}?${params.toString()}`;
    const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Batches fetch failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    for (const rec of (data.records || []) as Array<{
      id: string;
      fields: Record<string, unknown>;
    }>) {
      const f = rec.fields;
      out.push({
        id: rec.id,
        name: (f.BatchName as string) || '(unnamed)',
        startShirtNumber: (f.StartShirtNumber as number) || 0,
        endShirtNumber: (f.EndShirtNumber as number) || 0,
        snapshot: ((f.RosterSnapshot as string) || '')
          .split(/\r?\n/)
          .map(s => s.trim())
          .filter(s => s.startsWith('rec')),
        status:
          typeof f.Status === 'string'
            ? (f.Status as string)
            : ((f.Status as { name?: string })?.name || ''),
        openedAt: (f.OpenedAt as string) || null,
        closedAt: (f.ClosedAt as string) || null,
        notes: (f.Notes as string) || '',
      });
    }
    offset = data.offset;
  } while (offset);
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
 * batch that resolves to them. This is the per-kid "number
 * footprint" — answers Kevin's question "what numbers is this kid
 * the face of."
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
      // Every shirt # in this batch where the cycle lands on p.
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
 * Compatibility shim — match the legacy `canonicalShirtNumber(n)`
 * function's output by resolving shirt N to a kid and returning that
 * kid's PRIMARY ShirtNumber. Used during the transition before all
 * call sites move off the old hardcoded math.
 *
 * Returns null when the resolved kid has no primary ShirtNumber set.
 */
export async function canonicalShirtNumberFromBatches(
  shirtNumber: number,
  childrenLookup: (recordId: string) => Promise<number | null>
): Promise<number | null> {
  const resolved = await resolveShirtToKid(shirtNumber);
  if (!resolved) return null;
  return childrenLookup(resolved.childRecordId);
}
