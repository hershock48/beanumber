# Critical & Semi-Critical Fixes

## 🔴 CRITICAL (Fix Before Production)

### 1. **URL Consistency Issue** ⚠️ HIGH PRIORITY
**Problem:** Mixed use of `beanumber.org` (no www) and `www.beanumber.org` across the codebase
- **Files affected:**
  - `src/app/layout.tsx` - Uses `https://beanumber.org` (no www)
  - `src/app/sitemap.ts` - Uses `https://beanumber.org` (no www)
  - `src/app/robots.ts` - Uses `https://beanumber.org` (no www)
  - `src/app/api/create-checkout/route.ts` - Uses `https://www.beanumber.org` (with www)
  - Most email templates use `www.beanumber.org`

**Impact:** 
- SEO issues (duplicate content)
- Potential redirect loops
- Inconsistent branding
- Analytics tracking issues

**Fix:** Standardize on one domain (recommend `www.beanumber.org`) and update all references.

---

### 2. **Admin Update Route Has No Authentication** 🔒 SECURITY CRITICAL
**Problem:** `/api/admin/updates/submit` is publicly accessible - anyone can submit updates
- **File:** `src/app/api/admin/updates/submit/route.ts`
- **Current state:** No authentication check
- **Risk:** Malicious users could spam updates or submit false information

**Fix:** Add authentication middleware or API token verification before processing requests.

**Recommended solution:**
```typescript
// Add at the top of POST handler
const adminToken = request.headers.get('Authorization')?.replace('Bearer ', '');
if (!adminToken || adminToken !== process.env.ADMIN_API_TOKEN) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

---

### 3. **Missing Maximum Donation Amount Validation** 💰
**Problem:** No upper limit on donation amounts - could allow accidental large donations or abuse
- **File:** `src/components/DonationSection.tsx` and `src/app/api/create-checkout/route.ts`
- **Current validation:** Only checks minimum ($1)
- **Risk:** User could accidentally enter $999,999 or maliciously attempt large transactions

**Fix:** Add maximum amount validation (e.g., $10,000 per transaction).

---

### 4. **Environment Variables Not Verified** ⚙️
**Problem:** No verification that all required environment variables are set in Vercel
- **Risk:** Site could deploy but fail silently when features are used
- **Affected features:** Stripe, Airtable, SendGrid, Sponsor system

**Required variables to verify:**
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `AIRTABLE_API_KEY`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_SPONSORSHIPS_TABLE`
- `AIRTABLE_UPDATES_TABLE`
- `AIRTABLE_DONORS_TABLE`
- `AIRTABLE_DONATIONS_TABLE`
- `AIRTABLE_COMMUNICATIONS_TABLE`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- `NEXT_PUBLIC_SITE_URL` (optional but recommended)

**Fix:** Create a health check endpoint or verify in Vercel dashboard before going live.

---

## 🟡 SEMI-CRITICAL (Fix Soon)

### 5. **Photo Upload Not Implemented** 📸
**Problem:** Admin update submission form accepts photos but doesn't process them
- **File:** `src/app/api/admin/updates/submit/route.ts` (line 103 has TODO comment)
- **Current state:** Photos are received but not uploaded to storage
- **Impact:** Field team must manually add photos in Airtable after submission

**Fix:** Implement photo upload to cloud storage (S3, Cloudinary, or Vercel Blob) and store URLs in Airtable.

---

### 6. **Missing Rate Limiting on Donation Endpoint** 🚦
**Problem:** `/api/create-checkout` has no rate limiting
- **Risk:** Could be abused to create many checkout sessions
- **Impact:** Potential Stripe API quota issues or costs

**Fix:** Add rate limiting middleware (e.g., 10 requests per minute per IP).

---

### 7. **Input Sanitization Missing** 🧹
**Problem:** Some user inputs are not sanitized before storing in Airtable
- **Affected fields:**
  - Admin update form: `title`, `content`, `submittedBy`
  - Sponsor update requests: content fields
- **Risk:** XSS attacks, data corruption

**Fix:** Add input sanitization/validation for all text fields.

---

### 8. **Sitemap Missing Important Pages** 🗺️
**Problem:** Sitemap doesn't include all public pages
- **Missing pages:**
  - `/donate/success` (though this might be intentional)
  - `/sponsor/login` (public page)
  - `/admin/updates/submit` (if this should be public)

**Fix:** Review and add any public pages that should be indexed.

---

### 9. **Error Messages Expose Internal Details** 🔍
**Problem:** Some error messages might expose internal system details
- **Example:** `src/app/api/admin/updates/submit/route.ts` returns raw Airtable errors
- **Risk:** Information disclosure to potential attackers

**Fix:** Return generic error messages to users, log detailed errors server-side only.

---

### 10. **No CSRF Protection on Forms** 🛡️
**Problem:** Forms don't have CSRF token protection
- **Affected:**
  - Admin update submission form
  - Sponsor login form
- **Risk:** Cross-site request forgery attacks

**Fix:** Add CSRF tokens or use Next.js built-in CSRF protection.

---

## 📋 Quick Action Checklist

### Before Production Launch:
- [ ] **Fix URL consistency** (standardize on www or non-www)
- [ ] **Add authentication to admin route**
- [ ] **Add maximum donation amount validation**
- [ ] **Verify all environment variables in Vercel**
- [ ] **Test donation flow end-to-end**
- [ ] **Test sponsor login flow**
- [ ] **Test webhook receives Stripe events**

### Within First Week:
- [ ] **Implement photo upload for admin form**
- [ ] **Add rate limiting to donation endpoint**
- [ ] **Add input sanitization**
- [ ] **Review and update sitemap**
- [ ] **Sanitize error messages**

### Nice to Have:
- [ ] **Add CSRF protection**
- [ ] **Add monitoring/alerting**
- [ ] **Set up error tracking (Sentry, etc.)**

---

## 🎯 Priority Order

1. **URL Consistency** - Quick fix, prevents SEO issues
2. **Admin Authentication** - Security critical
3. **Max Donation Validation** - Prevents abuse
4. **Environment Variables** - Required for functionality
5. **Photo Upload** - Improves UX
6. **Rate Limiting** - Prevents abuse
7. **Input Sanitization** - Security best practice
8. **Sitemap Updates** - SEO improvement
9. **Error Message Sanitization** - Security best practice
10. **CSRF Protection** - Security best practice
