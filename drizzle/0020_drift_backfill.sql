-- Drift backfill (2026-10-28, audit)
--
-- Two things live in production that no migration file creates, so a
-- fresh database built from drizzle/*.sql could not run the app:
--
--   1. donors.drip_market_location. In schema.ts since the farmers
--      market work; added to production by hand. The daily drip cron
--      selects it.
--   2. kid_messages. The penpal table. Created in production directly
--      (commit 2cb1129), then altered by 0004 and 0009 through 0015,
--      none of which could run on an empty database.
--
-- Everything below is IF NOT EXISTS and matches the production
-- catalog as read on 2026-10-28 (information_schema + pg_indexes), so
-- running it against production is a no-op. Apply in the Supabase SQL
-- editor like 0002+, or only when standing up a new database.

ALTER TABLE donors
  ADD COLUMN IF NOT EXISTS drip_market_location text;

CREATE TABLE IF NOT EXISTS kid_messages (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_email             text NOT NULL,
  sponsor_name              text,
  child_id                  uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  -- 'sponsor_to_kid' | 'kid_to_sponsor'
  direction                 text NOT NULL DEFAULT 'sponsor_to_kid',
  body_en                   text NOT NULL,
  body_translated           text,
  -- 'awaiting_kevin' | 'pending' | 'translated' | 'delivered' | 'declined'
  status                    text NOT NULL DEFAULT 'pending',
  simon_notes               text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  translated_at             timestamptz,
  delivered_at              timestamptz,
  declined_at               timestamptz,
  parent_message_id         uuid REFERENCES kid_messages(id) ON DELETE CASCADE,
  reply_image_url           text,
  reply_image_uploaded_at   timestamptz,
  attachments               jsonb,
  sponsor_notified_at       timestamptz,
  letter_image_url          text,
  letter_image_uploaded_at  timestamptz,
  kevin_decline_note        text
);

CREATE INDEX IF NOT EXISTS kid_messages_status_created_idx
  ON kid_messages (status, created_at);

CREATE INDEX IF NOT EXISTS kid_messages_child_idx
  ON kid_messages (child_id);

CREATE INDEX IF NOT EXISTS kid_messages_sponsor_email_idx
  ON kid_messages (lower(sponsor_email));

CREATE INDEX IF NOT EXISTS kid_messages_parent_idx
  ON kid_messages (parent_message_id)
  WHERE parent_message_id IS NOT NULL;

-- The two partial unique indexes on this table are created by 0004
-- (one reply per parent) and redefined by 0015 (one active note per
-- sponsor and kid, including awaiting_kevin). Run those after this
-- file on a fresh database.
