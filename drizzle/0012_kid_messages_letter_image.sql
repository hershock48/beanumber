-- Sponsor handwritten letters (2026-07-10). Mirror of the kid-reply
-- side we shipped 2026-07-08: when the sponsor writes physically
-- (via the letter template we now ship in the shirt bag), they
-- photograph the sheet and upload it as the primary body of the
-- note. body_en becomes optional in that case — the photo IS the
-- letter.
--
-- Adds two columns to kid_messages:
--   letter_image_url         — public URL of the uploaded scan
--   letter_image_uploaded_at — stamp for auditing / cleanup
--
-- Applied only to direction='sponsor_to_kid' rows in practice
-- (nullable so pre-2026-07-10 typed-only notes keep working).

ALTER TABLE kid_messages
  ADD COLUMN IF NOT EXISTS letter_image_url TEXT,
  ADD COLUMN IF NOT EXISTS letter_image_uploaded_at TIMESTAMP WITH TIME ZONE;
