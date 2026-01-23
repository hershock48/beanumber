# Workflow: Field Update Intake

## Objective

Process field staff submissions of child wellbeing updates and photos through a standardized intake form, storing files in Google Drive and metadata in Airtable.

## Actors

- **Field Staff** (YDO) — submits via `field-updates@beanumber.org`
- **System** — validates, stores, and routes submissions

## Preconditions

- Google Form (Form A) is configured and accessible
- Google Apps Script bridge is set up (or manual API trigger)
- Gmail/Drive OAuth credentials are configured
- Child exists in the system (valid Child ID)

## Inputs

From Google Form submission:

| Field | Required | Validation |
|-------|----------|------------|
| Child ID | Yes | Format: `BAN-XXXX` |
| Update Period | Yes | Dropdown (e.g., `2026-01`) |
| Physical Wellbeing | Yes | Select: Excellent/Good/Okay/Needs attention |
| Physical Notes | Yes | 20-500 characters |
| Emotional/Social Wellbeing | Yes | Select |
| Emotional Notes | Yes | 20-500 characters |
| School Engagement | Yes | Select: Very engaged/Engaged/Inconsistent/Not engaged |
| Engagement Notes | Yes | 20-500 characters |
| Sponsor Narrative | Yes | 60-900 characters |
| Positive Highlight | Yes | Max 140 characters |
| Challenge | No | Max 140 characters |
| Photo 1 | Yes | Image file |
| Photo 2 | No | Image file |
| Photo 3 | No | Image file |
| Handwritten Note | No | Image file |

## Tools Used

- `getChildByChildIdTool` - Validate child exists
- `findChildUpdateTool` - Check for duplicates
- `ensurePeriodFolderTool` - Create Drive folder
- `uploadToDriveTool` - Store photos
- `createChildUpdateRecordTool` - Create Airtable record

## Execution Steps

### Step 1: Validate Submission

```typescript
// 1. Validate Child ID exists
const childResult = await getChildByChildIdTool({
  childId: submission.childId,
});

if (!childResult.success) {
  return { error: 'invalid_child_id' };
}

// 2. Check for duplicate submission
const existingResult = await findChildUpdateTool({
  childId: submission.childId,
  sourceType: 'field',
  period: submission.updatePeriod,
});

if (existingResult.success && existingResult.data.exists) {
  return { error: 'duplicate_update' };
}
```

### Step 2: Store Files in Drive

```typescript
// Create period folder
const folderResult = await ensurePeriodFolderTool({
  childId: submission.childId,
  sourceType: 'field',
  periodOrTerm: submission.updatePeriod,
});

// Upload photos
const photoFileIds = {};

for (const [key, photo] of Object.entries(submission.photos)) {
  if (photo) {
    const uploadResult = await uploadToDriveTool({
      childId: submission.childId,
      fileName: `${key}-${Date.now()}.jpg`,
      mimeType: photo.mimeType,
      content: photo.buffer,
      description: `${key} for ${submission.updatePeriod}`,
    });

    if (uploadResult.success) {
      photoFileIds[key] = uploadResult.data.fileId;
    }
  }
}
```

### Step 3: Create Airtable Record

```typescript
const createResult = await createChildUpdateRecordTool({
  childId: submission.childId,
  sourceType: 'field',
  period: submission.updatePeriod,
  submittedAt: new Date().toISOString(),
  submittedBy: 'field-updates@beanumber.org',
  status: 'submitted_unverified',
  fields: {
    physicalWellbeing: submission.physicalWellbeing,
    physicalNotes: submission.physicalNotes,
    emotionalWellbeing: submission.emotionalWellbeing,
    emotionalNotes: submission.emotionalNotes,
    schoolEngagement: submission.schoolEngagement,
    engagementNotes: submission.engagementNotes,
    sponsorNarrative: submission.sponsorNarrative,
    positiveHighlight: submission.positiveHighlight,
    challenge: submission.challenge,
  },
  drive: {
    folderId: folderResult.data.folderId,
    photo1FileId: photoFileIds.photo1,
    photo2FileId: photoFileIds.photo2,
    photo3FileId: photoFileIds.photo3,
    handwrittenNoteFileId: photoFileIds.handwrittenNote,
  },
});
```

## Validation Rules

### Submitter Validation
- Only `field-updates@beanumber.org` may submit field updates
- Personal emails are rejected

### Content Validation
- Child ID must match `BAN-XXXX` format
- All required wellbeing fields must be complete
- Narrative must be within character limits
- At least one photo required

### Media Validation
- Only image files accepted
- Maximum file size enforced (if configured)
- Photos stored with descriptive names

## Output

On success:
- Airtable record created with status `submitted_unverified`
- Photos stored in Drive folder: `/Be A Number/Children/{ChildID}/field-updates/{Period}/`
- Update ID generated: `{ChildID} | {Period} | field`

## Error Handling

| Error | Response |
|-------|----------|
| Invalid Child ID | Reject submission with error |
| Duplicate update | Return existing update ID |
| Drive upload failure | Log error, continue without photos |
| Airtable failure | Return error, no partial writes |
| Invalid submitter | Reject with forbidden error |

## Post-Intake

After successful intake:
1. Update appears in admin pending queue
2. Admin reviews via Verification & Publishing workflow
3. On publish, sponsor is notified

## Prohibited

This workflow must **never**:
- Accept email submissions
- Store files outside approved Drive structure
- Create records with status other than `submitted_unverified`
- Skip validation steps
- Allow non-role submitters
