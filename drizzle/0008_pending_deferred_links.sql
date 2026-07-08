-- 0008 — pending_deferred_links
--
-- The "install-first, meet-your-kid-second" glue for the shirt-QR flow.
--
-- When a shirt QR scan hits beanumber.org/meet/[N] on a mobile device
-- without the BAN app installed, the web page stamps a row here before
-- redirecting to the App Store. On first-open the mobile app hits
-- POST /api/mobile/v1/deferred-link/resolve with the same (IP + UA)
-- fingerprint; if a live row matches (unclaimed + not expired), we
-- return the target path and mark the row consumed. That's how the
-- reveal screen lands on /meet/48 without the user typing anything —
-- Apple killed classic Branch-style deferred deep-linking, so this
-- is our fingerprint-fallback path. See docs/claude/architecture.md
-- §"Deep linking" for the full flow.
--
-- The fingerprint is sha256(ip + '|' + normalizedUserAgent) — no
-- raw IP or UA text ever lands here. Rows are single-use
-- (consumed_at set on first claim) and time-bounded (expires_at ≤ 10min
-- from create). A periodic sweep (out of band, not implemented here)
-- can drop expired rows.
--
-- IF NOT EXISTS on everything so the script is safe to re-run.

CREATE TABLE IF NOT EXISTS pending_deferred_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL,
  target_path TEXT NOT NULL,
  shirt_number INTEGER,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

-- Hot path: /resolve looks up by fingerprint + not-yet-consumed
-- + not-yet-expired.
CREATE INDEX IF NOT EXISTS pending_deferred_links_fingerprint_idx
  ON pending_deferred_links (fingerprint);

-- Periodic sweep of expired rows.
CREATE INDEX IF NOT EXISTS pending_deferred_links_expires_idx
  ON pending_deferred_links (expires_at);
