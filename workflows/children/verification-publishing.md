# Workflow: Verification & Publishing

## Objective

Enable admin review, approval, and publishing of child updates while enforcing governance rules (immutability, role-based authorization, sponsor notification).

## Actors

- **Admin** (Be A Number) — `admin@beanumber.org`

## Preconditions

- Update exists with status `submitted_unverified` or `needs_correction`
- Admin is authenticated via `ADMIN_API_TOKEN`

## Inputs

- Update record ID
- Admin decision (approve, request correction, reject)
- Optional notes (for correction/rejection)

## Tools Used

- `listPendingUpdatesTool` - Get admin queue
- `updateChildUpdateStatusTool` - Transition status
- `sendUpdateNotificationTool` - Notify sponsor on publish

## Execution Steps

### Step 1: Review Pending Updates

```typescript
// Get all pending updates for admin review
const pendingResult = await listPendingUpdatesTool();

// Returns: { updates: ChildUpdateSummary[], count: number }
// Each update contains:
// - recordId, updateId, childId
// - sourceType, periodOrTerm
// - submittedAt, submittedBy
// - status
```

### Step 2: Admin Decision

Admin reviews each update and decides:

#### Option A: Approve (Publish)

```typescript
const result = await updateChildUpdateStatusTool({
  updateRecordId: update.recordId,
  nextStatus: 'published',
  actorEmail: 'admin@beanumber.org',
});

// On success:
// - Status changes to 'published'
// - VisibleToSponsor = true
// - PublishedAt = now
```

#### Option B: Request Correction

```typescript
const result = await updateChildUpdateStatusTool({
  updateRecordId: update.recordId,
  nextStatus: 'needs_correction',
  actorEmail: 'admin@beanumber.org',
  notes: 'Please provide clearer photo of child',
});

// On success:
// - Status changes to 'needs_correction'
// - Notes stored for submitter reference
// - Submitter can resubmit
```

#### Option C: Reject

```typescript
const result = await updateChildUpdateStatusTool({
  updateRecordId: update.recordId,
  nextStatus: 'rejected',
  actorEmail: 'admin@beanumber.org',
  notes: 'Content does not meet quality standards',
});

// On success:
// - Status changes to 'rejected'
// - Terminal state (cannot be changed)
// - Reason stored for audit
```

### Step 3: Notify Sponsor (On Publish)

```typescript
// After successful publish, notify sponsor
const notifyResult = await sendUpdateNotificationTool({
  updateId: update.recordId,
  sponsorCode: update.sponsorCode, // from linked sponsorship
});

// Sends email with:
// - Child name
// - Update preview
// - Portal link
```

## Governance Rules

### Authorization

| Action | Who Can Perform |
|--------|-----------------|
| View pending updates | Admin only |
| Approve (publish) | Admin only |
| Request correction | Admin only |
| Reject | Admin only |

### Status Transitions

```
submitted_unverified → published (admin)
submitted_unverified → needs_correction (admin)
submitted_unverified → rejected (admin)

needs_correction → submitted_unverified (resubmission)
needs_correction → published (admin)
needs_correction → rejected (admin)

published → (none - immutable)
rejected → (none - terminal)
```

### Immutability

**Published updates cannot be modified.**

If a correction is needed after publishing:
1. Create a new Child Update
2. Link it to the original via `supersedesUpdateId`
3. The new update goes through normal verification
4. Both updates remain in history

```typescript
// Creating a correction update
const correctionResult = await createChildUpdateRecordTool({
  childId: originalUpdate.childId,
  sourceType: originalUpdate.sourceType,
  period: originalUpdate.period,
  submittedBy: 'field-updates@beanumber.org',
  // ... updated fields
  supersedesUpdateId: originalUpdate.updateId,
});
```

## Validation Rules

### Pre-Publish Checks

Before approving, admin should verify:
- [ ] Photos are clear and appropriate
- [ ] Narrative is well-written and accurate
- [ ] No sensitive information included
- [ ] Child ID matches content
- [ ] Required fields are complete

### Admin Authentication

```typescript
// All admin operations require authentication
const adminToken = request.headers.get('X-Admin-Token');
if (adminToken !== process.env.ADMIN_API_TOKEN) {
  return { error: 'unauthorized' };
}
```

## Error Handling

| Error | Response |
|-------|----------|
| Update not found | Return 404 |
| Invalid status transition | Return error with allowed transitions |
| Non-admin actor | Return 403 forbidden |
| Attempt to modify published | Return error: immutable |

## Outputs

- Status updated in Airtable
- Sponsor notified (on publish)
- Audit trail maintained (reviewedBy, reviewedAt)

## Dashboard UI

The admin dashboard at `/admin/dashboard` provides:
- List of pending updates
- Update details view
- Publish/Correct/Reject actions
- Overdue children list

## Prohibited

This workflow must **never**:
- Allow non-admin users to publish
- Modify published updates
- Skip sponsor notification
- Approve without authentication
- Delete update records
