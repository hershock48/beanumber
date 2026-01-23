# Airtable Setup: Child Update System

This guide will help you create the new **Children** and **Child Updates** tables in your Airtable base.

## Prerequisites

- ✅ **Airtable credentials already configured** in `.env.local`:
  - Base ID: `app73ZPGbM0BQTOZW`
  - API Key: Already set
  - Existing tables: Sponsorships, Updates
- Access to your Airtable base
- Understanding of the schema (see `AIRTABLE_CHILD_UPDATES_SCHEMA.md`)

## Step 1: Create Children Table

### 1.1 Create the Table
1. In your Airtable base, click **"+ Add a table"**
2. Name it: **"Children"**
3. Click **"Create table"**

### 1.2 Add Fields

Create these fields in order:

#### Primary Field
- **Child ID** (Single line text) - This is your primary field

#### Required Fields
1. **FirstName** - Single line text
2. **LastInitial** - Single line text (optional)
3. **Status** - Single select (options: `active`, `inactive`, `paused`, `archived`)
4. **SchoolLocation** - Single select (add your locations)
5. **GradeClass** - Single line text
6. **ExpectedFieldPeriod** - Single select (e.g., `2026-01`, `2026-02`, etc.)
7. **ExpectedAcademicTerm** - Single select (e.g., `Term 1 2026`, `Term 2 2026`, etc.)
8. **LastFieldUpdateDate** - Date
9. **LastAcademicUpdateDate** - Date
10. **Sponsors** - Link to another table → Select **"Sponsorships"** table
11. **Notes** - Long text

### 1.3 Create Views

1. **Active Children**
   - Filter: `Status` is `active`
   - Sort by: `Child ID` (ascending)

2. **Missing Field Updates**
   - Filter: `Status` is `active` AND `LastFieldUpdateDate` is before `30 days ago`
   - Sort by: `LastFieldUpdateDate` (ascending)

3. **All Children**
   - No filter
   - Sort by: `Child ID` (ascending)

---

## Step 2: Create Child Updates Table

### 2.1 Create the Table
1. Click **"+ Add a table"**
2. Name it: **"Child Updates"**
3. Click **"Create table"**

### 2.2 Add Core Fields

1. **Update ID** - Formula field
   - Formula: `{Child ID} & " | " & IF({SourceType} = "field", {Period}, {AcademicTerm}) & " | " & {SourceType}`
   - Note: You'll need to create this after adding Child, SourceType, Period, and AcademicTerm fields

2. **Child** - Link to another table → Select **"Children"** table
3. **ChildID** - Lookup field
   - Lookup from: `Child` → `Child ID`
4. **SourceType** - Single select (options: `field`, `academic`)
5. **Period** - Single select (e.g., `2026-01`, `2026-02`, `2026-03`, ... `2026-12`)
6. **AcademicTerm** - Single select (e.g., `Term 1 2026`, `Term 2 2026`, `Term 3 2026`)
7. **SubmittedAt** - Date with time
8. **SubmittedBy** - Email field
9. **Status** - Single select (options: `submitted_unverified`, `needs_correction`, `published`, `rejected`)

### 2.3 Add Field Update Payload Fields

10. **PhysicalWellbeing** - Single select (`Excellent`, `Good`, `Okay`, `Needs attention`)
11. **PhysicalNotes** - Long text
12. **EmotionalWellbeing** - Single select (`Excellent`, `Good`, `Okay`, `Needs attention`)
13. **EmotionalNotes** - Long text
14. **SchoolEngagement** - Single select (`Very engaged`, `Engaged`, `Inconsistent`, `Not engaged`)
15. **EngagementNotes** - Long text
16. **SponsorNarrative** - Long text
17. **PositiveHighlight** - Single line text
18. **Challenge** - Single line text

### 2.4 Add Academic Update Payload Fields

19. **AttendancePercent** - Number (format: percentage, 0-100)
20. **EnglishGrade** - Number
21. **MathGrade** - Number
22. **ScienceGrade** - Number
23. **SocialStudiesGrade** - Number
24. **TeacherComment** - Long text

### 2.5 Add Drive File Reference Fields

25. **DriveFolderID** - Single line text
26. **Photo1FileID** - Single line text
27. **Photo2FileID** - Single line text
28. **Photo3FileID** - Single line text
29. **HandwrittenNoteFileID** - Single line text
30. **ReportCardFileID** - Single line text

