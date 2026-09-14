# Sponsor Workflows

This directory contains workflows for sponsor-related operations.

## Available Workflows

| Workflow | Purpose | Status |
|----------|---------|--------|
| [verify-sponsor-login.md](verify-sponsor-login.md) | Authenticate sponsor login | Historical (sponsor identity is the `sponsor_session` cookie on `/[number]` now) |
| [onboard-sponsor.md](onboard-sponsor.md) | Create new sponsorship | Historical (the Stripe webhook creates sponsorships; nothing assigns kids) |

The `list-available-children` workflow and both tools below were deleted on 2026-09-14 with Airtable.

## Sponsor Architecture

### Public Pages
- `/sponsorship` - Browse children available for sponsorship (no auth)
- `/sponsor/login` - Sponsor login page

### Authenticated Pages
- `/sponsor/[code]` - Sponsor dashboard (requires valid session)

### Sponsorship Status Values

| Status | Description |
|--------|-------------|
| Awaiting Sponsor | Child available for sponsorship |
| Active | Sponsorship is current and active |
| Paused | Temporarily paused |
| Ended | Sponsorship has ended |

## Related Tools

- `src/lib/db/queries.ts` - sponsorship and kid reads
- `src/app/api/webhooks/stripe/route.ts` - the only place sponsorships are created

## Related API Routes

- `GET /api/sponsorship/available` - List available children (public)
- `POST /api/sponsor/verify` - Verify sponsor login
- `GET /api/sponsor/updates` - Get sponsor's child updates

## Related Documentation

- [Deployment Environment Variables](../../docs/deployment/VERCEL_ENV_VARS.md)
