# List Available Children

## Objective

Display children awaiting sponsors on the public sponsorship catalog page.

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| limit | number | No | Maximum number of children to return |

## Prerequisites

- Airtable contains sponsorship records with Status="Awaiting Sponsor"
- No authentication required (public endpoint)

## Steps

### 1. Query Airtable for Available Children

**Description**: Fetch all sponsorship records with "Awaiting Sponsor" status

**Tool**: `src/lib/tools/sponsors/list-available-children.ts` (listAvailableChildrenTool)

**Input**:
```json
{
  "limit": 50
}
```

**Expected Output**:
```json
{
  "success": true,
  "data": {
    "children": [
      {
        "recordId": "recXXXXXX",
        "id": "CHILD-001",
        "displayName": "Child Name",
        "age": "8 years",
        "location": "Gulu, Uganda",
        "photo": {
          "url": "https://...",
          "filename": "photo.jpg"
        }
      }
    ],
    "total": 5
  }
}
```

**On Failure**: Return error message to display on page

---

### 2. Display Child Catalog

**Description**: Render available children in a grid format

**UI Elements**:
- Photo (or placeholder if none)
- Display name
- Age (if available)
- Location (if available)
- "Sponsor [Name]" button

**On Empty**: Display "All Children Are Sponsored!" message with contact options

---

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| success | boolean | Whether the query succeeded |
| children | array | List of available children profiles |
| total | number | Total count of available children |
| error | string | Error message (if failed) |

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Database error | Airtable API issue | Display retry button |
| No children | All sponsored | Show congratulations message |
| Network error | Connectivity issue | Display offline message |

## Related Files

- **Page**: `src/app/sponsorship/page.tsx`
- **API**: `src/app/api/sponsorship/available/route.ts`
- **Tool**: `src/lib/tools/sponsors/list-available-children.ts`
- **Airtable**: `src/lib/airtable.ts` (findAvailableChildren)

## Sponsor Button Flow

When user clicks "Sponsor [Name]":
1. Currently redirects to `/contact` with pre-filled subject
2. Future enhancement: Direct to Stripe checkout for sponsorship payment

## Notes

- Photos are served directly from Airtable attachments
- Cache can be added for performance (revalidate every 5 minutes)
- Consider adding pagination for large catalogs

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-22 | Created workflow | System |
