-- Extend the "one active outbound note per (sponsor, kid)" partial
-- unique index to cover the new 'awaiting_kevin' status.
--
-- Before this migration:
--   kid_messages_active_per_sponsor_kid_idx WHERE status IN
--   ('pending', 'translated')
--
-- After the 2026-07-10 Kevin approval layer, new sponsor->kid notes
-- insert with status='awaiting_kevin'. The index no longer applied to
-- them, so two concurrent holder POSTs could both slip through and
-- the shirt-holder could burn TWO included letters instead of one.
-- The app-layer pre-check in /api/sponsor/notes reads kid_messages
-- but has no serializing guarantee — the unique index is the only
-- true race barrier.
--
-- Fix: drop + recreate with awaiting_kevin included.
-- Idempotent — DROP INDEX IF EXISTS, CREATE UNIQUE INDEX IF NOT EXISTS.

DROP INDEX IF EXISTS kid_messages_active_per_sponsor_kid_idx;

CREATE UNIQUE INDEX IF NOT EXISTS kid_messages_active_per_sponsor_kid_idx
  ON kid_messages (lower(sponsor_email), child_id)
  WHERE status IN ('awaiting_kevin', 'pending', 'translated');
