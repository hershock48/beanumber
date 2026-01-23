# Send Sponsor Welcome Email

## Objective

Send a welcome email to a new sponsor with their credentials and dashboard access information.

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| sponsorEmail | string | Yes | Sponsor's email address |
| sponsorName | string | Yes | Sponsor's full name |
| childName | string | Yes | Child's display name |
| sponsorCode | string | Yes | Generated sponsor code (BAN-YYYY-XXX) |

## Prerequisites

- Sponsorship has been created in Airtable
- Sponsor code has been generated
- Email service is configured (Gmail or SendGrid)

## Steps

### 1. Validate Input

**Description**: Ensure all required fields are present and valid

**Tool**: `src/lib/tools/email/send-sponsor-welcome.ts` (sendSponsorWelcomeTool)

**Validation**:
- Email format must be valid
- Sponsor code must match BAN-YYYY-XXX format
- Names must not be empty

---

### 2. Build Welcome Email

**Description**: Generate personalized HTML welcome email

**Content includes**:
- Welcome message with sponsor and child names
- Sponsor credentials (code and email)
- Dashboard access button
- What to expect (quarterly updates, photos, impact reports)
- Contact information

---

### 3. Send Email

**Description**: Send email via Gmail API (primary) or SendGrid (fallback)

**Tool**: `src/lib/email.ts` (sendSponsorWelcomeEmail)

**Priority**:
1. Gmail API (if GOOGLE_REFRESH_TOKEN configured)
2. SendGrid (if SENDGRID_API_KEY configured)
3. Logged only (if neither configured)

---

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| success | boolean | Whether email was sent |
| messageId | string | Email message ID (if sent) |
| provider | string | Which provider was used |
| recipientEmail | string | Where email was sent |
| sponsorCode | string | The sponsor code included |
| error | string | Error message (if failed) |

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Invalid email | Malformed email address | Return validation error |
| Invalid code | Wrong format | Return validation error |
| Send failed | Provider error | Log and return error |
| No provider | No email configured | Log but don't fail |

## Integration

### After Sponsorship Creation
```typescript
// After creating sponsorship
const createResult = await createSponsorshipTool({
  recordId: childRecordId,
  sponsorEmail: email,
  sponsorName: name,
});

if (createResult.success) {
  // Send welcome email
  const welcomeResult = await sendSponsorWelcomeTool({
    sponsorEmail: createResult.data.sponsorEmail,
    sponsorName: name,
    childName: createResult.data.childName,
    sponsorCode: createResult.data.sponsorCode,
  });
}
```

## Email Content

### Subject
`Welcome! You're now supporting [Child Name]`

### Body Sections
1. **Header**: "Welcome to Be A Number!"
2. **Greeting**: Personal thank you message
3. **Credentials Box**: Sponsor code and email
4. **CTA Button**: "Access Your Dashboard"
5. **What's Next**: List of what to expect
6. **Footer**: Organization info and website

## Related Files

- **Tool**: `src/lib/tools/email/send-sponsor-welcome.ts`
- **Email Service**: `src/lib/email.ts` (sendSponsorWelcomeEmail)
- **Constants**: `src/lib/constants.ts` (SPONSOR_CODE_PATTERN)

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-22 | Created workflow | System |
