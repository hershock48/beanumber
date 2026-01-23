# Compliance Workflows

This directory contains workflows for compliance tracking and enforcement.

## Available Workflows

| Workflow | Purpose | Status |
|----------|---------|--------|
| [reminder-and-escalation.md](reminder-and-escalation.md) | Automated update reminders | Active |

## Compliance Architecture

The compliance system enforces submission deadlines for child updates without modifying data.

### Role-Based Emails

| Role | Email | Responsibility |
|------|-------|----------------|
| Field Updates | `field-updates@beanumber.org` | Wellbeing updates, photos |
| Academics | `academics@beanumber.org` | Attendance, grades, report cards |
| Admin | `admin@beanumber.org` | Verification, publishing, escalation |

### Update Cadence

| Source Type | Cadence | Reminders |
|-------------|---------|-----------|
| Field Updates | Monthly or Quarterly | Period start, 7 days before, deadline day |
| Academic Updates | Term-based | 14 days before, 3 days before deadline |

## Related Tools

- `src/lib/tools/compliance/detect-missing-updates.ts` - Identify missing submissions
- `src/lib/tools/compliance/generate-compliance-summary.ts` - Admin summary report
- `src/lib/tools/email/send-reminder-email.ts` - Role-based reminders
- `src/lib/tools/email/send-escalation-notice.ts` - Admin escalation

## Related Documentation

- [Child Update System Design](../../docs/CHILD_UPDATE_SYSTEM.md)
- [Google Workspace Integration](../../docs/setup/GOOGLE_WORKSPACE_INTEGRATION.md)
