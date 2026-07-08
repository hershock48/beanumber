-- Scanned handwritten reply support on kid_messages.
--
-- Simon uploads a photo of the kid's actual handwritten reply
-- (written on the printed BE A NUMBER letter template we ship him)
-- alongside a short English translation. The scan is the emotional
-- payoff for the sponsor — real handwriting from their real kid —
-- and the English text is the readability bridge for non-Acholi
-- speakers.
--
-- Both columns are nullable so the migration is safe against
-- existing typed-only replies. Going forward the admin UI enforces
-- "both photo + translation," but old rows without a photo continue
-- to render as text-only in the sponsor's thread. See:
--   * src/app/admin/messages/MessagesQueue.tsx (upload UI)
--   * src/app/api/admin/messages/[id]/reply-photo/route.ts (upload)
--   * src/app/api/admin/messages/[id]/reply/route.ts (POST accepts imageUrl)
--   * src/app/children/[number]/NotesThread.tsx (render)
--
-- Kevin + Simon design conversation: 2026-07-08.

ALTER TABLE kid_messages
  ADD COLUMN IF NOT EXISTS reply_image_url text;

ALTER TABLE kid_messages
  ADD COLUMN IF NOT EXISTS reply_image_uploaded_at timestamptz;
