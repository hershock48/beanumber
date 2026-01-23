# Sponsor Workflows

This directory contains workflows for sponsor-related operations.

## Available Workflows

| Workflow | Purpose | Status |
|----------|---------|--------|
| [verify-sponsor-login.md](verify-sponsor-login.md) | Authenticate sponsor login | Active |
| [list-available-children.md](list-available-children.md) | Display children awaiting sponsors | Active |
| [onboard-sponsor.md](onboard-sponsor.md) | Create new sponsorship | Active |

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

- `src/lib/tools/sponsors/list-available-children.ts` - WAT-compliant catalog tool
- `src/lib/tools/sponsors/create-sponsorship.ts` - WAT-compliant sponsorship creation

## Related API Routes

- `GET /api/sponsorship/available` - List available children (public)
- `POST /api/sponsorship/create` - Create new sponsorship (admin)
- `POST /api/sponsor/verify` - Verify sponsor login
- `GET /api/sponsor/updates` - Get sponsor's child updates

## Related Documentation

- [Deployment Environment Variables](../../docs/deployment/VERCEL_ENV_VARS.md)
