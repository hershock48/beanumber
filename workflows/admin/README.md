# Admin Workflows

This directory contains workflows for admin operations.

## Available Workflows

| Workflow | Purpose | Status |
|----------|---------|--------|
| [review-and-publish-update.md](review-and-publish-update.md) | Review and publish pending updates | Active |
| [overdue-updates-reminder.md](overdue-updates-reminder.md) | Track children needing updates | Active |
| [daily-admin-digest.md](daily-admin-digest.md) | Daily summary email to admin | Active |
| [monthly-sponsor-reconciliation.md](monthly-sponsor-reconciliation.md) | Reconcile Stripe with Airtable | Active |

## Admin Architecture

The admin system requires authentication via `ADMIN_API_TOKEN` environment variable.

### Authentication Flow

1. Admin navigates to `/admin/dashboard`
2. Enters admin token
3. Token validated against `ADMIN_API_TOKEN` env var
4. Access granted to admin functions

### Available Admin Functions

- **Dashboard** (`/admin/dashboard`): View pending updates, publish, track overdue children
- **Submit Update** (`/admin/updates/submit`): Field team form to submit updates

## Related Tools

- `src/lib/tools/updates/publish-update.ts` - WAT-compliant update publishing
- `src/lib/tools/updates/list-overdue.ts` - WAT-compliant overdue tracking
- `src/lib/tools/email/send-admin-digest.ts` - WAT-compliant admin digest
- `src/lib/tools/donation/reconcile-subscriptions.ts` - WAT-compliant reconciliation
- `src/lib/airtable.ts` - Airtable operations

## Related API Routes

- `GET /api/admin/updates/list` - List pending updates
- `POST /api/admin/updates/publish` - Publish an update
- `POST /api/admin/updates/notify` - Send sponsor notification
- `GET /api/admin/updates/overdue` - List children needing updates
- `POST /api/admin/updates/submit` - Submit new update
- `POST /api/admin/digest` - Send admin digest email
- `GET /api/admin/reconciliation` - Reconcile Stripe with Airtable

## Related Documentation

- [Deployment Environment Variables](../../docs/deployment/VERCEL_ENV_VARS.md)
