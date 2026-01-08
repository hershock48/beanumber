# Donation System Setup Guide

This guide will help you set up the complete donation tracking system with Airtable, SendGrid, and Stripe webhooks.

## Overview

The system includes:
1. **Stripe Webhook** - Automatically captures donation data
2. **Airtable Integration** - Stores donor information in a database
3. **SendGrid Emails** - Sends automated thank-you emails
4. **Monthly Export Script** - Exports donor data to CSV

---

## Step 1: Set Up Stripe Webhook

### 1.1 Get Your Webhook Secret

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → Developers → Webhooks
2. Click "Add endpoint"
3. Set the endpoint URL to: `https://www.beanumber.org/api/webhooks/stripe`
4. Select these events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `invoice.payment_succeeded`
5. Click "Add endpoint"
6. Copy the **Signing secret** (starts with `whsec_`)

### 1.2 Add to Vercel Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables, add:

```
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

---

## Step 2: Set Up Airtable Database

### 2.1 Create Airtable Base

1. Go to [Airtable](https://airtable.com) and create a new base
2. Name it "Be A Number Donor Management" or similar
3. Create these tables: **Donors**, **Donations**, **Communications**, **Exports**, **Subscriptions**

### 2.2 Create Fields in Airtable

**Donors Table** - Create these fields:

| Field Name | Type | Notes |
|------------|------|-------|
| Email | Email | Required |
| Name | Single line text | Required |
| Organization | Single line text | Optional |
| Amount | Number (2 decimal places) | Required |
| Currency | Single select | Options: USD, EUR, etc. |
| Donation Type | Single select | Options: one-time, monthly |
| Is Recurring | Checkbox | |
| Payment Date | Date | |
| Session ID | Single line text | Stripe session ID |
| Payment Intent ID | Single line text | Stripe payment intent ID |
| Subscription ID | Single line text | For recurring donations |
| Address Line 1 | Single line text | |
| City | Single line text | |
| State | Single line text | |
| Postal Code | Single line text | |
| Country | Single line text | |

### 2.3 Get Airtable API Credentials

1. Go to [Airtable Account](https://airtable.com/account) → API
2. Copy your **Personal access token** (starts with `pat_`)
3. Go to your base → Help → API documentation
4. Copy your **Base ID** (starts with `app`)
5. Note your **Table Name** (should be "Donations")

### 2.4 Add to Vercel Environment Variables

```
AIRTABLE_API_KEY=pat_your_personal_access_token
AIRTABLE_BASE_ID=app_your_base_id
AIRTABLE_TABLE_NAME=Donations
```

---

## Step 3: Set Up SendGrid for Thank-You Emails

### 3.1 Create SendGrid Account

1. Go to [SendGrid](https://sendgrid.com) and sign up (free tier available)
2. Verify your sender email address (Kevin@beanumber.org)
3. Go to Settings → API Keys
4. Click "Create API Key"
5. Name it "Be A Number Donations"
6. Give it "Full Access" or "Mail Send" permissions
7. Copy the API key (you'll only see it once!)

### 3.2 Add to Vercel Environment Variables

```
SENDGRID_API_KEY=SG.your_api_key_here
SENDGRID_FROM_EMAIL=Kevin@beanumber.org
```

---

## Step 4: Test the System

### 4.1 Test Webhook

1. Make a test donation on your site
2. Check Vercel Function Logs for webhook events
3. Verify the donation appears in Airtable
4. Check that the thank-you email was sent

### 4.2 Test Monthly Export

Run the export script:

```bash
npm run export-donors
```

Or for a specific date range:

```bash
npm run export-donors -- --start 2025-01-01 --end 2025-01-31
```

The CSV file will be saved to `exports/donor-export-YYYY-MM-DD.csv`

---

## Step 5: Optional - Set Up Automated Monthly Exports

You can set up a cron job or scheduled task to run the export monthly:

### Option A: GitHub Actions (Recommended)

Create `.github/workflows/monthly-export.yml`:

```yaml
name: Monthly Donor Export

on:
  schedule:
    - cron: '0 0 1 * *' # First day of every month at midnight UTC
  workflow_dispatch: # Allow manual trigger

jobs:
  export:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run export-donors
        env:
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
      - uses: actions/upload-artifact@v3
        with:
          name: donor-export
          path: exports/*.csv
```

### Option B: Vercel Cron Job

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/export-donors",
      "schedule": "0 0 1 * *"
    }
  ]
}
```

Then create `src/app/api/cron/export-donors/route.ts` that calls the export function.

---

## Troubleshooting

### Webhook Not Receiving Events

1. Check Stripe Dashboard → Webhooks → Your endpoint
2. Look for failed deliveries and error messages
3. Verify `STRIPE_WEBHOOK_SECRET` is set correctly in Vercel
4. Check Vercel Function Logs for errors

### Airtable Not Saving

1. Verify API key has correct permissions
2. Check Base ID and Table Name are correct
3. Ensure field names match exactly (case-sensitive)
4. Check Vercel logs for Airtable API errors

### Emails Not Sending

1. Verify SendGrid API key is correct
2. Check sender email is verified in SendGrid
3. Look for SendGrid errors in Vercel logs
4. Check SendGrid Activity Feed for delivery status

---

## Environment Variables Summary

Add all of these to Vercel:

```
# Stripe (already set)
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Stripe Webhook (NEW)
STRIPE_WEBHOOK_SECRET=whsec_...

# Airtable (NEW)
AIRTABLE_API_KEY=pat_...
AIRTABLE_BASE_ID=app_...
AIRTABLE_TABLE_NAME=Donations

# SendGrid (NEW)
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=Kevin@beanumber.org
```

---

## Next Steps

1. ✅ Set up Stripe webhook
2. ✅ Create Airtable base and get credentials
3. ✅ Set up SendGrid account
4. ✅ Add all environment variables to Vercel
5. ✅ Test with a small donation
6. ✅ Set up monthly export automation (optional)

Once everything is set up, every donation will automatically:
- Be saved to Airtable
- Trigger a thank-you email
- Be available for monthly export
