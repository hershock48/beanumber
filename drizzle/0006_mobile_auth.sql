-- 0006 — mobile auth (Apple / Google sign-in for the native app)
--
-- Two tables:
--
--   mobile_users            one row per unique Apple / Google identity
--                           the app has seen. Match to sponsorships by
--                           verified email (lower-cased). New users can
--                           exist without a linked sponsor row — they'll
--                           just have empty "your kids" content.
--
--   mobile_token_revocations opaque token-hash blacklist. Sign-out drops
--                           a SHA-256 hash of the JWT here so the
--                           requireMobileAuth() helper can reject reuse.
--                           expires_at lets a cron sweep prune entries
--                           older than the max JWT TTL.
--
-- IF NOT EXISTS on everything so the script is safe to re-run.

CREATE TABLE IF NOT EXISTS mobile_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  apple_sub TEXT UNIQUE,
  google_sub TEXT UNIQUE,
  linked_sponsor_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_users_email ON mobile_users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_mobile_users_linked_sponsor_email
  ON mobile_users (LOWER(linked_sponsor_email));

CREATE TABLE IF NOT EXISTS mobile_token_revocations (
  token_hash TEXT PRIMARY KEY,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mobile_token_revocations_expires
  ON mobile_token_revocations (expires_at);
