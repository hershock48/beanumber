# Vercel Environment Variables Setup

## ✅ What You Have

- **Airtable Base ID**: `app73ZPGbM0BQTOZW`
- **Table Names**: Donors, Donations, Communications, Exports, Subscriptions

## ⚠️ What You Still Need

1. **Generate Airtable Personal Access Token** (you need to do this):
   - Go to https://airtable.com/create/tokens
   - Create token with name "Donor Management Webhook"
   - Scopes needed: `data.records:read`, `data.records:write`, `schema.bases:read`
   - Grant access to your "Donor Management" base
   - Copy the token (starts with `pat_`)

2. **Add All Environment Variables to Vercel**

## 📋 Complete Environment Variables for Vercel

Add these to **Vercel Dashboard → Your Project → Settings → Environment Variables**:

### Airtable Configuration (REQUIRED)

```
AIRTABLE_API_KEY=pat_your_personal_access_token_here
AIRTABLE_BASE_ID=app73ZPGbM0BQTOZW
AIRTABLE_DONORS_TABLE=Donors
AIRTABLE_DONATIONS_TABLE=Donations
AIRTABLE_COMMUNICATIONS_TABLE=Communications
AIRTABLE_SPONSORSHIPS_TABLE=Sponsorships
AIRTABLE_UPDATES_TABLE=Updates
```

**Note:** The Exports and Subscriptions tables are optional for the webhook - they're used by other parts of the system.

### Stripe Configuration (REQUIRED - you should already have these)

```
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Email Configuration (REQUIRED for thank-you emails)

Choose ONE provider: Gmail (recommended) or SendGrid. Gmail takes priority if both are configured.

#### Option 1: Gmail (Recommended)

Uses Gmail API via Google Workspace. See `docs/setup/GMAIL_SETUP.md` for full setup instructions.

```
GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret
GMAIL_REFRESH_TOKEN=your_gmail_refresh_token
GMAIL_USER_EMAIL=Kevin@beanumber.org
GMAIL_FROM_EMAIL=Kevin@beanumber.org
GMAIL_FROM_NAME=Be A Number, International
```

#### Option 2: SendGrid (Alternative)

```
SENDGRID_API_KEY=SG.your_api_key_here
SENDGRID_FROM_EMAIL=Kevin@beanumber.org
SENDGRID_FROM_NAME=Be A Number, International
```

### Optional Configuration

```
NEXT_PUBLIC_SITE_URL=https://www.beanumber.org
NODE_ENV=production
```

## 🔒 Security Notes

- ✅ **Never commit tokens to git** (they're already in `.gitignore`)
- ✅ **Use different tokens for dev/prod** if you have multiple environments
- ✅ **Rotate tokens periodically** for security
- ✅ **Select all environments** (Development, Preview, Production) when adding to Vercel

## ✅ Quick Checklist

- [ ] Generate Airtable Personal Access Token
- [ ] Add `AIRTABLE_API_KEY` to Vercel
- [ ] Add `AIRTABLE_BASE_ID` to Vercel (already have: `app73ZPGbM0BQTOZW`)
- [ ] Add `AIRTABLE_DONORS_TABLE=Donors` to Vercel
- [ ] Add `AIRTABLE_DONATIONS_TABLE=Donations` to Vercel
- [ ] Add `AIRTABLE_COMMUNICATIONS_TABLE=Communications` to Vercel
- [ ] Verify Stripe variables are set
- [ ] Add email provider variables (Gmail OR SendGrid)
  - [ ] If Gmail: Add all `GMAIL_*` variables
  - [ ] If SendGrid: Add `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL`
- [ ] Redeploy on Vercel after adding variables
- [ ] Test with a small donation

## 🧪 Testing After Setup

1. Make a test donation on your site
2. Check Vercel Function Logs for webhook processing
3. Verify record appears in Airtable Donors table
4. Verify record appears in Airtable Donations table
5. Verify record appears in Airtable Communications table
6. Check that thank-you email was sent

## 📝 Notes

- **Table IDs vs Table Names**: The webhook uses table **names** (Donors, Donations, etc.), not the internal table IDs. This is more maintainable.
- **Exports Table**: Handled by the export script, not the webhook
- **Subscriptions Table**: Can be added later if you need to track recurring donations separately
