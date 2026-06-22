#!/bin/bash
# One-shot to push the migration's three Postgres env vars to Vercel
# production. Reads the values that are already in .env.local (pulled
# from production earlier and updated locally), removes any existing
# (empty) ones in Vercel, and pushes the new values up.
#
# Run once from this directory:
#   bash update-vercel-env.sh
#
# Then delete this file.
set -e

cd "$(dirname "$0")"

DATABASE_URL=$(grep '^DATABASE_URL=' .env.local | sed 's/^DATABASE_URL="\(.*\)"/\1/')
SUPABASE_URL=$(grep '^SUPABASE_URL=' .env.local | sed 's/^SUPABASE_URL="\(.*\)"/\1/')
SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | sed 's/^SUPABASE_SERVICE_ROLE_KEY="\(.*\)"/\1/')

for var in DATABASE_URL SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  echo "→ ${var}"
  # Remove existing entry if present (silences "not found" error)
  vercel env rm "${var}" production --yes >/dev/null 2>&1 || true
  # Add the new value via stdin
  printf '%s' "${!var}" | vercel env add "${var}" production
done

echo
echo "✓ Done. Trigger a redeploy so the new vars take effect:"
echo "    vercel --prod"
echo "  (or just push any commit and Vercel will redeploy automatically)"
