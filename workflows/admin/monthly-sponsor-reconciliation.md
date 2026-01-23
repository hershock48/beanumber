# Monthly Sponsor Reconciliation

## Objective

Compare Stripe subscription status with Airtable donation records to identify mismatches, failed payments, and canceled subscriptions.

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| sinceDate | string | No | Only check subscriptions created after this date |
| includeDetails | boolean | No | Include full mismatch details in output |

## Prerequisites

- STRIPE_SECRET_KEY environment variable configured
- Airtable credentials configured
- Admin authentication required

## Steps

### 1. Fetch Stripe Subscriptions

**Description**: Get all subscriptions from Stripe

**Data Retrieved**:
- Subscription ID
- Customer ID and email
- Status (active, canceled, past_due, etc.)
- Amount and currency
- Created date

---

### 2. Fetch Airtable Records

**Description**: Get all recurring donations with subscription IDs

**Query**: Donations where `Recurring Donation = TRUE` and `Subscription ID` is not empty

---

### 3. Compare Records

**Description**: Identify mismatches between the two systems

**Mismatch Types**:

| Type | Description | Action |
|------|-------------|--------|
| `missing_in_airtable` | Active Stripe sub not in Airtable | Create donation record |
| `missing_in_stripe` | Airtable record with invalid sub ID | Investigate/update record |
| `status_mismatch` | Payment status doesn't match | Update Airtable status |
| `canceled_subscription` | Sub canceled but record active | Mark as inactive |

---

### 4. Generate Report

**Description**: Create summary of findings

**Report Includes**:
- Total Stripe subscriptions
- Total Airtable records
- Mismatch counts by type
- Detailed mismatch list

---

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| success | boolean | Whether reconciliation succeeded |
| totalStripeSubscriptions | number | Count of Stripe subs |
| totalAirtableSponsorships | number | Count of Airtable records |
| mismatches | array | List of mismatches found |
| mismatchSummary | object | Counts by mismatch type |
| reconciliationDate | string | When reconciliation ran |

## API Endpoint

```bash
# Basic reconciliation
curl -H "X-Admin-Token: $ADMIN_TOKEN" \
  "https://your-site.com/api/admin/reconciliation"

# With date filter
curl -H "X-Admin-Token: $ADMIN_TOKEN" \
  "https://your-site.com/api/admin/reconciliation?since=2026-01-01"

# With full details
curl -H "X-Admin-Token: $ADMIN_TOKEN" \
  "https://your-site.com/api/admin/reconciliation?details=true"
```

## Recommended Schedule

Run monthly on the 1st:
- Review report for mismatches
- Address failed payments
- Update canceled subscriptions
- Create missing Airtable records

## Resolution Actions

### Missing in Airtable
1. Find corresponding checkout session
2. Manually create donation record
3. Link to donor record

### Canceled Subscription
1. Update Airtable record status
2. Contact sponsor if needed
3. Update sponsorship status if applicable

### Status Mismatch
1. Check current Stripe status
2. Update Airtable to match
3. Send appropriate communication if payment failed

## Related Files

- **API**: `src/app/api/admin/reconciliation/route.ts`
- **Tool**: `src/lib/tools/donation/reconcile-subscriptions.ts`

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-22 | Created workflow | System |
