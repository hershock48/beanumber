# Onboard New Sponsor

## Objective

Create a new sponsorship by assigning a sponsor to an available child after payment confirmation.

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| recordId | string | Yes | Airtable record ID of child's placeholder |
| sponsorEmail | string | Yes | Sponsor's email address |
| sponsorName | string | No | Sponsor's full name |

## Prerequisites

- Child record must exist with Status="Awaiting Sponsor"
- Payment confirmed (Stripe checkout completed)
- Admin authentication required

## Steps

### 1. Validate Sponsor Information

**Description**: Ensure sponsor email is valid and record exists

**Tool**: `src/lib/tools/sponsors/create-sponsorship.ts` (createSponsorshipTool)

**Validation**:
- Email format must be valid
- recordId must reference existing Airtable record
- Child must have Status="Awaiting Sponsor"

**On Failure**: Return specific validation error

---

### 2. Generate Sponsor Code

**Description**: Create unique sponsor code for portal access

**Format**: `BAN-YYYY-XXX` (e.g., BAN-2026-123)

**Uniqueness**: Random 3-digit suffix minimizes collision risk

---

### 3. Assign Sponsor to Child

**Description**: Update Airtable record with sponsor information

**Tool**: `src/lib/airtable.ts` (assignSponsorToChild)

**Updates**:
- SponsorCode: Generated code
- SponsorEmail: Validated email
- SponsorName: If provided
- AuthStatus: "Active"
- Status: "Active" (from "Awaiting Sponsor")
- VisibleToSponsor: true
- SponsorshipStartDate: Today's date

---

### 4. Send Welcome Email

**Description**: Notify sponsor with their credentials

**Tool**: `src/lib/tools/email/send-sponsor-welcome.ts` (sendSponsorWelcomeTool)

**Content**:
- Sponsor code for portal access
- Child's name and photo
- Link to sponsor dashboard
- What to expect (updates frequency, etc.)

---

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| success | boolean | Whether sponsorship was created |
| sponsorCode | string | Generated sponsor code |
| sponsorEmail | string | Sponsor's email |
| childId | string | Child's ID |
| childName | string | Child's display name |
| sponsorshipStartDate | string | When sponsorship began |
| error | string | Error message (if failed) |

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Invalid email | Malformed email address | Return validation error |
| Record not found | Invalid recordId | Return "Child not found" |
| Already sponsored | Status changed | Return "No longer available" |
| Database error | Airtable API issue | Log and return generic error |

## Integration Points

### After Stripe Checkout
```javascript
// In webhook handler
case 'checkout.session.completed': {
  const session = event.data.object;

  // Extract sponsor info from session metadata
  const { childRecordId, sponsorEmail, sponsorName } = session.metadata;

  // Create sponsorship
  const result = await createSponsorshipTool({
    recordId: childRecordId,
    sponsorEmail,
    sponsorName,
  });

  if (result.success) {
    // Send welcome email
    await sendSponsorWelcomeTool({
      sponsorCode: result.data.sponsorCode,
      sponsorEmail: result.data.sponsorEmail,
      childName: result.data.childName,
    });
  }
}
```

## Related Files

- **API**: `src/app/api/sponsorship/create/route.ts`
- **Tool**: `src/lib/tools/sponsors/create-sponsorship.ts`
- **Airtable**: `src/lib/airtable.ts` (assignSponsorToChild)
- **Welcome Email**: `src/lib/tools/email/send-sponsor-welcome.ts` (future)

## Security Notes

- Admin authentication required for direct API calls
- Email is normalized to lowercase
- Sponsor code generation uses secure randomness

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-22 | Created workflow | System |
