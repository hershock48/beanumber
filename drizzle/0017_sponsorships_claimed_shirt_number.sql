-- Per-NUMBER claims (2026-07-16)
--
-- Claims were recorded per KID: the claim path resolved a shirt
-- number to a Children row and blocked when ANY other email had an
-- Active/Holder sponsorship on that row. Two failures:
--
--   1. Numbers past the canonical roster (54+) have NO Children row
--      in Postgres (the Airtable-era "cycle records" never migrated),
--      so getChildByShirtNumber() returned null and every claim of a
--      cycle number silently no-op'd behind the privacy response.
--   2. Multiple sponsors per kid is the model working as designed
--      (co-sponsors via /meet, cycling numbers). Fourteen numbers
--      already have 2+ distinct emails with Active/Holder rows on
--      the same kid, so the per-kid block was firing on legitimate
--      claims and telling real shirt-holders their number belonged
--      to someone else.
--
-- Fix: claims key on the NUMBER. claimed_shirt_number records which
-- physical shirt number this sponsorship row owns; NULL means the
-- row holds no number (co-sponsors added via /meet, childless
-- checkout rows awaiting a claim). The claim path resolves 54+ via
-- the Batches cycle math (same as the kid page), the already-claimed
-- check compares numbers, and the /me #N badge renders only for
-- rows that actually hold a number — which enforces the "no #N badge
-- on co-sponsor cards" rule from CLAUDE.md non-negotiable #4.
--
-- No unique index: number exclusivity is enforced app-side at the
-- claim path (matching this schema's app-layer-validation convention
-- for status fields), because reassignment/departure flows may
-- legitimately hold two rows with the same number across status
-- transitions. The partial index below keeps the per-number lookups
-- fast.
--
-- Idempotent: IF NOT EXISTS on both the column and the index.

ALTER TABLE sponsorships
  ADD COLUMN IF NOT EXISTS claimed_shirt_number INT;

CREATE INDEX IF NOT EXISTS sponsorships_claimed_shirt_number_idx
  ON sponsorships (claimed_shirt_number)
  WHERE claimed_shirt_number IS NOT NULL;
