# Airtable Schema: Child Update System

This document defines the Airtable tables required to support the Child Update System.

## Overview

The system requires modifications to the existing Airtable base:
1. **Children** table - New table for canonical child records
2. **Child Updates** table - New table for structured updates (replaces unstructured Updates)

The existing **Sponsorships**, **Donors**, and **Donations** tables remain unchanged.

---

## Table 1: Children (NEW)

**Purpose:** Canonical child identity and status tracking.

### Primary Field
- **Child ID** (Single line text, format: `BAN-XXXX`)

### Fields

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Child ID | Single line text | Yes | Primary identifier (BAN-0001, BAN-0002, etc.) |
| FirstName | Single line text | Yes | First name only (privacy) |
| LastInitial | Single line text | No | Last initial (optional) |
| Status | Single select | Yes | `active`, `inactive`, `paused`, `archived` |
| SchoolLocation | Single select | No | School or program location |
| GradeClass | Single line text | No | Current grade/class |
| ExpectedFieldPeriod | Single select | No | Expected field update period |
| ExpectedAcademicTerm | Single select | No | Expected academic term |
| LastFieldUpdateDate | Date | No | Date of last published field update |
| LastAcademicUpdateDate | Date | No | Date of last published academic update |
| Sponsors | Link to Sponsors | No | Linked sponsor record(s) |
| Notes | Long text | No | Internal notes (never sponsor-visible) |

### Views to Create

1. **Active Children** - Filter: `Status = active`
2. **Missing Field Updates** - Formula: `{Status} = 'active' AND {LastFieldUpdateDate} < DATE_ADD(TODAY(), -30, 'days')`
3. **All Children** - No filter, sorted by Child ID

---

## Table 2: Child Updates (NEW)

**Purpose:** Canonical update records from both field staff and schools.

### Primary Field
- **Update ID** (Formula): `{Child ID} & " | " & IF({SourceType} = "field", {Period}, {AcademicTerm}) & " | " & {SourceType}`

### Core Fields

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| Update ID | Formula | Auto | Computed unique identifier |
| Child | Link to Children | Yes | Linked child record |
| ChildID | Lookup | Auto | Lookup from Child |
| SourceType | Single select | Yes | `field` or `academic` |
| Period | Single select | Conditional | For field updates (e.g., `2026-01`) |
| AcademicTerm | Single select | Conditional | For academic updates (e.g., `Term 1 2026`) |
| SubmittedAt | Date/Time | Yes | Submission timestamp |
| SubmittedBy | Email | Yes | Role email (field-updates@, academics@) |
| Status | Single select | Yes | `submitted_unverified`, `needs_correction`, `published`, `rejected` |

### Field Update Payload Fields

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| PhysicalWellbeing | Single select | Conditional | `Excellent`, `Good`, `Okay`, `Needs attention` |
| PhysicalNotes | Long text | Conditional | Notes on physical wellbeing |
| EmotionalWellbeing | Single select | Conditional | `Excellent`, `Good`, `Okay`, `Needs attention` |
| EmotionalNotes | Long text | Conditional | Notes on emotional/social wellbeing |
| SchoolEngagement | Single select | Conditional | `Very engaged`, `Engaged`, `Inconsistent`, `Not engaged` |
| EngagementNotes | Long text | Conditional | Notes on school engagement |
| SponsorNarrative | Long text | Conditional | Sponsor-facing narrative (60-900 chars) |
| PositiveHighlight | Single line text | Conditional | One positive highlight (140 chars max) |
| Challenge | Single line text | No | One challenge (140 chars max) |

### Academic Update Payload Fields

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| AttendancePercent | Number | Conditional | Attendance percentage (0-100) |
| EnglishGrade | Number | No | English grade |
| MathGrade | Number | No | Math grade |
| ScienceGrade | Number | No | Science grade |
| SocialStudiesGrade | Number | No | Social Studies grade |
| TeacherComment | Long text | No | Teacher comment (300 chars max) |

