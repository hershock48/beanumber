# Sponsor Update System Architecture

## Overview
A simple, secure system connecting sponsors to the children they support through private update pages.

## System Components

### 1. Airtable Tables

**Sponsorships Table** (or extend Donors table)
- Sponsor Code (unique, e.g., "BAN-2025-001")
- Sponsor Email
- Sponsor Name
- Child Name
- Child Photo
- Child Age
- Child Location
- Sponsorship Start Date
- Status (Active, Completed)

**Updates Table**
- Update ID (auto-generated)
- Sponsor Code (linked to Sponsorships)
- Update Date
- Update Type (Progress Report, Photo Update, Special Note)
- Title
- Content (long text)
- Photos (attachments - multiple)
- Status (Draft, Pending Review, Published, Rejected)
- Submitted By (field team member name)
- Submitted Date
- Reviewed By (staff name)
- Reviewed Date
- Published Date
- Requested By Sponsor (checkbox - if sponsor requested this update)

### 2. Website Pages

**Public Pages:**
- `/sponsor/login` - Login with email + sponsor code
- `/sponsor/request-update` - Public form for sponsors to request updates

**Private Pages (requires login):**
- `/sponsor/[code]` - Sponsor dashboard with updates feed
- `/sponsor/[code]/child` - Child profile page

**Admin Pages (optional, can use Airtable instead):**
- `/admin/updates/submit` - Field team form to submit updates
- `/admin/updates/review` - Staff review dashboard

### 3. API Routes

- `POST /api/sponsor/verify` - Verify email + sponsor code, create session
- `GET /api/sponsor/updates` - Get published updates for sponsor
- `POST /api/sponsor/request-update` - Sponsor requests new update
- `POST /api/admin/updates/submit` - Field team submits update
- `GET /api/admin/updates/pending` - Get pending updates for review
- `POST /api/admin/updates/publish` - Publish approved update

### 4. Authentication

**Simple Session-Based Auth:**
- No passwords required
- Email + Sponsor Code verification
- Session stored in HTTP-only cookie
- Session expires after 30 days of inactivity
- Sponsor code acts as "password"

**Security:**
- Sponsor codes are unique and not easily guessable
- Rate limiting on login attempts
- HTTPS only for all sponsor pages

## User Flows

### Sponsor Flow
1. Sponsor receives email with their Sponsor Code (e.g., "BAN-2025-001")
2. Sponsor visits `/sponsor/login`
3. Enters email + sponsor code
4. Redirected to `/sponsor/[code]` dashboard
5. Views updates feed, child profile
6. Can request new update (once per quarter)

### Field Team Flow
1. Field team member visits `/admin/updates/submit`
2. Selects sponsor code from dropdown (or enters manually)
3. Fills out update form:
   - Update type
   - Title
   - Content
   - Upload photos
   - Child's current status/activities
4. Submits - creates draft in Airtable
5. Staff reviews in Airtable
6. Staff publishes - update appears on sponsor's page

### Staff Review Flow
1. Staff opens Airtable Updates table
2. Filters for "Pending Review" status
3. Reviews update content and photos
4. Approves → Changes status to "Published"
5. Update automatically appears on sponsor's page

## Implementation Plan

### Phase 1: Core Sponsor Access
- [ ] Create sponsor login page
- [ ] Build session management
- [ ] Create sponsor dashboard page
- [ ] Connect to Airtable for sponsor verification

### Phase 2: Updates Display
- [ ] Create updates feed component
- [ ] Display child profile
- [ ] Show update history
- [ ] Photo gallery

### Phase 3: Update Submission
- [ ] Field team submission form
- [ ] Photo upload handling
- [ ] Save to Airtable as draft

### Phase 4: Update Request
- [ ] Sponsor request form
- [ ] Track request in Airtable
- [ ] Email notification to staff

### Phase 5: Review & Publishing
- [ ] Staff review interface (or use Airtable)
- [ ] Publish workflow
- [ ] Email notification to sponsor when update published

## Technical Details

### Sponsor Code Format
- Format: `BAN-YYYY-XXX` (e.g., BAN-2025-001)
- Generated when sponsorship begins
- Stored in Airtable
- Sent to sponsor via email

### Session Management
- Use Next.js cookies for session storage
- Store: email, sponsor code, expiration
- Middleware to protect sponsor routes

### Photo Handling
- Upload to Airtable attachments
- Display using Airtable attachment URLs
- Optimize images for web display

### Update Request Limiting
- Track last request date in Airtable
- Enforce 90-day minimum between requests
- Show countdown if too soon

## Airtable Automation Ideas

1. **Auto-generate Sponsor Code** when new sponsorship created
2. **Email sponsor** when update is published
3. **Remind field team** if no update in 3 months
4. **Quarterly update reminder** to sponsors
