-- 0005 — newsletters.teaser column
--
-- Re-adds the teaser field the Airtable-era schema had but the
-- Postgres migration dropped. Populated per-newsletter by Kevin so
-- the sponsor / non-sponsor email variants can use a hand-crafted
-- pull quote instead of the auto-extractor grabbing the first paragraph.
--
-- Nullable — when empty, the send loop falls back to the auto-extractor
-- (see extractTeaser in src/lib/tools/email/send-campus-newsletter.ts).
--
-- IF NOT EXISTS makes this idempotent.

ALTER TABLE newsletters
  ADD COLUMN IF NOT EXISTS teaser TEXT;
