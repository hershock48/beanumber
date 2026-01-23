# Google Workspace Integration

This document describes the Google Workspace integration strategy, including Gmail for email and Google Drive for file storage.

## Overview

Be A Number uses Google Workspace for:
- **Gmail API**: Sending emails (sponsor notifications, admin digests, welcome emails)
- **Google Drive API**: Storing photos and videos for children updates

Both services share the same OAuth credentials.

## Architecture

### Authority Model

| Change Type | Authority | Approval Required |
|-------------|-----------|-------------------|
| Add new OAuth scope | Admin | Yes |
| Create new Drive folders | System | No (automated) |
| Upload files to Drive | System | No (automated) |
| Delete files from Drive | Admin | Yes |
| Send emails | System | No (WAT tools) |
| Modify email templates | Developer | Review recommended |

### Non-Negotiables

1. **Secrets in environment variables only** - Never store OAuth tokens in code
2. **WAT tools for all operations** - No direct API calls in route handlers
3. **Structured logging** - All operations logged via `src/lib/logger.ts`
4. **Error handling** - Return `{ success, data?, error? }` pattern

## OAuth Configuration

### Required Scopes

```
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/drive.file
```

The `drive.file` scope only allows access to files created by the application.

### Environment Variables

```bash
# Gmail/Drive OAuth (shared credentials)
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
GMAIL_USER_EMAIL=kevin@beanumber.org
```

### Obtaining Refresh Token

1. Create OAuth 2.0 credentials in Google Cloud Console
2. Add required scopes to OAuth consent screen
3. Use OAuth Playground or custom script to get refresh token:

```bash
# OAuth Playground: https://developers.google.com/oauthplayground/
# 1. Click gear icon, check "Use your own OAuth credentials"
# 2. Enter Client ID and Secret
# 3. Select Gmail and Drive scopes
# 4. Authorize and exchange code for refresh token
```

## Google Drive Integration

### Folder Structure

```
Google Drive/
└── Be A Number/
    └── Children/
        ├── CHILD-001/
        │   ├── photo1.jpg
        │   └── photo2.jpg
        ├── CHILD-002/
        │   └── update-video.mp4
        └── ...
```

### File Storage Strategy

| Data Type | Storage | Reason |
|-----------|---------|--------|
| Child photos | Google Drive | Large files, shared access |
| Update videos | Google Drive | Large files, shared access |
| Sponsor data | Airtable | Structured data, relationships |
| Donation records | Airtable | Structured data, reporting |
| Update content | Airtable | Structured data, linked records |

### Drive File IDs in Airtable

Store Google Drive file IDs in Airtable rather than full URLs:
- More durable (URLs can change)
- Enables permission management
- Smaller record size

```javascript
// Airtable record
{
  "ChildID": "CHILD-001",
  "Photos": [
    { "driveFileId": "1abc...", "fileName": "photo1.jpg" },
    { "driveFileId": "2def...", "fileName": "photo2.jpg" }
  ]
}
```

## Gmail Integration

### Email Types

| Email Type | Tool | Template |
|------------|------|----------|
| Sponsor Welcome | `sendSponsorWelcomeTool` | Built-in HTML |
| Update Notification | `sendUpdateNotificationTool` | Built-in HTML |
| Admin Digest | `sendAdminDigestTool` | Built-in HTML |
| Recurring Thank-You | `sendRecurringDonationThankYouEmail` | Built-in HTML |

### Fallback Strategy

1. **Gmail** (primary) - If OAuth configured
2. **SendGrid** (fallback) - If Gmail fails or not configured
3. **Log only** - If neither configured (dev environment)

## Security Considerations

### OAuth Token Security

- Refresh token stored in environment variable only
- Token never logged (even in debug mode)
- Token rotation not automatic (manual refresh if compromised)

### Drive File Permissions

- Files created as private by default
- Share via `getShareableLink()` when needed
- Never make files publicly discoverable

### Rate Limits

| API | Limit | Handling |
|-----|-------|----------|
| Gmail API | 100 emails/second | Built-in retries |
| Drive API | 1000 requests/100s | Built-in retries |

## Related Files

| Component | File |
|-----------|------|
| Gmail Client | `src/lib/gmail.ts` |
| Drive Client | `src/lib/googledrive.ts` |
| Email Config | `src/lib/env.ts` |
| Upload Tool | `src/lib/tools/media/upload-to-drive.ts` |
| Email Tools | `src/lib/tools/email/` |

## Workflows

| Workflow | Description |
|----------|-------------|
| `workflows/email/verify-email-integration.md` | Test Gmail setup |
| `workflows/email/send-sponsor-welcome.md` | New sponsor email |
| `workflows/email/notify-sponsor-of-update.md` | Update notification |

## Future Integrations

### Candidates (Prioritized)

1. **Google Calendar** - Schedule field team visits
2. **Google Sheets** - Export reports for board meetings
3. **Google Forms** - Feedback collection

### Requirements for New Integrations

1. Define clear use case and business value
2. Add required scope to OAuth consent screen
3. Create WAT tool following existing patterns
4. Document in this file
5. Create workflow documentation

## Troubleshooting

### "Invalid grant" Error

Refresh token has expired or been revoked:
1. Re-authenticate via OAuth Playground
2. Update `GMAIL_REFRESH_TOKEN` environment variable
3. Redeploy application

### "Insufficient permission" Error

Missing OAuth scope:
1. Check required scopes in Google Cloud Console
2. Update OAuth consent screen
3. Re-authenticate to get new token with scopes

### "Rate limit exceeded" Error

Too many API requests:
1. Implement exponential backoff (already in tools)
2. Batch operations where possible
3. Contact Google for quota increase if needed

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-22 | Created integration guide | System |
