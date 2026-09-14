# Admin Workflows

This directory contains workflows for admin operations.

## Available Workflows

| Workflow | Purpose | Status |
|----------|---------|--------|
| [review-and-publish-update.md](review-and-publish-update.md) | Review and publish pending updates | Active (reads Postgres; the Airtable wording inside is historical) |
| [monthly-sponsor-reconciliation.md](monthly-sponsor-reconciliation.md) | Reconcile Stripe with the sponsorships table | Active |

The daily admin digest and the overdue-updates reminder were retired on 2026-09-14 with Airtable. The roster deadlines banner on `/admin/roster` covers the overdue question from Postgres.

## Admin Architecture

Admin pages sit behind the `ban_admin_session` cookie (see `src/lib/admin-session.ts`); scripts can pass `ADMIN_API_TOKEN` in the `X-Admin-Token` header instead.

### Available Admin Functions

- **Dashboard** (`/admin/dashboard`): review and publish pending updates
- **Roster** (`/admin/roster`): every kid, deadlines, intake review
- **Submit Update** (`/admin/updates/submit`): field team form to submit updates

## Related Tools

- `src/lib/tools/donation/reconcile-subscriptions.ts` - Stripe vs Postgres reconciliation
- `src/lib/db/queries.ts` and `src/lib/db/mutations.ts` - every read and write

## Related API Routes

- `GET /api/admin/updates/list` - List pending updates
- `POST /api/admin/updates/publish` - Publish an update
- `POST /api/admin/updates/notify` - Send sponsor notification
- `POST /api/admin/updates/submit` - Submit new update
- `GET /api/admin/reconciliation` - Reconcile Stripe with the sponsorships table

## Related Documentation

- [Deployment Environment Variables](../../docs/deployment/VERCEL_ENV_VARS.md)
