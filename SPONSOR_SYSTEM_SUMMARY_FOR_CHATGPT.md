# Sponsor Update System - Summary for ChatGPT

## What We've Built

We've created a complete sponsor update system for Be A Number, International that connects donors (sponsors) directly to the children they support through a private web portal.

### System Components

#### 1. **Sponsor Portal (Public Access)**
- **Login Page** (`/sponsor/login`): Simple authentication using email + unique sponsor code
- **Sponsor Dashboard** (`/sponsor/[code]`): Private page showing:
  - Child profile (name, photo, age, location)
  - Updates feed (published updates about the child)
  - "Request Update" button (limited to once per quarter/90 days)

#### 2. **Field Team Submission Form**
- **Admin Form** (`/admin/updates/submit`): Form for field team to submit child updates
- Includes: sponsor code, update type, title, content, photos, submitter name
- Creates draft records in Airtable for staff review

#### 3. **API Routes**
- `POST /api/sponsor/verify` - Verifies email + sponsor code, creates session cookie
- `GET /api/sponsor/updates` - Fetches published updates for a sponsor
- `POST /api/sponsor/request-update` - Handles sponsor update requests (90-day throttle)
- `POST /api/sponsor/logout` - Logs out sponsor
- `POST /api/admin/updates/submit` - Field team submits new update

#### 4. **Authentication System**
- Simple session-based auth (no passwords)
- Uses HTTP-only cookies for security
- Session expires after 30 days
- Sponsor code acts as "password"

### Technical Stack
- **Framework**: Next.js 16.1.1 (App Router)
- **Database**: Airtable (via REST API)
- **Authentication**: Cookie-based sessions
- **Deployment**: Vercel

---

## Airtable Setup

### Base Configuration
- **Base ID**: `app73ZPGbM0BQTOZW`
- **API Key**: Personal Access Token (configured in Vercel)

### Tables Created

#### 1. **Sponsorships Table**
This is the primary table that links sponsors to children.

**Key Fields:**
- `SponsorCode` (Single line text) - Unique identifier like "BAN-2025-001"
- `SponsorEmail` (Email) - Sponsor's email address
- `ChildID` (Single line text) - Stable internal child identifier (primary join key)
- `ChildDisplayName` (Single line text) - Display name for the child
- `ChildPhoto` (Attachment) - Child's photo
- `ChildAge` (Single line text) - Optional
- `ChildLocation` (Single line text) - Optional
- `SponsorshipStartDate` (Date) - Optional
- `LastRequestAt` (Date/time) - When sponsor last requested update
- `NextRequestEligibleAt` (Date/time) - When next request is allowed (90 days from last request)
- `AuthStatus` (Single select) - **"Active"** or "Revoked" (must be "Active" to login)
- `Status` (Single select) - Sponsorship status
- `VisibleToSponsor` (Checkbox) - **Must be checked** for sponsor to access

**Test Record:**
- SponsorCode: `BAN-2025-001`
- SponsorEmail: `kevin@beanumber.org`
- ChildID: `CHILD-001`
- ChildDisplayName: `Test Child`
- AuthStatus: `Active`
- VisibleToSponsor: ✅ (checked)

#### 2. **Updates Table**
Stores child update records that are linked to sponsors via ChildID.

**Key Fields:**
- `ChildID` (Single line text) - **Primary join key** - links to Sponsorships table
- `SponsorCode` (Single line text) - Optional linking field
- `UpdateType` (Single select) - Progress Report, Photo Update, Special Note, etc.
- `Title` (Single line text) - Update title
- `Content` (Long text) - Update content
- `Photos` (Attachment) - Multiple photos allowed
- `Status` (Single select) - **"Pending Review"**, **"Published"**, or "Rejected"
- `VisibleToSponsor` (Checkbox) - **Must be TRUE** for sponsor to see update
- `RequestedBySponsor` (Checkbox) - If sponsor requested this update
- `RequestedAt` (Date/time) - When update was requested
- `PublishedAt` (Date/time) - When update was published
- `SubmittedBy` (Single line text) - Field team member name

**Workflow:**
1. Field team submits → `Status = "Pending Review"`, `VisibleToSponsor = FALSE`
2. Staff reviews in Airtable
3. Staff publishes → `Status = "Published"`, `VisibleToSponsor = TRUE`, `PublishedAt = now()`
4. Update appears on sponsor's dashboard

### Environment Variables (Vercel)
```
AIRTABLE_API_KEY=pat_...
AIRTABLE_BASE_ID=app73ZPGbM0BQTOZW
AIRTABLE_SPONSORSHIPS_TABLE=Sponsorships
AIRTABLE_UPDATES_TABLE=Updates
```

---

## Current Problem

