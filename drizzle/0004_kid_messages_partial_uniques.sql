-- 0004 — kid_messages partial unique indexes
--
-- BACKGROUND
-- ──────────
-- src/lib/db/schema.ts documents these constraints inline in the
-- kidMessages table definition, but Drizzle can't emit partial unique
-- indexes (WHERE clause on a unique index) — so the actual constraints
-- have to be applied via raw SQL migration. Historically they were
-- applied ad-hoc against prod; today's audit couldn't confirm they
-- exist in prod, and if either is missing the corresponding race
-- condition is still live.
--
-- INDEX 1 — one ACTIVE outbound note per (sponsor, kid)
-- ─────────────────────────────────────────────────────
-- The composer POST at src/app/api/sponsor/notes/route.ts rate-limits
-- to one pending-or-translated note per sponsor+kid via an app-layer
-- pre-check, but two concurrent requests can slip past that (both
-- read empty, both insert). This index catches the second insert
-- with error_code 23505; the route surfaces that as 'you already
-- have a note in the queue.'
--
-- Delivered / declined rows are excluded so a sponsor can queue
-- another note after each delivery cycle — that's why it's partial.
--
-- INDEX 2 — one reply per parent
-- ─────────────────────────────
-- src/app/api/admin/messages/[id]/reply/route.ts enforces one reply
-- per parent_message_id via an app-layer pre-check. Two admins
-- clicking 'reply' on the same message at the same moment can slip
-- past that; the second insert loses to 23505 and the route surfaces
-- that as 'this note already has a reply on file.'
--
-- Only kid_to_sponsor rows can be replies, and only they carry a
-- parent_message_id, so the index is trivially partial-safe.
--
-- IF NOT EXISTS makes both idempotent — safe to re-run in case a
-- prior ad-hoc application partially landed.

CREATE UNIQUE INDEX IF NOT EXISTS kid_messages_active_per_sponsor_kid_idx
  ON kid_messages (lower(sponsor_email), child_id)
  WHERE status IN ('pending', 'translated');

CREATE UNIQUE INDEX IF NOT EXISTS kid_messages_one_reply_per_parent_idx
  ON kid_messages (parent_message_id)
  WHERE direction = 'kid_to_sponsor' AND parent_message_id IS NOT NULL;
