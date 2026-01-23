# Daily Admin Digest Workflow

## Objective

Send a daily summary email to the admin with pending updates, overdue children, and key metrics.

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| adminEmail | string | No | Email to send digest (default: ADMIN_EMAIL env or Kevin@beanumber.org) |
| includeOverdue | boolean | No | Include overdue section (default: true) |
| overdueThresholdDays | number | No | Days to consider overdue (default: 90) |

## Prerequisites

- ADMIN_API_TOKEN environment variable configured
- Email provider configured (Gmail or SendGrid)
- ADMIN_EMAIL environment variable (optional)

## Steps

### Step 1: Trigger Digest (Manual)

**Tool**: `POST /api/admin/digest`

**API Request**:
```http
POST /api/admin/digest
X-Admin-Token: {adminToken}
Content-Type: application/json

{
  "adminEmail": "kevin@beanumber.org"
}
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "messageId": "...",
    "provider": "gmail",
    "summary": {
      "pendingUpdates": 3,
      "overdueChildren": 5,
      "totalActiveSponsorships": 25
    },
    "generatedAt": "2025-01-22T08:00:00Z"
  },
  "message": "Admin digest sent successfully"
}
```

### Step 2: Trigger Digest (Automated via Cron)

For automated daily digests, set up a cron job or Vercel Cron:

**vercel.json** (example):
```json
{
  "crons": [
    {
      "path": "/api/admin/digest",
      "schedule": "0 8 * * *"
    }
  ]
}
```

Note: Cron triggers need special authentication handling. Consider using a cron secret.

### Step 3: Review Email

The admin receives an email containing:
- Summary stats (pending updates, overdue children, total sponsorships)
- Link to admin dashboard
- Table of pending updates
- Table of overdue children (top 10)

## Email Content

The digest email includes:

### Summary Section
- Number of pending updates awaiting review
- Number of children with overdue updates
- Total active sponsorships

### Pending Updates Table
- Update title
- Sponsor code
- Submitted by
- Submission date

### Overdue Children Table (if enabled)
- Child name
- Sponsor code
- Days since last update (or "Never")

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| messageId | string | Email message ID |
| provider | string | Email provider used |
| summary | object | Counts for pending, overdue, total |
| generatedAt | string | ISO timestamp |

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| 401 Unauthorized | Invalid/missing admin token | Check ADMIN_API_TOKEN |
| Invalid email | Bad adminEmail format | Use valid email address |
| Email send failed | Provider error | Check email configuration |
| Database error | Airtable API issue | Check Airtable status |

## Automation Ideas

1. **Daily Morning Digest**: Send at 8 AM local time
2. **Weekly Summary**: Aggregate data over the week
3. **Alert Threshold**: Only send if pending > 0 or overdue > X
4. **Slack Integration**: Post digest to Slack channel instead

## Related Files

- Digest API: `src/app/api/admin/digest/route.ts`
- Digest Tool: `src/lib/tools/email/send-admin-digest.ts`
- Overdue Tool: `src/lib/tools/updates/list-overdue.ts`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| ADMIN_API_TOKEN | Yes | Admin authentication token |
| ADMIN_EMAIL | No | Default admin email address |
| Gmail/SendGrid vars | Yes | Email provider configuration |

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-01-22 | Initial workflow creation | Claude |