### Drive File Reference Fields

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| DriveFolderID | Single line text | No | Google Drive folder ID |
| Photo1FileID | Single line text | No | Drive file ID for photo 1 |
| Photo2FileID | Single line text | No | Drive file ID for photo 2 |
| Photo3FileID | Single line text | No | Drive file ID for photo 3 |
| HandwrittenNoteFileID | Single line text | No | Drive file ID for handwritten note |
| ReportCardFileID | Single line text | No | Drive file ID for report card (academic) |

### Governance Fields

| Field Name | Type | Required | Description |
|------------|------|----------|-------------|
| ReviewedBy | Email | No | Admin who reviewed |
| ReviewedAt | Date/Time | No | Review timestamp |
| RejectionReason | Long text | No | Reason if rejected |
| CorrectionNotes | Long text | No | Notes if needs_correction |
| SupersedesUpdate | Link to Child Updates | No | Links to update this supersedes |
| SupersededBy | Link to Child Updates | No | Links to update that superseded this |

### Views to Create

1. **Pending Review** - Filter: `Status = submitted_unverified OR Status = needs_correction`
2. **Published** - Filter: `Status = published`
3. **Field Updates** - Filter: `SourceType = field`
4. **Academic Updates** - Filter: `SourceType = academic`
5. **By Period** - Grouped by Period/AcademicTerm

---

## Environment Variables

Add the new table name to your environment:

```bash
# .env.local
AIRTABLE_CHILDREN_TABLE=Children
AIRTABLE_CHILD_UPDATES_TABLE=Child Updates
```

Update `src/lib/env.ts` to include:

```typescript
AIRTABLE_CHILDREN_TABLE: string;
AIRTABLE_CHILD_UPDATES_TABLE: string;
```

---

## Migration Notes

### From Existing Updates Table

If you have an existing **Updates** table:
1. Keep it for historical data
2. Create the new **Child Updates** table with the schema above
3. Optionally migrate historical records in batches

### Gradual Transition

The tools are designed to work with the existing Sponsorships table as a fallback for child data. Once the Children table is created:
1. Populate it from Sponsorships (one-time migration)
2. Update `getActiveChildrenTool` to use the Children table
3. Update `getChildByChildIdTool` to use the Children table

---

## Single Select Options

### Status (Children)
- `active`
- `inactive`
- `paused`
- `archived`

### SourceType (Child Updates)
- `field`
- `academic`

### Status (Child Updates)
- `submitted_unverified`
- `needs_correction`
- `published`
- `rejected`

### Wellbeing Options
- `Excellent`
- `Good`
- `Okay`
- `Needs attention`

### Engagement Options
- `Very engaged`
- `Engaged`
- `Inconsistent`
- `Not engaged`

### Period Options (Monthly)
Create options for each month:
- `2026-01`, `2026-02`, `2026-03`, ... `2026-12`

### AcademicTerm Options
- `Term 1 2026`
- `Term 2 2026`
- `Term 3 2026`
- (Add more as needed)

---

## Validation Rules

### Uniqueness Constraint
Each combination of (ChildID, Period/AcademicTerm, SourceType) must be unique. The system enforces this in code via `findChildUpdateTool`.

### Immutability
Records with `Status = published` cannot be edited. The system enforces this via `updateChildUpdateStatusTool`.

### Role-Based Submission
- Field updates must have `SubmittedBy = field-updates@beanumber.org`
- Academic updates must have `SubmittedBy = academics@beanumber.org`
- Only admin (`admin@beanumber.org`) can change status to `published` or `rejected`

---

## Setup Checklist

- [ ] Create **Children** table with all fields
- [ ] Create **Child Updates** table with all fields
- [ ] Add single select options
- [ ] Create required views
- [ ] Add environment variables
- [ ] Populate Children table from existing Sponsorships
- [ ] Test with a sample field update submission
