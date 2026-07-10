-- Kevin approval layer for penpal notes (2026-07-10)
--
-- Every sponsor_to_kid note now goes through Kevin BEFORE the campus
-- team touches it. New notes come in with status='awaiting_kevin'.
-- Kevin approves → 'pending' (campus team picks it up). Kevin declines
-- → 'declined' + a personalized note that goes back to the sponsor.
--
-- Two schema changes:
--
--   1. status enum gains 'awaiting_kevin'. Postgres doesn't enforce
--      enum values on a text column (kid_messages.status is text, not
--      pg_enum), so no ALTER TYPE required. But the app code (schema.ts
--      inline comment + admin UI + notes route) needs to know the value
--      exists.
--
--   2. new column kevin_decline_note (text, nullable). When Kevin
--      declines a note, whatever he types gets copied into this field
--      AND folded into the sponsor's decline email. Distinct from
--      simon_notes (which stays internal-admin-only) — Kevin's decline
--      note is the personalized message the sponsor sees.
--
-- Idempotent — safe to re-run.

ALTER TABLE kid_messages
  ADD COLUMN IF NOT EXISTS kevin_decline_note TEXT;
