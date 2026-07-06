-- 0003 — children.shirt_number partial UNIQUE constraint
--
-- BACKGROUND
-- ──────────
-- src/app/api/admin/roster/create/route.ts assigns new kids to the
-- lowest-available shirt number in the canonical range (1..53 as of
-- July 2026). The endpoint does READ-THEN-INSERT with no transaction,
-- no FOR UPDATE, and no advisory lock. Two Simon-side +Add clicks
-- landing at the same instant read the same "filled" set, both pick
-- the same gap, and both INSERT — producing two kids with the SAME
-- shirt_number. The kid page then serves whichever row Postgres
-- returns first for that number.
--
-- FIX
-- ───
-- Add a PARTIAL unique index — WHERE shirt_number IS NOT NULL — so
-- the second concurrent insert loses to a Postgres error_code 23505.
-- The API route now catches that specifically and retries with the
-- next gap (see route change in the same commit).
--
-- Partial rather than plain UNIQUE because kids between numbers
-- (departed, archived, awaiting reassignment) legitimately have a
-- NULL shirt_number and the constraint must not apply to them.
-- The existing children_shirt_number_idx non-unique index stays for
-- the ORDER BY / lookup paths — Postgres will use it, not this
-- constraint, for range scans.
--
-- IF NOT EXISTS makes this migration idempotent — safe to re-run
-- during a fix-forward if a partial application ever lands.

CREATE UNIQUE INDEX IF NOT EXISTS children_shirt_number_unique_idx
  ON children (shirt_number)
  WHERE shirt_number IS NOT NULL;
