# Vercel Environment Variables

Set these in **Vercel Dashboard → beanumber → Settings → Environment Variables**. Kevin sets them; nothing in the repo reads a `.env` file in production.

Since 2026-09-14 nothing is required at boot. A missing variable fails the one feature that needs it with a clear log line instead of taking the site down. Airtable variables (`AIRTABLE_*`) are no longer read anywhere and can be deleted.

## Database (required for every data-backed page)

```
DATABASE_URL=postgresql://...        # Supabase transaction-mode pooler, port 6543
SUPABASE_URL=https://....supabase.co
SUPABASE_SERVICE_ROLE_KEY=...        # Storage uploads (kid photos, newsletter images)
```

## Stripe (required for checkout and the webhook)

```
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Email (required for every transactional email)

Choose one provider. Gmail takes priority if both are configured.

### Gmail (active in production)

See `docs/setup/GMAIL_SETUP.md` for the OAuth setup.

```
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
GMAIL_USER_EMAIL=Kevin@beanumber.org
GMAIL_FROM_EMAIL=Kevin@beanumber.org
GMAIL_FROM_NAME=Be A Number, International
```

### SendGrid (fallback)

```
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=Kevin@beanumber.org
SENDGRID_FROM_NAME=Be A Number, International
```

## Admin and cron

```
ADMIN_API_TOKEN=...      # X-Admin-Token header for scripts; the browser uses the session cookie
ADMIN_PASSWORD=...       # legacy header path, kept until the old admin pages retire
CRON_SECRET=...          # Vercel sends it as a Bearer token to /api/cron/*
```

## Printful (the seasonal dropship line, see docs/printful.md)

```
PRINTFUL_API_KEY=...            # private token for the API store
PRINTFUL_STORE_ID=...           # only if the token sees more than one store
PRINTFUL_WEBHOOK_SECRET=...     # any long random string; goes in the webhook URL
PRINTFUL_AUTO_CONFIRM=true      # leave UNSET for drafts Kevin confirms in Printful
```

Without `PRINTFUL_API_KEY`, seasonal orders still record a fulfillment row; they show in the admin Printful tab as failed with a Retry, and nothing is sent.

## Optional

```
NEXT_PUBLIC_SITE_URL=https://www.beanumber.org   # also builds the print-file URLs Printful fetches
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-...
ADMIN_NOTIFY_EMAIL=kevin@beanumber.org
KEVIN_ALERT_EMAIL=kevin@beanumber.org
```

The mobile app adds four more (Apple and Google sign-in, push). They are listed in `docs/app-store-submission.md`.

## After changing a variable

Redeploy. Vercel does not restart running functions when a variable changes.

## Testing after setup

1. Make a $1 donation on the live site and refund it in Stripe.
2. Check Vercel function logs for `/api/webhooks/stripe`.
3. Confirm the donor and donation rows in Supabase (`donors`, `donations`).
4. Confirm the thank-you email and the admin notification both arrived.