### 2.6 Add Governance Fields

31. **ReviewedBy** - Email field
32. **ReviewedAt** - Date with time
33. **RejectionReason** - Long text
34. **CorrectionNotes** - Long text
35. **SupersedesUpdate** - Link to another table → Select **"Child Updates"** (self-link)
36. **SupersededBy** - Link to another table → Select **"Child Updates"** (self-link)

### 2.7 Create the Update ID Formula

After all fields are created, update the **Update ID** field formula:
```
{ChildID} & " | " & IF({SourceType} = "field", {Period}, {AcademicTerm}) & " | " & {SourceType}
```

### 2.8 Create Views

1. **Pending Review**
   - Filter: `Status` is `submitted_unverified` OR `Status` is `needs_correction`
   - Sort by: `SubmittedAt` (descending)

2. **Published**
   - Filter: `Status` is `published`
   - Sort by: `SubmittedAt` (descending)

3. **Field Updates**
   - Filter: `SourceType` is `field`
   - Sort by: `Period` (descending)

4. **Academic Updates**
   - Filter: `SourceType` is `academic`
   - Sort by: `AcademicTerm` (descending)

5. **By Period**
   - Group by: `Period` (for field updates) or `AcademicTerm` (for academic updates)
   - Sort by: `SubmittedAt` (descending)

---

## Step 3: Update Environment Variables

Add these to your `.env.local` (your Airtable API key and base ID are already configured):

```bash
AIRTABLE_CHILDREN_TABLE=Children
AIRTABLE_CHILD_UPDATES_TABLE=Child Updates
```

**Note:** Your existing Airtable credentials are already set:
- `AIRTABLE_API_KEY` ✅
- `AIRTABLE_BASE_ID=app73ZPGbM0BQTOZW` ✅

Just add the two new table names above.

Also add them to Vercel environment variables for production.

---

## Step 4: Populate Children Table (One-Time Migration)

After creating the Children table, populate it from your existing Sponsorships table.

### Option 1: Use the Migration Script (Recommended)

A migration script is already created and ready to use:

```bash
npm run migrate-children
```

This script will:
- ✅ Read all sponsorships from your existing table
- ✅ Extract unique children (by ChildID)
- ✅ Check for existing children (won't create duplicates)
- ✅ Create new child records in batches
- ✅ Map statuses and parse names automatically

**Prerequisites:**
- Children table must be created first (Step 1)
- Environment variables must include `AIRTABLE_CHILDREN_TABLE=Children`

### Option 2: Manual Entry

If you prefer, you can manually copy child data from Sponsorships to Children table.

---

## Step 5: Verify Setup

### Test Checklist

- [ ] Children table created with all fields
- [ ] Child Updates table created with all fields
- [ ] All single select options configured
- [ ] All views created
- [ ] Update ID formula working correctly
- [ ] Links between tables working (Children ↔ Sponsorships, Child Updates ↔ Children)
- [ ] Environment variables added
- [ ] At least one test child record created
- [ ] At least one test update record created

### Test Record Example

**Children Table:**
- Child ID: `BAN-0001`
- FirstName: `Test`
- Status: `active`
- (other fields as needed)

**Child Updates Table:**
- Child: Link to `BAN-0001`
- SourceType: `field`
- Period: `2026-01`
- Status: `submitted_unverified`
- SubmittedBy: `field-updates@beanumber.org`
- (other fields as needed)

---

## Troubleshooting

### Formula Not Working
- Make sure field names match exactly (case-sensitive)
- Check that all referenced fields exist
- Verify field types are correct

### Links Not Working
- Ensure table names match exactly
- Check that the linked table exists
- Verify field types are "Link to another table"

### Single Select Options Missing
- Go to field settings
- Add each option manually
- Save after adding all options

---

## Next Steps

After setup is complete:
1. Update `src/lib/env.ts` to include new table names
2. Update `src/lib/types/airtable.ts` with new types
3. Test the API endpoints that use these tables
4. Migrate existing data if needed

---

## Support

If you encounter issues:
1. Check field names match exactly (case-sensitive)
2. Verify all single select options are created
3. Ensure links between tables are configured
4. Check Airtable API permissions
