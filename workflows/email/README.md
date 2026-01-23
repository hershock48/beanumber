# Email Workflows

This directory contains workflows for email-related operations.

## Available Workflows

| Workflow | Purpose | Status |
|----------|---------|--------|
| [verify-email-integration.md](verify-email-integration.md) | Verify Gmail/SendGrid is configured and working | Active |
| [notify-sponsor-of-update.md](notify-sponsor-of-update.md) | Notify sponsors when updates are published | Active |
| [send-sponsor-welcome.md](send-sponsor-welcome.md) | Send welcome email to new sponsors | Active |

## Email Architecture

The email system supports two providers:
- **Gmail** (primary): Uses Google Workspace via OAuth2
- **SendGrid** (fallback): Traditional email API

Gmail takes priority when both are configured.

## Related Tools

- `src/lib/tools/send-email.ts` - WAT-compliant email sending tool
- `src/lib/tools/email/send-update-notification.ts` - WAT-compliant sponsor notification tool
- `src/lib/tools/email/send-sponsor-welcome.ts` - WAT-compliant sponsor welcome email tool
- `src/lib/tools/email/send-admin-digest.ts` - WAT-compliant admin digest email tool
- `src/lib/email.ts` - Email service layer
- `src/lib/gmail.ts` - Gmail API client

## Related Documentation

- [Gmail Setup Guide](../../docs/setup/GMAIL_SETUP.md)
- [Deployment Environment Variables](../../docs/deployment/VERCEL_ENV_VARS.md)