### Issue: Login Form Accepts Credentials But Page Just Reloads

**Symptoms:**
- User enters email (`kevin@beanumber.org`) and sponsor code (`BAN-2025-001`)
- Form appears to accept/submit (button shows "Verifying...")
- Page reloads but stays on login page
- No error message shown
- No redirect to dashboard

**What We've Tried:**
1. Added console logging to see API response
2. Added fallback redirect using `window.location.href`
3. Verified form submission prevents default
4. Checked that API route returns `sponsorCode` in response

**Possible Causes:**
1. **API Route Issue**: The `/api/sponsor/verify` endpoint might be:
   - Not finding the record in Airtable (field name mismatch?)
   - Returning error but it's not being caught
   - Cookie not being set properly
   - Response format issue

2. **Airtable Query Issue**: The formula might not be matching:
   - Field names don't match exactly (case-sensitive)
   - Record doesn't exist
   - `AuthStatus` not set to "Active"
   - `VisibleToSponsor` not checked

3. **Client-Side Issue**: 
   - JavaScript error preventing redirect
   - Router not working
   - Response not being parsed correctly

**Debugging Steps Needed:**
1. Check browser console for:
   - "Verify response:" log showing API response
   - Any JavaScript errors
   - Network tab showing the API request/response

2. Check Vercel Function Logs for:
   - API route execution
   - Airtable API errors
   - Any exceptions

3. Verify Airtable record exists with exact field names:
   - `SponsorEmail` (not `Email Address`)
   - `SponsorCode` (not `Sponsor Code`)
   - `AuthStatus` = "Active" (exact match)
   - `VisibleToSponsor` = checked

**Code Location:**
- Login form: `src/app/sponsor/login/page.tsx`
- Verify API: `src/app/api/sponsor/verify/route.ts`
- Dashboard page: `src/app/sponsor/[code]/page.tsx`

---

## How the System Should Work

### Sponsor Flow:
1. Sponsor visits `/sponsor/login`
2. Enters email + sponsor code
3. System queries Airtable: `AND({SponsorEmail} = "email", {SponsorCode} = "code")`
4. Checks: `AuthStatus = "Active"` AND `VisibleToSponsor = TRUE`
5. Creates session cookie
6. Redirects to `/sponsor/[code]` dashboard
7. Dashboard loads child info and published updates from Airtable

### Field Team Flow:
1. Visit `/admin/updates/submit`
2. Enter sponsor code, update details, photos
3. System finds ChildID from Sponsorships table
4. Creates update record with `Status = "Pending Review"`
5. Staff reviews in Airtable
6. Staff publishes (changes status to "Published", sets `VisibleToSponsor = TRUE`)
7. Update appears on sponsor's dashboard

---

## Key Technical Details

### Field Name Mapping (Critical!)
The code uses these **exact** field names (case-sensitive):
- `SponsorCode` (not `Sponsor Code`)
- `SponsorEmail` (not `Email Address`)
- `ChildID` (primary join key)
- `ChildDisplayName` (not `Child Name`)
- `AuthStatus` (must be exactly "Active")
- `VisibleToSponsor` (boolean checkbox)

### Request Throttling
- Uses `NextRequestEligibleAt` field
- Automatically set to 90 days in future when sponsor requests update
- Check: `new Date() >= NextRequestEligibleAt` to allow request

### Update Visibility
Updates only show to sponsor if:
- `Status = "Published"` (exact match)
- `VisibleToSponsor = TRUE` (checked)
- `ChildID` matches between Sponsorships and Updates tables

---

## Next Steps to Fix

1. **Verify Airtable Record**: Confirm test record exists with exact field names
2. **Check Browser Console**: Look for API response and any errors
3. **Check Vercel Logs**: See if API route is executing and what it returns
4. **Test API Directly**: Try calling `/api/sponsor/verify` directly with Postman/curl
5. **Verify Cookie Setting**: Check if session cookie is being created
6. **Check Redirect**: Verify router.push is working or use window.location fallback

---

## Files to Review

- `src/app/sponsor/login/page.tsx` - Login form
- `src/app/api/sponsor/verify/route.ts` - Verification API
- `src/app/sponsor/[code]/page.tsx` - Dashboard page
- `src/components/SponsorDashboard.tsx` - Dashboard component
- `src/app/api/sponsor/updates/route.ts` - Updates API
- `AIRTABLE_FIELD_REFERENCE.md` - Field mapping reference

---

## Summary

We have a complete sponsor update system built, but the login flow is broken - the form accepts credentials but doesn't redirect to the dashboard. The system uses Airtable with specific field names (`SponsorCode`, `SponsorEmail`, `ChildID`, etc.) and requires exact matches. The issue is likely in the API verification step or the redirect logic after successful authentication.
