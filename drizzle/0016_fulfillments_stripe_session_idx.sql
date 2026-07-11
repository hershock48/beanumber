-- Fulfillment idempotency guard (2026-07-10)
--
-- Root cause of the salbetski duplicate: the webhook fulfillment
-- insert had no way to correlate to the Stripe checkout session. On
-- a webhook retry (which Stripe does for any non-2xx response, or
-- occasionally on their own), the donation upsert dedupes on
-- payment_intent_id but the fulfillment insert just runs again and
-- creates a second identical row.
--
-- Fix: add stripe_session_id + item_index columns. The webhook
-- code stamps both on every insert, and a partial unique index
-- prevents concurrent-retry doubles from committing.
--
-- Idempotent: IF NOT EXISTS on both column adds and the index.

ALTER TABLE fulfillments
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

ALTER TABLE fulfillments
  ADD COLUMN IF NOT EXISTS item_index INT;

-- One row per (session, line item). item_index is 0 for a single-item
-- shirt order or portal repeat, and 0..N-1 for cart orders with N items.
-- Legacy rows have both fields NULL; the WHERE clause excludes them so
-- the index doesn't trip on the backfill.
CREATE UNIQUE INDEX IF NOT EXISTS fulfillments_session_item_uniq_idx
  ON fulfillments (stripe_session_id, item_index)
  WHERE stripe_session_id IS NOT NULL AND item_index IS NOT NULL;
