# Process Recurring Payment

## Objective

Handle recurring subscription payments from Stripe, record in Airtable, and send follow-up thank-you emails.

## Trigger

Stripe webhook event: `invoice.payment_succeeded`

## Inputs

| Input | Type | Source | Description |
|-------|------|--------|-------------|
| invoiceId | string | Stripe | Invoice ID |
| subscriptionId | string | Stripe | Subscription ID |
| customerId | string | Stripe | Customer ID |
| email | string | Stripe | Customer email |
| name | string | Stripe | Customer name |
| amountCents | number | Stripe | Payment amount in cents |
| currency | string | Stripe | Currency code |
| paymentDate | string | Stripe | ISO timestamp |
| billingReason | string | Stripe | Why invoice was created |

## Prerequisites

- Stripe webhook configured with `invoice.payment_succeeded` event
- STRIPE_WEBHOOK_SECRET environment variable set
- Airtable credentials configured (optional - for recording)
- Email service configured (Gmail or SendGrid)

## Steps

### 1. Filter for Subscription Renewals

**Description**: Skip initial subscription payments (already handled by checkout.session.completed)

**Check**: `billing_reason === 'subscription_cycle'`

**Billing Reasons**:
- `subscription_cycle` - Regular renewal (PROCESS THIS)
- `subscription_create` - Initial subscription (SKIP)
- `subscription_update` - Plan change (SKIP)
- `manual` - Manual invoice (SKIP)

---

### 2. Record Donation in Airtable

**Description**: Create donation record for the recurring payment

**Tool**: `src/lib/tools/donation/process-recurring-payment.ts`

**Fields**:
- Stripe Payment Intent ID: Use invoice ID
- Subscription ID: From Stripe
- Amount: amountCents / 100
- Payment Status: Succeeded
- Recurring Donation: true
- Donation Source: "Website - Recurring"

**Idempotency**: Check if invoice already recorded before creating

---

### 3. Send Follow-Up Thank-You Email

**Description**: Thank donor for their continued support

**Tool**: `src/lib/email.ts` (sendRecurringDonationThankYouEmail)

**Content**:
- Acknowledge monthly contribution
- Show donation amount
- Highlight ongoing impact
- Link to impact page

---

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| success | boolean | Whether processing succeeded |
| invoiceId | string | Stripe invoice ID |
| donationId | string | Airtable record ID (if created) |
| emailSent | boolean | Whether email was sent |
| skipped | boolean | True if billing_reason was not subscription_cycle |
| skipReason | string | Why processing was skipped |

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Invalid billing_reason | Not a renewal | Skip gracefully (not an error) |
| Airtable error | API issue | Log and continue (don't fail) |
| Email error | Send failed | Log and continue (don't fail) |
| Duplicate invoice | Already processed | Skip (idempotent) |

## Stripe Event Example

```json
{
  "type": "invoice.payment_succeeded",
  "data": {
    "object": {
      "id": "in_1234567890",
      "subscription": "sub_1234567890",
      "customer": "cus_1234567890",
      "customer_email": "donor@example.com",
      "customer_name": "John Doe",
      "amount_paid": 5000,
      "currency": "usd",
      "billing_reason": "subscription_cycle",
      "created": 1706000000
    }
  }
}
```

## Related Files

- **Webhook**: `src/app/api/webhooks/stripe/route.ts`
- **Tool**: `src/lib/tools/donation/process-recurring-payment.ts`
- **Email**: `src/lib/email.ts` (sendRecurringDonationThankYouEmail)

## Testing

1. Create test subscription in Stripe
2. Use Stripe CLI to forward webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
3. Trigger test invoice: `stripe invoices create --customer cus_xxx --auto-advance`
4. Verify email received and Airtable record created

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-22 | Created workflow | System |
