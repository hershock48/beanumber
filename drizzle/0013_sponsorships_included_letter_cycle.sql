-- Shirt-holder "one letter included with the shirt" mechanic (2026-07-10).
-- The letter template we ship in shirt bags promises: "One letter out.
-- One letter back. Included with the shirt. $25/month keeps you writing."
-- This column enforces the "out" side of that promise.
--
-- A shirt-holder (sponsorship row with child_revealed_at set, no monthly
-- amount yet) is allowed to write ONE letter without subscribing. When
-- Simon marks that letter as delivered to the kid, we stamp this column.
-- Subsequent write attempts by the same holder are blocked at
-- /api/sponsor/notes with a "sponsor to keep writing" 403. Subscribing
-- to $25/mo instantly unlocks writing again (the monthly check takes
-- precedence over this column).
--
-- Stamped only on 'delivered' status transitions — a declined note
-- doesn't burn the cycle, so the buyer isn't cheated by a Simon decline.
-- Idempotent write uses COALESCE server-side so the first delivery wins.
--
-- Nullable so pre-existing holder rows continue to reflect "no letter
-- sent yet". Once the code deploys, every existing holder gets the free
-- letter offer automatically.

ALTER TABLE sponsorships
  ADD COLUMN IF NOT EXISTS included_letter_sent_at TIMESTAMP WITH TIME ZONE;
