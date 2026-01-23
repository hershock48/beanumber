# Workflow: Reminder & Escalation (Compliance Enforcement)

## Objective

Ensure timely submission of required Child Updates by enforcing deadlines through deterministic reminders and escalation, without creating, modifying, or publishing child data.

This workflow exists solely to **enforce compliance** with other workflows.

## Actors

- **System** (Automation Only)
- **Admin** (Be A Number) — `admin@beanumber.org`

## Preconditions

- Child Update periods are defined centrally
- Required update cadence is known:
  - Field Updates: Monthly or Quarterly
  - Academic Updates: Term-based
- Canonical workflows for intake and publishing exist

## Inputs

- List of active children
- Expected updates per child per period
- Current submission status from Airtable

## Tools Used

- `getActiveChildrenTool` - List all active children
- `detectMissingUpdatesTool` - Compare expected vs existing submissions
- `generateComplianceSummaryTool` - Generate admin visibility report
- `sendReminderEmailTool` - Send role-based reminders
- `sendEscalationNoticeTool` - Escalate to admin

## Execution Schedule

This workflow runs on a **fixed schedule** (e.g., daily cron job via Vercel or similar).

## Execution Steps

### Step 1: Determine Required Updates

1. System identifies:
   - Current update period
   - Children requiring:
     - Field Updates
     - Academic Updates
2. Expected updates are calculated per child

```typescript
const period = getCurrentPeriod(); // e.g., "2026-01"
const sourceType = 'field';
```

### Step 2: Detect Missing or Incomplete Updates

1. System compares expected updates against:
   - `submitted_unverified`
   - `needs_correction`
   - `published`
2. Any child without a valid submission is marked **missing**

```typescript
const result = await detectMissingUpdatesTool({
  periodOrTerm: period,
  sourceType: 'field',
});

// result.data contains:
// - missingChildIds: string[]
// - presentChildIds: string[]
// - counts: { expected, present, missing }
// - complianceRate: number
```

### Step 3: Send Role-Based Reminders

#### Field Updates

- Reminder sent to: `field-updates@beanumber.org`
- Timing:
  - Period start
  - 7 days before deadline
  - Deadline day
- Content must include:
  - Update period
  - List of missing Child IDs
  - Link to Field Update Intake Form
  - Instruction not to reply by email

```typescript
await sendReminderEmailTool({
  toRoleEmail: 'field-updates@beanumber.org',
  periodOrTerm: period,
  sourceType: 'field',
  missingChildIds: result.data.missingChildIds,
  formUrl: 'https://forms.google.com/field-intake',
  reminderType: 'initial', // or 'follow_up' or 'final'
});
```

#### Academic Updates

- Reminder sent to: `academics@beanumber.org`
- Timing:
  - 14 days before deadline
  - 3 days before deadline
- Content must include:
  - Academic term
  - Missing Child IDs
  - Link to Academic Intake Form

### Step 4: Escalation (Mandatory)

If updates remain missing **after the deadline**:

1. System flags updates as `overdue`
2. Escalation notice sent to: `admin@beanumber.org`
3. Escalation includes:
   - Responsible role
   - Number of missing updates
   - Affected Child IDs
   - Days overdue

```typescript
await sendEscalationNoticeTool({
  periodOrTerm: period,
  sourceType: 'field',
  responsibleRole: 'field-updates@beanumber.org',
  missingCount: result.data.counts.missing,
  missingChildIds: result.data.missingChildIds,
  daysOverdue: 3,
});
```

Escalation does **not**:
- Create updates
- Modify update status
- Notify sponsors
- Auto-approve content

### Step 5: Compliance Summary (Optional)

System may generate a summary for admin showing:
- Total children expected to report
- Updates received vs missing
- On-time vs overdue counts
- Role-based compliance rates

```typescript
const summary = await generateComplianceSummaryTool({
  periodOrTerm: period,
  sourceType: 'field', // optional - omit for both types
});

// summary.data contains:
// - summaries: ComplianceSummary[]
// - overallComplianceRate: number
// - totalExpected, totalPresent, totalMissing
```

## Validation Rules

- Reminders must not accept replies as submissions
- No reminders sent to individual personal emails
- All communications reference role-based addresses only

## Failure Handling

- If reminder delivery fails:
  - Admin is notified
  - No assumptions are made
- Automation failure must not:
  - Skip escalation
  - Change data
  - Affect sponsor visibility

## Prohibited Actions

This workflow must **never**:
- Create Child Updates
- Modify Child Updates
- Publish updates
- Bypass verification
- Contact sponsors

## Outputs

- Reminder emails
- Escalation notices
- Compliance visibility for admin

## Enforcement Statement

Failure to follow this workflow is considered a **process defect**.

This workflow exists to **protect system discipline at scale**.

## Example Cron Job

```typescript
// /api/cron/compliance/route.ts
import {
  detectMissingUpdatesTool,
  sendReminderEmailTool,
  sendEscalationNoticeTool,
} from '@/lib/tools';

export async function GET() {
  const period = new Date().toISOString().substring(0, 7); // "2026-01"

  // Check field updates
  const fieldResult = await detectMissingUpdatesTool({
    periodOrTerm: period,
    sourceType: 'field',
  });

  if (fieldResult.success && fieldResult.data.counts.missing > 0) {
    // Determine reminder type based on day of month
    const day = new Date().getDate();
    const reminderType = day === 1 ? 'initial' : day >= 25 ? 'final' : 'follow_up';

    await sendReminderEmailTool({
      toRoleEmail: 'field-updates@beanumber.org',
      periodOrTerm: period,
      sourceType: 'field',
      missingChildIds: fieldResult.data.missingChildIds,
      formUrl: process.env.FIELD_FORM_URL || '#',
      reminderType,
    });
  }

  return Response.json({ success: true });
}
```
