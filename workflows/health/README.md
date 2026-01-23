# Health Workflows

This directory contains workflows for site health monitoring and validation.

## Available Workflows

| Workflow | Purpose | Status |
|----------|---------|--------|
| [check-site-links.md](check-site-links.md) | Verify all site routes are accessible | Active |

## Health Architecture

Health checks can be:
- Run manually for debugging
- Integrated into CI/CD pipelines
- Scheduled via cron for monitoring

### Health Endpoints

- `GET /api/health/links` - Check all site links

## Related Tools

- `src/lib/tools/health/check-links.ts` - WAT-compliant link checker

## Integration Examples

### CI/CD Pipeline

```yaml
# GitHub Actions
- name: Health Check
  run: curl -sf "$DEPLOY_URL/api/health/links" | jq -e '.healthy'
```

### Cron Monitoring

```json
// vercel.json
{
  "crons": [{
    "path": "/api/health/links",
    "schedule": "0 */6 * * *"
  }]
}
```

## Related Documentation

- [Deployment Guide](../../docs/deployment/VERCEL_ENV_VARS.md)
