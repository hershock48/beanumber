-- Founding Cohort members (2026-09-14)
--
-- The /rep page (the October 2026 Uganda trip cohort) took applications
-- and magic-link logins through an Airtable "Reps" table. Airtable was
-- retired account-wide in August 2026, so every apply and sign-in on
-- that page has returned 503 since. This table is the Postgres home for
-- the same rows.
--
-- Stats (shirts_sold, sponsor_count) are computed live from donations
-- whose donation_note carries "[Ref: <ref_code>]" and cached here so the
-- cohort leaderboard is one query. child_number / child_name are set by
-- hand when a member claims a kid.
--
-- Idempotent: IF NOT EXISTS on the table and every index. Apply in the
-- Supabase SQL editor (project ttsnwphctjcbtiyijmdf), same as 0002+.

CREATE TABLE IF NOT EXISTS cohort_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  email             text NOT NULL,
  phone             text,
  school            text,
  organization      text,
  why               text,
  first_five        text,
  how_heard         text,
  ref_code          text NOT NULL,
  -- 'Applied' | 'Approved' | 'Declined'
  status            text NOT NULL DEFAULT 'Applied',
  applied_at        timestamptz NOT NULL DEFAULT now(),
  shirts_sold       integer NOT NULL DEFAULT 0,
  sponsor_count     integer NOT NULL DEFAULT 0,
  child_number      integer,
  child_name        text,
  auth_token        text,
  auth_token_expiry timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cohort_members_email_lower_idx
  ON cohort_members (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS cohort_members_ref_code_idx
  ON cohort_members (ref_code);

CREATE INDEX IF NOT EXISTS cohort_members_auth_token_idx
  ON cohort_members (auth_token)
  WHERE auth_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS cohort_members_status_idx
  ON cohort_members (status);
