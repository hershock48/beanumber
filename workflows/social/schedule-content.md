# Schedule Social Media Content

## Objective

Schedule content for automatic posting to Instagram and/or Facebook at a specified time.

## Prerequisites

1. Meta API must be configured with environment variables:
   - `META_APP_ID`
   - `META_APP_SECRET`
   - `META_ACCESS_TOKEN`
   - `META_INSTAGRAM_ACCOUNT_ID`
   - `META_FACEBOOK_PAGE_ID` (optional, for Facebook)

2. Airtable must have a "Scheduled Posts" table

3. Media must be accessible via:
   - Google Drive file ID (preferred)
   - Public URL

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| platform | Yes | Instagram, Facebook, or Both |
| contentType | Yes | Reel, Image, Carousel, Story, Video, Link |
| mediaDriveId | No* | Google Drive file ID |
| mediaUrl | No* | Public URL to media |
| caption | Yes | Post caption (max 2200 chars for Instagram) |
| hashtags | No | Comma-separated or array of hashtags |
| scheduledAt | Yes | ISO datetime string (must be 5+ min in future) |
| createdBy | Yes | Email of person scheduling |

*Either mediaDriveId or mediaUrl required for media posts

## Steps

### 1. Validate the scheduling request

Use the validation in `schedulePostTool`:
- Platform is valid (Instagram, Facebook, Both)
- Content type is valid
- Caption doesn't exceed limits
- Hashtag count is within limits (max 30)
- scheduledAt is at least 5 minutes in the future
- createdBy is a valid email

### 2. Create the scheduled post record

```typescript
import { schedulePostTool } from '@/lib/tools/social';

const result = await schedulePostTool({
  platform: 'Instagram',
  contentType: 'Reel',
  mediaDriveId: '1abc123...',
  caption: 'Check out our impact!',
  hashtags: 'nonprofit,impact,community',
  scheduledAt: '2026-01-25T09:00:00Z',
  createdBy: 'kevin@beanumber.org',
});
```

### 3. Verify the record was created

Check the result:
```typescript
if (result.success) {
  console.log('Scheduled:', result.data.recordId);
  console.log('Will post at:', result.data.scheduledAt);
} else {
  console.error('Failed:', result.error);
}
```

## How Publishing Works

The Vercel cron job runs every 15 minutes:

1. **Cron triggers** `/api/cron/publish-scheduled`
2. **Query Airtable** for posts where:
   - Status = "Pending"
   - ScheduledAt <= now
3. **For each post**:
   - Update status to "Processing"
   - Resolve media URL (from Drive or direct)
   - Post to Instagram and/or Facebook
   - Update status to "Published" or "Failed"
   - Record post IDs and any errors

## API Endpoints

### Schedule a Post
```
POST /api/social/schedule
Authorization: Bearer <ADMIN_API_TOKEN>

{
  "platform": "Both",
  "contentType": "Reel",
  "mediaDriveId": "1abc123...",
  "caption": "Amazing impact!",
  "hashtags": ["nonprofit", "impact"],
  "scheduledAt": "2026-01-25T09:00:00Z",
  "createdBy": "kevin@beanumber.org"
}
```

### List Scheduled Posts
```
GET /api/social/scheduled?status=Pending
Authorization: Bearer <ADMIN_API_TOKEN>
```

### Cancel a Scheduled Post
```
DELETE /api/social/scheduled
Authorization: Bearer <ADMIN_API_TOKEN>

{
  "recordId": "rec123abc",
  "reason": "Content needs revision",
  "cancelledBy": "kevin@beanumber.org"
}
```

## Best Practices

### Timing
- Schedule posts for optimal engagement times (9 AM, 6 PM local time)
- Leave at least 4 hours between posts
- Consider time zones of your audience

### Content
- Keep captions concise and engaging
- Use 5-15 relevant hashtags
- Include a call to action
- Add emojis sparingly for engagement

### Reels
- 15-30 seconds is optimal
- Hook in first 3 seconds
- Use trending sounds when possible
- Add captions (85% watch muted)

## Troubleshooting

### Post Failed with "Media processing failed"
- Video may be in unsupported format
- Try re-encoding as H.264 MP4
- Ensure resolution is 1080x1920 (9:16)

### Post Failed with "Rate limit exceeded"
- Wait 1 hour before retrying
- Reduce posting frequency

### Token Expired
- Refresh token before 60-day expiration
- Check META_TOKEN_EXPIRES_AT env var
- The cron job auto-refreshes when token is within 7 days of expiry

## Outputs

| Output | Description |
|--------|-------------|
| recordId | Airtable record ID |
| scheduledAt | Confirmed schedule time |
| platform | Platform(s) it will post to |

## Related Workflows

- [Post to Instagram](./post-to-instagram.md)
- [Content Rules](./content-rules.md)
