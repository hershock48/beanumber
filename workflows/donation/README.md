# Donation Workflows

This directory contains workflows for donation processing.

## Available Workflows

| Workflow | Purpose | Status |
|----------|---------|--------|
| [process-recurring-payment.md](process-recurring-payment.md) | Handle subscription renewals | Active |

## Donation Architecture

### Payment Flow

1. **Initial Donation**: Handled by `checkout.session.completed` webhook
2. **Recurring Payments**: Handled by `invoice.payment_succeeded` webhook

### Billing Reasons (Stripe)

| Reason | Description | Action |
|--------|-------------|--------|
| `subscription_cycle` | Regular monthly renewal | Process & send email |
| `subscription_create` | Initial subscription | Skip (handled by checkout) |
| `subscription_update` | Plan change | Skip |
| `manual` | Manual invoice | Skip |

## Related Tools

- `src/lib/tools/donation/process-recurring-payment.ts` - WAT-compliant recurring payment tool
- `src/lib/tools/donation/reconcile-subscriptions.ts` - WAT-compliant reconciliation tool
- `src/lib/email.ts` - Email service with recurring thank-you template

## Related API Routes

- `POST /api/create-checkout` - Create Stripe checkout session
- `POST /api/webhooks/stripe` - Handle Stripe webhook events

## Related Documentation

- [Deployment Environment Variables](../../docs/deployment/VERCEL_ENV_VARS.md)
