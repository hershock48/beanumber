# Check Site Links Workflow

## Objective

Verify all site routes are accessible and return healthy status codes. Detect broken links before users encounter them.

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| baseUrl | string | No | Base URL to check (default: NEXT_PUBLIC_SITE_URL or localhost:3000) |
| includeApi | boolean | No | Include API routes (default: false) |
| timeout | number | No | Timeout per request in ms (default: 5000) |

## Prerequisites

- Site must be running and accessible at the base URL
- For production checks, site should be deployed

## Steps

### Step 1: Run Link Check (Manual)

**Tool**: `GET /api/health/links`

**API Request**:
```http
GET /api/health/links?baseUrl=https://www.beanumber.org
```

**Expected Response** (all healthy):
```json
{
  "success": true,
  "healthy": true,
  "data": {
    "results": [
      {
        "path": "/",
        "url": "https://www.beanumber.org/",
        "status": 200,
        "healthy": true,
        "responseTimeMs": 150
      },
      {
        "path": "/contact",
        "url": "https://www.beanumber.org/contact",
        "status": 200,
        "healthy": true,
        "responseTimeMs": 120
      }
    ],
    "summary": {
      "total": 10,
      "healthy": 10,
      "broken": 0,
      "errors": 0
    },
    "brokenLinks": [],
    "checkedAt": "2025-01-22T15:30:00Z",
    "baseUrl": "https://www.beanumber.org"
  }
}
```

**Expected Response** (with broken links):
```json
{
  "success": true,
  "healthy": false,
  "data": {
    "results": [...],
    "summary": {
      "total": 10,
      "healthy": 9,
      "broken": 1,
      "errors": 0
    },
    "brokenLinks": ["/missing-page"],
    "checkedAt": "2025-01-22T15:30:00Z"
  }
}
```

### Step 2: Run Link Check (Programmatic)

**Tool**: `src/lib/tools/health/check-links.ts`

```typescript
import { checkLinksTool } from '@/lib/tools';

const result = await checkLinksTool({
  baseUrl: 'https://www.beanumber.org',
});

if (result.success && result.data) {
  console.log(`Checked ${result.data.summary.total} links`);

  if (result.data.summary.broken > 0) {
    console.error('Broken links found:', result.data.brokenLinks);
    process.exit(1); // Fail CI/CD
  }
}
```

### Step 3: Integrate with CI/CD

Add to your deployment pipeline:

**GitHub Actions example**:
```yaml
- name: Check Links
  run: |
    curl -f "https://${{ env.DEPLOY_URL }}/api/health/links" || exit 1
```

**Vercel post-deploy hook**:
```bash
curl -sf "https://www.beanumber.org/api/health/links" | jq -e '.healthy == true'
```

## Routes Checked

The tool checks these static routes:

| Route | Description |
|-------|-------------|
| `/` | Home page |
| `/contact` | Contact page |
| `/sponsor/login` | Sponsor login |
| `/donate/success` | Donation success page |
| `/admin/dashboard` | Admin dashboard |
| `/admin/updates/submit` | Update submission form |
| `/founder` | Founder page |
| `/governance` | Governance page |
| `/impact` | Impact page |
| `/partnerships` | Partnerships page |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| results | array | Detailed results for each link |
| summary.total | number | Total links checked |
| summary.healthy | number | Links with 2xx/3xx status |
| summary.broken | number | Links with 4xx/5xx status |
| summary.errors | number | Links that failed to connect |
| brokenLinks | array | Paths of broken links |

## Understanding Results

- **Status 200-299**: Healthy (page loads correctly)
- **Status 300-399**: Redirect (generally healthy)
- **Status 400-499**: Client error (broken link, not found)
- **Status 500-599**: Server error (application issue)
- **Status 0**: Connection error (timeout, DNS failure)

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Connection refused | Site not running | Start dev server or check deployment |
| Timeout | Slow response | Increase timeout parameter |
| 404 Not Found | Missing route | Create the missing page |
| 500 Server Error | Application bug | Check application logs |

## Automation Ideas

1. **Post-Deploy Check**: Run after every deployment
2. **Scheduled Monitoring**: Run hourly/daily via cron
3. **Slack Alerts**: Send notification on broken links
4. **Dashboard Widget**: Show link health status

## Related Files

- Health API: `src/app/api/health/links/route.ts`
- Check Tool: `src/lib/tools/health/check-links.ts`
- Routes Constant: `src/lib/constants.ts` (ROUTES)

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-01-22 | Initial workflow creation | Claude |
