# Verify Email Integration

## Objective

Verify that the email integration (Gmail or SendGrid) is correctly configured and operational in the current environment.

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| testRecipient | string | Yes | Email address to send test email to |
| environment | string | No | Environment name (local, staging, production) |

## Prerequisites

- Environment variables configured (see `.env.local.example`)
- For Gmail: OAuth credentials and refresh token generated
- For SendGrid: API key configured

## Steps

### Step 1: Check Environment Configuration

**Tool**: Manual check / `src/lib/env.ts`

Check which email provider is configured:

```typescript
import { isGmailConfigured, isSendGridConfigured, getEmailConfig } from '../lib/env';

const gmailConfigured = isGmailConfigured();
const sendgridConfigured = isSendGridConfigured();
const config = getEmailConfig();

console.log('Email Configuration:', {
  provider: config.provider,
  enabled: config.enabled,
  gmailConfigured,
  sendgridConfigured,
  fromEmail: config.fromEmail,
});
```

**Expected Output**:
```json
{
  "success": true,
  "data": {
    "provider": "gmail" | "sendgrid",
    "enabled": true,
    "fromEmail": "configured-email@example.com"
  }
}
```

### Step 2: Send Test Email

**Tool**: `src/lib/tools/send-email.ts`

Send a test email to verify the integration is working:

```typescript
import { sendEmailTool } from '../lib/tools/send-email';

const result = await sendEmailTool({
  to: 'test-recipient@example.com',
  subject: 'Email Integration Test',
  html: `
    <h1>Email Integration Test</h1>
    <p>This is a test email to verify the email integration is working correctly.</p>
    <p><strong>Environment:</strong> ${process.env.NODE_ENV}</p>
    <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
  `,
});

console.log('Send Result:', result);
```

**Expected Output**:
```json
{
  "success": true,
  "data": {
    "messageId": "gmail-message-id",
    "provider": "gmail",
    "recipientCount": 1
  }
}
```

### Step 3: Verify Delivery

**Manual Step**:

1. Check the test recipient's inbox for the test email
2. Verify the email arrived within a reasonable time (typically < 1 minute)
3. Check spam/junk folder if not in inbox
4. Verify email content is rendered correctly

### Step 4: Check Logs

**Tool**: Logger / Vercel Logs

Review application logs to confirm:
- Email was logged as sent successfully
- No errors or warnings in the email flow
- Provider information is correct

**Expected Log Entry**:
```
INFO: Email sent successfully via Gmail
  - to: [masked email]
  - subject: Email Integration Test
  - messageId: [message-id]
```

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| configValid | boolean | Whether email configuration is valid |
| provider | string | Active email provider (gmail/sendgrid) |
| testEmailSent | boolean | Whether test email was sent successfully |
| messageId | string | Message ID from provider |

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Gmail not configured | Missing GMAIL_* env vars | Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN |
| Authentication failed | Invalid/expired refresh token | Regenerate refresh token (see GMAIL_SETUP.md) |
| Permission denied | Missing Gmail API scope | Re-authorize with gmail.send scope |
| Rate limit exceeded | Too many emails sent | Wait and retry; consider upgrading quota |
| SendGrid API error | Invalid API key | Verify SENDGRID_API_KEY is correct |

## Notes

- Gmail takes priority over SendGrid when both are configured
- Test emails should be sent to addresses you control
- Production testing should use minimal test emails to avoid rate limits
- Gmail rate limit: 2,000 emails/day for Google Workspace

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-01-22 | Initial workflow creation | Claude |
