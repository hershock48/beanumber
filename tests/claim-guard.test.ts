import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSecondClaim } from '../src/lib/claim-guard';
import {
  makeClaimConfirmToken,
  makeRecoveryToken,
  verifyClaimConfirmToken,
  verifyRecoveryToken,
} from '../src/lib/recovery-tokens';

// ─── decideSecondClaim ──────────────────────────────────────────

test('first claim from an email that holds nothing goes straight through', () => {
  // Gift shirts, a spouse's email, found shirts, pre-cutover buyers.
  const d = decideSecondClaim({
    typedNumber: 260,
    heldNumbers: [],
    fulfillmentNumbers: [],
    confirmed: false,
  });
  assert.deepEqual(d, { outcome: 'proceed', reason: 'first_claim' });
});

test('co-sponsor rows do not count as holding a number', () => {
  // Callers pass claimed_shirt_number only; NULL/0 entries are
  // filtered so a /meet co-sponsorship never trips the guard.
  const d = decideSecondClaim({
    typedNumber: 260,
    heldNumbers: [0, NaN],
    fulfillmentNumbers: [],
    confirmed: false,
  });
  assert.deepEqual(d, { outcome: 'proceed', reason: 'first_claim' });
});

test('typing the number you already hold is sign-in, not a claim', () => {
  const d = decideSecondClaim({
    typedNumber: 230,
    heldNumbers: [230],
    fulfillmentNumbers: [],
    confirmed: false,
  });
  assert.deepEqual(d, { outcome: 'proceed', reason: 'already_held' });
});

test('the 2026-09-23 incident: holds #230, types #260, no trail, asks to confirm', () => {
  const d = decideSecondClaim({
    typedNumber: 260,
    heldNumbers: [230],
    fulfillmentNumbers: [230, null],
    confirmed: false,
  });
  assert.deepEqual(d, { outcome: 'confirm', reason: 'held_other_number' });
});

test('a second shirt with a stamped fulfillment goes straight through', () => {
  const d = decideSecondClaim({
    typedNumber: 260,
    heldNumbers: [230],
    fulfillmentNumbers: [230, 260],
    confirmed: false,
  });
  assert.deepEqual(d, { outcome: 'proceed', reason: 'purchase_trail' });
});

test('unreconciled fulfillments (order_number NULL) are not a trail', () => {
  const d = decideSecondClaim({
    typedNumber: 260,
    heldNumbers: [230],
    fulfillmentNumbers: [null, undefined],
    confirmed: false,
  });
  assert.equal(d.outcome, 'confirm');
});

test('the inbox tap confirms a second claim with no trail', () => {
  const d = decideSecondClaim({
    typedNumber: 260,
    heldNumbers: [230, 231],
    fulfillmentNumbers: [],
    confirmed: true,
  });
  assert.deepEqual(d, { outcome: 'proceed', reason: 'confirmed' });
});

// ─── claim-confirm tokens ───────────────────────────────────────

function withSecret<T>(fn: () => T): T {
  const old = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-only-cron-secret';
  try {
    return fn();
  } finally {
    if (old === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = old;
  }
}

test('claim token round-trips and normalizes the email', () => {
  withSecret(() => {
    const t = makeClaimConfirmToken('  Wearer@Example.com ', 260);
    assert.deepEqual(verifyClaimConfirmToken(t), {
      email: 'wearer@example.com',
      shirtNumber: 260,
    });
  });
});

test('claim token and recovery token are not interchangeable', () => {
  withSecret(() => {
    const claim = makeClaimConfirmToken('a@b.co', 260);
    const recovery = makeRecoveryToken('BAN-2026-001', 230);
    assert.equal(verifyRecoveryToken(claim), null);
    assert.equal(verifyClaimConfirmToken(recovery), null);
    assert.deepEqual(verifyRecoveryToken(recovery), {
      sponsorCode: 'BAN-2026-001',
      shirtNumber: 230,
    });
  });
});

test('claim token rejects tampering, expiry, and a rotated secret', () => {
  withSecret(() => {
    const t = makeClaimConfirmToken('a@b.co', 260);
    const [payload, sig] = t.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ k: 'claim', m: 'a@b.co', n: 261, e: 4102444800 })
    ).toString('base64url');
    assert.equal(verifyClaimConfirmToken(`${forgedPayload}.${sig}`), null);
    assert.equal(verifyClaimConfirmToken(`${payload}.${sig}x`), null);
    assert.equal(verifyClaimConfirmToken(payload), null);
    assert.equal(verifyClaimConfirmToken(''), null);
    assert.equal(verifyClaimConfirmToken(makeClaimConfirmToken('a@b.co', 260, -1)), null);
    process.env.CRON_SECRET = 'rotated';
    assert.equal(verifyClaimConfirmToken(t), null);
  });
});

test('claim token refuses an empty email or a non-positive number', () => {
  withSecret(() => {
    assert.throws(() => makeClaimConfirmToken('', 260));
    assert.throws(() => makeClaimConfirmToken('a@b.co', 0));
    assert.throws(() => makeClaimConfirmToken('a@b.co', 1.5));
  });
});
