# Test Sponsorship Setup Guide

## Quick Setup in Airtable

Create a test sponsorship record in your **Sponsorships** table with these values:

### Required Fields

| Field | Value |
|-------|-------|
| **SponsorCode** | `BAN-2025-001` |
| **SponsorEmail** | `kevin@beanumber.org` |
| **ChildID** | `CHILD-001` (or any unique identifier) |
| **ChildDisplayName** | `Test Child` (or any name) |
| **AuthStatus** | `Active` |
| **VisibleToSponsor** | ✅ (checked) |

### Optional Fields

| Field | Value (Optional) |
|-------|------------------|
| **ChildAge** | `8` |
| **ChildLocation** | `Northern Uganda` |
| **SponsorshipStartDate** | Today's date |
| **ChildPhoto** | Upload a photo if you have one |

## Testing the System

### 1. Test Sponsor Login

1. Visit: `https://www.beanumber.org/sponsor/login`
2. Enter:
   - **Email**: `kevin@beanumber.org`
   - **Sponsor Code**: `BAN-2025-001`
3. Click "Access Portal"
4. You should be redirected to `/sponsor/BAN-2025-001`

### 2. Test Sponsor Dashboard

Once logged in, you should see:
- Child profile (name, photo if uploaded)
- Updates feed (empty until updates are published)
- "Request Update" button

### 3. Test Update Request

1. Click "Request Update" button
2. System should:
   - Create a record in Updates table
   - Set `LastRequestAt` and `NextRequestEligibleAt` (90 days from now)
   - Show success message

### 4. Test Field Team Submission

1. Visit: `https://www.beanumber.org/admin/updates/submit`
2. Fill out the form:
   - **Sponsor Code**: `BAN-2025-001`
   - **Update Type**: Choose from dropdown
   - **Title**: e.g., "Progress in School"
   - **Content**: Write update content
   - **Your Name**: Your name
3. Submit
4. Check Airtable Updates table - should see record with:
   - `Status`: "Pending Review"
   - `VisibleToSponsor`: FALSE
   - `ChildID`: Should match the ChildID from Sponsorships

### 5. Test Publishing Update

1. Open Airtable Updates table
2. Find the update you just submitted
3. Change:
   - `Status`: "Published"
   - `VisibleToSponsor`: ✅ (checked)
   - `PublishedAt`: Today's date/time
4. Go back to sponsor dashboard
5. Refresh the page
6. Update should now appear in the feed!

## Using the Test Script

Alternatively, you can use the automated script:

```bash
npm run create-test-sponsorship
```

Or with custom values:

```bash
npm run create-test-sponsorship -- --sponsorCode BAN-2025-002 --email kevin@beanumber.org --childID CHILD-002 --childName "Another Child"
```

## Troubleshooting

### Login Fails
- Check that `AuthStatus` is set to "Active" (not "Revoked")
- Check that `VisibleToSponsor` is checked
- Verify email and sponsor code match exactly (case-sensitive)

### Updates Not Showing
- Check that `Status` is "Published" (not "Pending Review")
- Check that `VisibleToSponsor` is checked
- Verify `ChildID` matches between Sponsorships and Updates tables
- Check that `PublishedAt` is set

### Request Update Button Disabled
- Check `NextRequestEligibleAt` date in Sponsorships table
- Must be in the past to allow requests
- System automatically sets to 90 days in future after request

## Next Steps

Once testing works:
1. Create real sponsorship records for actual sponsors
2. Generate unique SponsorCodes for each sponsor
3. Send sponsor codes to sponsors via email
4. Field team can start submitting updates
5. Staff reviews and publishes updates in Airtable
