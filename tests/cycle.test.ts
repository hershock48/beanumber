import test from 'node:test';
import assert from 'node:assert/strict';
import {
  batchForShirtNumber,
  resolveShirtToKid,
  shirtNumbersForKid,
  type BatchRecord,
} from '../src/lib/cycle';
import { canonicalShirtNumber } from '../src/lib/mobile/shirt-cycle';

// The cycle math is the identity of the product: shirt number in, kid
// out, forever. These tests pin the batch resolver to the model in
// docs/claude/core_model.md and to the hardcoded era formula that
// shipped before the Batches table existed, so a change to either
// shows up here before it shows up on a sponsor's page.

function batch(
  id: string,
  start: number,
  end: number,
  snapshot: string[]
): BatchRecord {
  return {
    id,
    name: id,
    startShirtNumber: start,
    endShirtNumber: end,
    snapshot,
    status: 'Closed',
    openedAt: null,
    closedAt: null,
    notes: '',
  };
}

// Canonical roster positions 1..53 as legacy ids, the way the batch
// snapshots store them.
const roster = Array.from({ length: 53 }, (_, i) => `KID-${String(i + 1).padStart(3, '0')}`);

// Batch 1: #1-53, every kid. Batch 2: #54-150, kids 2..53 (Naume at #1
// was left out of the first cycle). Batch 3: #151-300, every kid again.
const batch1 = batch('b1', 1, 53, roster);
const batch2 = batch('b2', 54, 150, roster.slice(1));
const batch3 = batch('b3', 151, 300, roster);
const batches = [batch3, batch1, batch2]; // deliberately unsorted

test('batchForShirtNumber finds the batch whose range covers the number', () => {
  assert.equal(batchForShirtNumber(1, batches)?.id, 'b1');
  assert.equal(batchForShirtNumber(53, batches)?.id, 'b1');
  assert.equal(batchForShirtNumber(54, batches)?.id, 'b2');
  assert.equal(batchForShirtNumber(150, batches)?.id, 'b2');
  assert.equal(batchForShirtNumber(151, batches)?.id, 'b3');
  assert.equal(batchForShirtNumber(300, batches)?.id, 'b3');
  assert.equal(batchForShirtNumber(301, batches), null);
  assert.equal(batchForShirtNumber(0, batches), null);
});

test('resolveShirtToKid is (N - start) mod snapshot length inside the batch', async () => {
  const r54 = await resolveShirtToKid(54, batches);
  assert.equal(r54?.childRecordId, 'KID-002');
  assert.equal(r54?.positionInBatch, 0);
  const r105 = await resolveShirtToKid(105, batches);
  assert.equal(r105?.childRecordId, 'KID-053');
  const r106 = await resolveShirtToKid(106, batches);
  assert.equal(r106?.childRecordId, 'KID-002'); // second loop of batch 2
  const r151 = await resolveShirtToKid(151, batches);
  assert.equal(r151?.childRecordId, 'KID-001'); // Naume is back in batch 3
  const r204 = await resolveShirtToKid(204, batches);
  assert.equal(r204?.childRecordId, 'KID-001');
});

test('a number outside every batch resolves to nothing, never to a wrong kid', async () => {
  assert.equal(await resolveShirtToKid(301, batches), null);
  assert.equal(await resolveShirtToKid(1000000, batches), null);
  const empty = batch('e', 400, 450, []);
  assert.equal(await resolveShirtToKid(420, [empty]), null);
});

test('the Batches resolver agrees with the hardcoded era formula for #54-300', async () => {
  // canonicalShirtNumber() is the pre-Batches safety net still used by
  // the kid page and the mobile API. The two must never disagree on a
  // sold shirt: that would show one kid on the web and another in the
  // app.
  for (let n = 54; n <= 300; n++) {
    const viaBatches = await resolveShirtToKid(n, batches);
    const viaFormula = canonicalShirtNumber(n);
    assert.ok(viaBatches, `#${n} should resolve through batches`);
    assert.ok(viaFormula, `#${n} should resolve through the formula`);
    assert.equal(
      viaBatches.childRecordId,
      roster[viaFormula - 1],
      `#${n}: batches say ${viaBatches.childRecordId}, formula says position ${viaFormula}`
    );
  }
});

test('canonicalShirtNumber refuses canonical numbers and anything past #300', () => {
  assert.equal(canonicalShirtNumber(1), null);
  assert.equal(canonicalShirtNumber(53), null);
  assert.equal(canonicalShirtNumber(301), null);
  assert.equal(canonicalShirtNumber(NaN), null);
  assert.equal(canonicalShirtNumber(-5), null);
});

test('shirtNumbersForKid lists every number a kid is the face of, sorted', () => {
  const naume = shirtNumbersForKid('KID-001', batches).map(x => x.shirtNumber);
  // Batch 1 position 0, skipped in batch 2, batch 3 positions 0 and 53.
  assert.deepEqual(naume, [1, 151, 204, 257]);

  const second = shirtNumbersForKid('KID-002', batches).map(x => x.shirtNumber);
  assert.deepEqual(second, [2, 54, 106, 152, 205, 258]);

  const nobody = shirtNumbersForKid('KID-999', batches);
  assert.deepEqual(nobody, []);
});

test('shirtNumbersForKid never emits a number past the batch end', () => {
  const b = batch('short', 400, 404, ['A', 'B', 'C']); // 5 numbers, 3 kids
  assert.deepEqual(shirtNumbersForKid('A', [b]).map(x => x.shirtNumber), [400, 403]);
  assert.deepEqual(shirtNumbersForKid('B', [b]).map(x => x.shirtNumber), [401, 404]);
  assert.deepEqual(shirtNumbersForKid('C', [b]).map(x => x.shirtNumber), [402]);
});
