# Notify Sponsor of Update Workflow

## Objective

Send an email notification to a sponsor when a new update about their sponsored child has been published.

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| updateId | string | Yes | The Airtable record ID of the published update |
| adminToken | string | Yes | Admin authentication token |

## Prerequisites

- Update must be published (Status = "Published")
- Update must have a SponsorCode
- Sponsorship must exist for that SponsorCode
- Sponsor must have an email address
- Email provider configured (Gmail or SendGrid)

## Steps

### Step 1: Verify Update is Published

**Tool**: `src/lib/airtable.ts` (getUpdateById)

Fetch the update and verify:
- It exists
- Status is "Published"
- Has a SponsorCode

### Step 2: Get Sponsor Information

**Tool**: `src/lib/airtable.ts` (findSponsorshipBySponsorCode)

Fetch the sponsorship to get:
- SponsorEmail
- SponsorName
- ChildDisplayName

### Step 3: Send Notification Email

**Tool**: `src/lib/tools/email/send-update-notification.ts`

Send the notification email with update preview.

**API Request** (via dashboard or direct API):
```http
POST /api/admin/updates/notify
X-Admin-Token: {adminToken}
Content-Type: application/json

{
  "updateId": "rec123abc"
}
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "updateId": "rec123abc",
    "notificationSent": true,
    "provider": "gmail",
    "recipientEmail": "sponsor@example.com"
  },
  "message": "Notification sent successfully"
}
```

## Using the Dashboard

The admin dashboard (`/admin/dashboard`) provides two publish options:

1. **Publish Only**: Publishes the update without sending notification
2. **Publish & Notify**: Publishes and immediately sends notification to sponsor

The "Publish & Notify" button only appears if the update has a sponsor code.

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| notificationSent | boolean | Whether notification was sent |
| provider | string | Email provider used (gmail/sendgrid/disabled) |
| recipientEmail | string | Sponsor's email address |

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Update not found | Invalid updateId | Verify record exists |
| Update not published | Status is not "Published" | Publish the update first |
| No sponsor code | Update has no SponsorCode | Add sponsor code to update |
| Sponsorship not found | Invalid sponsor code | Verify sponsorship exists |
| Sponsor has no email | Missing SponsorEmail | Add email to sponsorship |
| Email send failed | Provider error | Check email configuration |

## Email Content

The notification email includes:
- Child's name in header
- Sponsor's name for personalization
- Update title
- Preview of update content (first 200 characters)
- Link to sponsor login page
- Be A Number branding

## Notes

- Notifications can be sent separately after publishing
- Preview is automatically truncated to 200 characters
- Email template is in `src/lib/email.ts` (sendUpdateNotificationEmail)
- Logs are written for all notification attempts

## Related Files

- Notify API: `src/app/api/admin/updates/notify/route.ts`
- Notification Tool: `src/lib/tools/email/send-update-notification.ts`
- Email Template: `src/lib/email.ts` (sendUpdateNotificationEmail)
- Dashboard UI: `src/app/admin/dashboard/page.tsx`

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-01-22 | Initial workflow creation | Claude |
