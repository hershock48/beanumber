-- Printful dropship line (2026-09-14)
--
-- Tees stay in house. Seasonal pieces (long sleeve, hoodie) are printed
-- and shipped by Printful: the Stripe webhook assigns the shirt number
-- at order time, posts the order to Printful with the per-number print
-- file, and Printful's shipped webhook marks the row and mails tracking.
--
-- fulfillments grows the columns that path needs. stocked_numbers is
-- the list of every number Kevin has ever printed on an in-house tee;
-- the Printful assigner never issues one of those, so a dropshipped
-- hoodie can never land on the same number as a tee in the pile.
--
-- Idempotent: IF NOT EXISTS everywhere. Apply in the Supabase SQL
-- editor (project ttsnwphctjcbtiyijmdf), same as 0002+.

ALTER TABLE fulfillments
  ADD COLUMN IF NOT EXISTS product_id         text,
  ADD COLUMN IF NOT EXISTS fulfillment_source text NOT NULL DEFAULT 'inhouse',
  ADD COLUMN IF NOT EXISTS printful_order_id  text,
  ADD COLUMN IF NOT EXISTS printful_status    text,
  ADD COLUMN IF NOT EXISTS tracking_url       text,
  ADD COLUMN IF NOT EXISTS shipped_at         timestamptz,
  ADD COLUMN IF NOT EXISTS last_error         text;

CREATE INDEX IF NOT EXISTS fulfillments_source_idx
  ON fulfillments (fulfillment_source);

CREATE INDEX IF NOT EXISTS fulfillments_printful_order_idx
  ON fulfillments (printful_order_id)
  WHERE printful_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS stocked_numbers (
  shirt_number integer PRIMARY KEY,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
