# Pre-Deployment Checklist

This checklist covers everything needed before deploying the refactored Be A Number website.

## 1. Generate Admin API Token

The admin token is required for the field team to submit updates. Generate it with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Example output:**
```
a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

**IMPORTANT:**
- Save this token securely (password manager)
- Share it ONLY with authorized field team members
- Add it to Vercel environment variables as `ADMIN_API_TOKEN`

## 2. Environment Variables Setup

### Required Variables (Production)

Add these to your Vercel project settings:

```bash
# Airtable Configuration
AIRTABLE_API_KEY=your_actual_airtable_api_key
AIRTABLE_BASE_ID=your_actual_base_id
AIRTABLE_SPONSORSHIPS_TABLE=Sponsorships
AIRTABLE_UPDATES_TABLE=Updates

# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_your_actual_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_actual_webhook_secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_actual_publishable_key

# Admin Authentication
ADMIN_API_TOKEN=your_generated_token_from_step_1

# Site URL
NEXT_PUBLIC_SITE_URL=https://www.beanumber.org
```

### Optional Variables (Recommended)

```bash
# SendGrid Email Service
SENDGRID_API_KEY=SG.your_sendgrid_api_key
SENDGRID_FROM_EMAIL=info@beanumber.org
SENDGRID_FROM_NAME=Be A Number, International

# Google Analytics
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

## 3. Install SendGrid Dependency

The email service requires the SendGrid SDK. Install it:

```bash
npm install @sendgrid/mail
```

Then commit the package.json changes:

```bash
git add package.json package-lock.json
git commit -m "Add SendGrid email service dependency"
```

## 4. Test Locally

Before deploying, test the changes locally:

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start development server
npm run dev
```

### Test These Features:

- [ ] Homepage loads with new social proof metrics
- [ ] "Join 100+ Donors" headline appears in donation section
- [ ] Grassroots origin story section displays
- [ ] Sponsor Login link appears in navigation
- [ ] Donation button shows spinner when clicked
- [ ] Toast notifications appear instead of alerts

## 5. Stripe Webhook Configuration

After deployment, update your Stripe webhook endpoint:

1. Go to Stripe Dashboard > Developers > Webhooks
2. Update the endpoint URL to: `https://www.beanumber.org/api/webhooks/stripe`
3. Ensure these events are selected:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `invoice.payment_succeeded`

## 6. SendGrid Setup (Optional but Recommended)

If using email notifications:

1. Create a SendGrid account (free tier available)
2. Generate an API key with "Full Access" or "Mail Send" permissions
3. Verify sender email address (info@beanumber.org)
4. Add `SENDGRID_API_KEY` to Vercel environment variables

**Benefits of email service:**
- Automatic donation receipts
- Sponsor welcome emails
- Update notifications
- Better user experience

## 7. Security Verification

- [ ] `ADMIN_API_TOKEN` is set (required for admin endpoints)
- [ ] All Stripe keys are production keys (start with `pk_live_` and `sk_live_`)
- [ ] Webhook secret is from production webhook endpoint
- [ ] Airtable API key has appropriate permissions

## 8. Deployment Steps

### Via Vercel (Recommended)

1. Push all changes to GitHub:
   ```bash
   git add .
   git commit -m "Complete refactoring with email service and UX improvements"
   git push origin main
   ```

2. Vercel will automatically deploy if connected to your repo

3. Or manually trigger deployment:
   ```bash
   vercel --prod
   ```

### Verify Deployment

After deployment completes:

- [ ] Visit https://www.beanumber.org
- [ ] Check homepage displays correctly
- [ ] Test sponsor login flow
- [ ] Test donation flow (use Stripe test card: 4242 4242 4242 4242)
- [ ] Check Vercel logs for any errors

## 9. Post-Deployment Monitoring

### First 24 Hours

Monitor these areas:

1. **Vercel Dashboard:**
   - Check for 500 errors
   - Monitor function execution times
   - Review logs for unexpected errors

2. **Stripe Dashboard:**
   - Verify webhook events are received
   - Check successful payment processing

3. **Airtable:**
   - Verify sponsor logins create proper sessions
   - Check update requests are recorded

### Error Handling

If issues arise:

1. Check Vercel function logs for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure Stripe webhook endpoint is active
4. Check Airtable API permissions

## 10. Share Admin Token with Field Team

Once deployment is confirmed working:

1. Share the `ADMIN_API_TOKEN` securely with authorized field staff
2. Provide instructions for using the admin API:

**Admin API Usage:**

```bash
# Submit an update
curl -X POST https://www.beanumber.org/api/admin/updates/submit \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN_HERE" \
  -d '{
    "childId": "CHD-001",
    "sponsorCode": "BAN-2024-001",
    "updateType": "Progress Report",
    "title": "Great progress this term",
    "content": "The child is doing well in school...",
    "submittedBy": "Field Team Member Name"
  }'
```

## Summary of Changes Deployed

### 🔧 Infrastructure Improvements
- ✅ Centralized constants and configuration
- ✅ Type-safe validation library
- ✅ Structured logging system
- ✅ Standardized error handling
- ✅ Rate limiting on all endpoints
- ✅ Database abstraction layer

### 🔒 Security Improvements
- ✅ Admin endpoint authentication (CRITICAL FIX)
- ✅ Input validation and sanitization
- ✅ Session security improvements
- ✅ Rate limiting to prevent abuse

### 🎨 UX Improvements
- ✅ Toast notifications (no more browser alerts)
- ✅ Loading states on donation button
- ✅ Social proof metrics (15 years, 100+ donors, $150K)
- ✅ Grassroots origin story section
- ✅ "Join 100+ Donors" CTA
- ✅ Sponsor Login link in navigation

### 📧 Email Service
- ✅ SendGrid integration ready
- ✅ Welcome emails for new sponsors
- ✅ Update notification emails
- ✅ Donation receipt emails
- ✅ Update request confirmations

### 🐛 Bug Fixes
- ✅ Fixed sponsor login redirect issue
- ✅ Improved error messages throughout
- ✅ Better session management

## Need Help?

If you encounter issues during deployment:

1. Check the detailed implementation guide: `IMPLEMENTATION_GUIDE.md`
2. Review environment setup: `.env.local.example`
3. Check recent git commits for reference
4. Review Vercel deployment logs

---

**Deployment Ready!** ✅

All refactoring is complete and the application is ready for production deployment.
