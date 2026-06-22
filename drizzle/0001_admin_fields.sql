-- 0001_admin_fields.sql
--
-- Adds the admin-OS columns to children that lib/admin/queries.ts
-- and the admin-write routes depend on, plus a new `settings` table
-- for app-wide key/value config (Gmail OAuth refresh token,
-- signature, etc).
--
-- All new columns are nullable / have safe defaults, so this is a
-- non-disruptive additive migration. Existing rows pick up the
-- defaults silently.

ALTER TABLE "children"
  ADD COLUMN IF NOT EXISTS "pending_fields" jsonb DEFAULT '[]'::jsonb;

ALTER TABLE "children"
  ADD COLUMN IF NOT EXISTS "last_edited_by_simon" timestamp with time zone;

ALTER TABLE "children"
  ADD COLUMN IF NOT EXISTS "intake_from_campus" text;

ALTER TABLE "children"
  ADD COLUMN IF NOT EXISTS "deletion_requested_at" timestamp with time zone;

ALTER TABLE "children"
  ADD COLUMN IF NOT EXISTS "student_of_month_month" text;

ALTER TABLE "children"
  ADD COLUMN IF NOT EXISTS "pending_sotm_month" text;

ALTER TABLE "children"
  ADD COLUMN IF NOT EXISTS "pending_sotm_reason" text;

ALTER TABLE "children"
  ADD COLUMN IF NOT EXISTS "photo_urls" jsonb DEFAULT '[]'::jsonb;

ALTER TABLE "children"
  ADD COLUMN IF NOT EXISTS "report_card_urls" jsonb DEFAULT '[]'::jsonb;

ALTER TABLE "children"
  ADD COLUMN IF NOT EXISTS "letter_urls" jsonb DEFAULT '[]'::jsonb;

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "value" text,
  "notes" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "settings_key_idx" ON "settings" ("key");
