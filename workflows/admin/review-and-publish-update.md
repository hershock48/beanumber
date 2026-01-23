# Review and Publish Update Workflow

## Objective

Allow admin to review pending updates submitted by field team and publish them to make visible to sponsors.

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| adminToken | string | Yes | Admin authentication token (from env ADMIN_API_TOKEN) |

## Prerequisites

- ADMIN_API_TOKEN environment variable configured
- Airtable Updates table accessible
- At least one update in "Pending Review" status

## Steps

### Step 1: Authenticate as Admin

**Tool**: Manual / Admin Dashboard UI

Navigate to `/admin/dashboard` and enter the admin token to authenticate.

### Step 2: List Pending Updates

**Tool**: `GET /api/admin/updates/list`

The dashboard automatically fetches all pending updates when authenticated.

**API Request**:
```http
GET /api/admin/updates/list
X-Admin-Token: {adminToken}
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "updates": [
      {
        "id": "rec123abc",
        "childId": "CHILD-001",
        "sponsorCode": "BAN-2025-001",
        "updateType": "Progress Report",
        "title": "Monthly Progress Update",
        "content": "...",
        "photos": [...],
        "status": "Pending Review",
        "submittedBy": "Field Team Member",
        "submittedAt": "2025-01-20T10:00:00Z"
      }
    ],
    "count": 1
  }
}
```

### Step 3: Review Update Content

**Manual Step**:

For each pending update, review:
1. Title and content quality
2. Photos (if attached)
3. Sponsor code matches expected child
4. Update type is appropriate
5. Content is appropriate for sponsor viewing

### Step 4: Publish Update

**Tool**: `POST /api/admin/updates/publish` → `src/lib/tools/updates/publish-update.ts`

Click "Publish" button on the update to publish it.

**API Request**:
```http
POST /api/admin/updates/publish
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
    "childId": "CHILD-001",
    "title": "Monthly Progress Update",
    "publishedAt": "2025-01-22T15:30:00Z",
    "sponsorNotificationReady": true,
    "sponsor": {
      "email": "sponsor@example.com",
      "name": "John Sponsor",
      "code": "BAN-2025-001"
    }
  },
  "message": "Update published successfully"
}
```

**What Happens**:
1. Update status changed to "Published"
2. VisibleToSponsor set to true
3. PublishedAt timestamp set
4. Sponsor info returned for notification

### Step 5: Send Sponsor Notification (Optional)

**Tool**: `src/lib/tools/email/send-update-notification.ts` (to be implemented)

If `sponsorNotificationReady` is true, send notification email to sponsor.

**Note**: This step is currently manual. See Phase 1.3 of the upgrade plan for implementation.

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| publishedUpdateId | string | The Airtable record ID of published update |
| publishedAt | string | ISO timestamp of publication |
| sponsorEmail | string | Sponsor's email (for notification) |
| sponsorName | string | Sponsor's name (for personalization) |

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| 401 Unauthorized | Invalid/missing admin token | Check ADMIN_API_TOKEN in env |
| 404 Update not found | Invalid updateId | Verify record exists in Airtable |
| 400 Not pending | Update already published/rejected | Check update status in Airtable |
| 502 Database error | Airtable API issue | Check Airtable status, retry |

## Notes

- Only updates with status "Pending Review" can be published
- Publishing sets VisibleToSponsor=true, making it appear in sponsor portal
- The dashboard auto-refreshes the list after publishing
- Sponsor notification is ready but requires manual follow-up until Phase 1.3

## Related Files

- Dashboard UI: `src/app/admin/dashboard/page.tsx`
- List API: `src/app/api/admin/updates/list/route.ts`
- Publish API: `src/app/api/admin/updates/publish/route.ts`
- Publish Tool: `src/lib/tools/updates/publish-update.ts`
- Airtable Functions: `src/lib/airtable.ts` (findPendingUpdates, publishUpdate)

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-01-22 | Initial workflow creation | Claude |
