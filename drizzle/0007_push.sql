-- 0007 — Expo push notifications
--
-- Three tables power the five-event push system spelled out in
-- docs/app-design-brief.md §3.7:
--
--   push_devices          one row per (mobile_users, expo_push_token).
--                         tz is the device's IANA time zone at
--                         registration — the send library uses it to
--                         hold notes that arrive outside the recipient
--                         local 09:00–20:00 window. revoked_at
--                         soft-deletes a token after Expo returns
--                         DeviceNotRegistered.
--
--   push_prompt_history   pre-permission-prompt outcomes so the server
--                         can back the client-side 60-day cooldown
--                         even if the app is reinstalled. kind is one
--                         of 'monthly-first-note' or
--                         'holder-first-return'.
--
--   push_deliveries       one row per attempt to send a notification.
--                         Rows can be created in the future
--                         (scheduled_for > now()) when the recipient
--                         is outside the 09:00–20:00 window; the
--                         /api/cron/push-drain cron picks them up.
--                         Frequency-cap and threading logic reads
--                         this table.
--
-- IF NOT EXISTS on everything so the script is safe to re-run.

CREATE TABLE IF NOT EXISTS push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES mobile_users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  platform TEXT,
  tz TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- Uniqueness on token so re-registering the same device doesn't
-- duplicate rows. When a device rotates its token (reinstall, OS
-- reset), the new insert lands and the old row eventually gets
-- pruned via revoked_at.
CREATE UNIQUE INDEX IF NOT EXISTS push_devices_token_idx
  ON push_devices (expo_push_token);

-- Fast lookup for "all live devices for user X."
CREATE INDEX IF NOT EXISTS push_devices_user_idx
  ON push_devices (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS push_prompt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES mobile_users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  last_prompted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome TEXT
);

-- Cooldown lookup: latest prompt of a given (user, kind).
CREATE INDEX IF NOT EXISTS push_prompt_history_user_kind_idx
  ON push_prompt_history (user_id, kind, last_prompted_at DESC);

CREATE TABLE IF NOT EXISTS push_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES mobile_users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  kid_id UUID REFERENCES children(id) ON DELETE SET NULL,
  thread_id TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cron scan: "what's due to send now that hasn't sent yet?"
CREATE INDEX IF NOT EXISTS push_deliveries_pending_idx
  ON push_deliveries (scheduled_for) WHERE sent_at IS NULL;

-- Frequency cap check: "how many notes has X received today?"
CREATE INDEX IF NOT EXISTS push_deliveries_user_scheduled_idx
  ON push_deliveries (user_id, scheduled_for);

-- Per-kid cap check: "already sent something about kid K to X today?"
CREATE INDEX IF NOT EXISTS push_deliveries_user_kid_idx
  ON push_deliveries (user_id, kid_id, scheduled_for)
  WHERE kid_id IS NOT NULL;
