# Overdue Updates Reminder Workflow

## Objective

Identify children who haven't received updates recently so the admin can coordinate with field team to get fresh content.

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| adminToken | string | Yes | Admin authentication token |
| thresholdDays | number | No | Days since last update to consider overdue (default: 90) |

## Prerequisites

- ADMIN_API_TOKEN environment variable configured
- Airtable Sponsorships and Updates tables accessible

## Steps

### Step 1: Access Admin Dashboard

**Tool**: Manual / Admin Dashboard UI

Navigate to `/admin/dashboard` and authenticate with admin token.

### Step 2: View Overdue Updates Tab

**Tool**: Manual / Dashboard UI

Click the "Overdue Updates" tab to see children needing updates.

### Step 3: Query Overdue Data (Programmatic)

**Tool**: `GET /api/admin/updates/overdue` → `src/lib/tools/updates/list-overdue.ts`

**API Request**:
```http
GET /api/admin/updates/overdue?threshold=90
X-Admin-Token: {adminToken}
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "overdueChildren": [
      {
        "sponsorCode": "BAN-2025-001",
        "childName": "Grace",
        "childId": "CHILD-001",
        "sponsorEmail": "sponsor@example.com",
        "sponsorName": "John Doe",
        "lastUpdateDate": "2024-09-15T10:00:00Z",
        "daysSinceUpdate": 129,
        "lastUpdateTitle": "Progress Report"
      },
      {
        "sponsorCode": "BAN-2025-002",
        "childName": "Samuel",
        "childId": "CHILD-002",
        "sponsorEmail": "sponsor2@example.com",
        "daysSinceUpdate": -1,
        "lastUpdateDate": null
      }
    ],
    "totalActive": 25,
    "overdueCount": 2,
    "thresholdDays": 90,
    "generatedAt": "2025-01-22T15:30:00Z"
  }
}
```

### Step 4: Coordinate with Field Team

**Manual Step**:

For each overdue child:
1. Note the child's name and sponsor code
2. Contact field team to request an update
3. Provide child ID and last update date
4. Track the request

### Step 5: Submit Update (Field Team)

**Tool**: `/admin/updates/submit`

Field team submits update which goes to "Pending Review" status.

### Step 6: Publish and Notify

**Tool**: Admin Dashboard → Publish & Notify

Once update is received, publish and notify the sponsor.

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| overdueChildren | array | List of children needing updates |
| totalActive | number | Total active sponsorships |
| overdueCount | number | Number of overdue children |

## Understanding the Data

- **daysSinceUpdate = -1**: Child has NEVER had a published update (most urgent)
- **daysSinceUpdate > 180**: Very overdue (6+ months)
- **daysSinceUpdate > 90**: Overdue (needs attention)

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| 401 Unauthorized | Invalid/missing admin token | Check ADMIN_API_TOKEN |
| 400 Invalid threshold | threshold is not a positive number | Use positive integer |
| 502 Database error | Airtable API issue | Check Airtable status |

## Automation Ideas

This workflow could be automated to:
1. Run daily via cron job
2. Send admin digest email with overdue list
3. Automatically notify field team when threshold exceeded
4. Track update request status

See "admin-email-digest.md" for automated admin notifications.

## Related Files

- Dashboard UI: `src/app/admin/dashboard/page.tsx`
- Overdue API: `src/app/api/admin/updates/overdue/route.ts`
- Overdue Tool: `src/lib/tools/updates/list-overdue.ts`
- Airtable Functions: `src/lib/airtable.ts` (findAllActiveSponsorships, findAllPublishedUpdates)

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-01-22 | Initial workflow creation | Claude |
