# Verify Sponsor Login

## Objective

Authenticate a sponsor using their email and sponsor code, returning their sponsorship information if valid.

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Sponsor's email address |
| code | string | Yes | Sponsor code (format: BAN-YYYY-XXX) |

## Prerequisites

- Valid sponsor record must exist in Airtable Sponsorships table
- Sponsor must have "Active" status
- Email and code must match the same sponsorship record

## Steps

### 1. Validate Input Format

**Description**: Ensure email and sponsor code are valid formats before querying database

**Tool**: `src/lib/validation.ts` (validateLoginCredentials)

**Input**:
```json
{
  "email": "sponsor@example.com",
  "code": "BAN-2024-001"
}
```

**Expected Output**:
```json
{
  "success": true,
  "data": {
    "email": "sponsor@example.com",
    "code": "BAN-2024-001"
  }
}
```

**On Failure**: Return validation error to user with specific field that failed

---

### 2. Query Airtable for Sponsorship

**Description**: Look up sponsorship record matching email and code

**Tool**: `src/lib/airtable.ts` (getSponsorByEmailAndCode)

**Input**: Use validated email and code from step 1

**Expected Output**:
```json
{
  "id": "recXXXXXX",
  "sponsorCode": "BAN-2024-001",
  "sponsorEmail": "sponsor@example.com",
  "sponsorName": "John Doe",
  "childName": "Child Name",
  "status": "Active"
}
```

**On Failure**:
- If no record found: Return "Invalid credentials" (don't reveal which field is wrong)
- If multiple records: Log warning and use first match

---

### 3. Verify Sponsorship Status

**Description**: Ensure sponsorship is active

**Check**: `sponsorship.status === 'Active'`

**On Failure**: Return "Your sponsorship is not currently active. Please contact support."

---

### 4. Generate Session Token

**Description**: Create authenticated session for the sponsor

**Tool**: `src/lib/auth.ts` (createSponsorSession)

**Input**:
```json
{
  "sponsorId": "recXXXXXX",
  "sponsorCode": "BAN-2024-001",
  "email": "sponsor@example.com"
}
```

**On Failure**: Log error and return generic authentication error

---

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| success | boolean | Whether authentication succeeded |
| sponsorship | object | Sponsorship details (if successful) |
| sessionToken | string | JWT token for session (if successful) |
| error | string | Error message (if failed) |

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Invalid email format | User entered malformed email | Show validation error |
| Invalid code format | Code doesn't match BAN-YYYY-XXX | Show validation error |
| No matching record | Email/code don't match | Show generic "Invalid credentials" |
| Inactive sponsorship | Sponsorship ended or paused | Show status-specific message |
| Database error | Airtable API issue | Log error, show "Please try again" |

## Security Notes

- Never reveal whether email or code was incorrect (prevents enumeration)
- Rate limit login attempts to prevent brute force
- Log all authentication attempts for audit trail
- Session tokens should expire after reasonable period

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2024-01-22 | Created workflow | System |
