# Children Workflows

This directory contains workflows for child data management and updates.

## Available Workflows

| Workflow | Purpose | Status |
|----------|---------|--------|
| [field-update-intake.md](field-update-intake.md) | Process field staff submissions | Active |
| [academic-update-intake.md](academic-update-intake.md) | Process school submissions | Planned |
| [verification-publishing.md](verification-publishing.md) | Admin review and publish | Active |

## Child Update System Overview

The Child Update system ensures timely, standardized, auditable updates about sponsored children.

### Source Types

| Type | Owner | Content |
|------|-------|---------|
| Field | `field-updates@beanumber.org` | Wellbeing, photos, narrative |
| Academic | `academics@beanumber.org` | Attendance, grades, report cards |

### Update Status Flow

```
submitted_unverified → needs_correction → published
                    ↘                   ↗
                      → rejected
```

### Immutability Rule

Published updates cannot be modified. Corrections require creating a new update that supersedes the original.

## Related Tools

### Airtable Tools
- `getActiveChildrenTool` - List active children
- `getChildByChildIdTool` - Validate child exists
- `findChildUpdateTool` - Check update uniqueness
- `createChildUpdateRecordTool` - Create new update
- `listPendingUpdatesTool` - Admin queue
- `updateChildUpdateStatusTool` - Status transitions

### Drive Tools
- `ensureChildDriveFolderTool` - Create child folder
- `ensurePeriodFolderTool` - Create period subfolder

## Related Documentation

- [Child Update System Design](../../docs/CHILD_UPDATE_SYSTEM.md)
- [Google Workspace Integration](../../docs/setup/GOOGLE_WORKSPACE_INTEGRATION.md)
