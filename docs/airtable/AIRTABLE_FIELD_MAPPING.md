# Airtable Field Mapping Guide

This document maps the exact field names used in the webhook integration to your Airtable tables.

## Donors Table

| Field Name in Code | Airtable Field Name | Type | Required |
|-------------------|---------------------|------|----------|
| `Donor Name` | Donor Name | Single line text | Yes (Primary) |
| `Email Address` | Email Address | Single line text | Yes |
| `Organization Name` | Organization Name | Single line text | No |
| `Phone Number` | Phone Number | Single line text | No |
| `Mailing Address` | Mailing Address | Single line text | No |
| `Stripe Customer ID` | Stripe Customer ID | Single line text | No |

**Note:** The webhook will automatically:
- Match donors by Stripe Customer ID first
- Fall back to email matching if no Stripe ID
- Create new donor if no match found
- Update existing donor with Stripe Customer ID if found by email

## Donations Table

| Field Name in Code | Airtable Field Name | Type | Required |
|-------------------|---------------------|------|----------|
| `Stripe Payment Intent ID` | Stripe Payment Intent ID | Single line text | Yes (Primary) |
| `Stripe Checkout Session ID` | Stripe Checkout Session ID | Single line text | Yes |
| `Stripe Customer ID` | Stripe Customer ID | Single line text | No |
| `Donation Amount` | Donation Amount | Currency | Yes |
| `Currency` | Currency | Single line text | Yes |
| `Donation Date` | Donation Date | Date | Yes |
| `Payment Status` | Payment Status | Single select | Yes |
| `Recurring Donation` | Recurring Donation | Checkbox | Yes |
| `Donor` | Donor | Linked record (to Donors) | Yes |
| `Donor Email at Donation` | Donor Email at Donation | Single line text | Yes |
| `Donation Source` | Donation Source | Single select | Yes |
| `Subscription ID` | Subscription ID | Single line text | No |
| `Address Line 1` | Address Line 1 | Single line text | No |
| `City` | City | Single line text | No |
| `State` | State | Single line text | No |
| `Postal Code` | Postal Code | Single line text | No |
| `Country` | Country | Single line text | No |

**Payment Status Options:**
- Succeeded
- Pending
- Failed
- Refunded

**Donation Source Options:**
- Website
- Manual Entry
- Event
- Other

## Communications Table

| Field Name in Code | Airtable Field Name | Type | Required |
|-------------------|---------------------|------|----------|
| `Subject` | Subject | Single line text | Yes (Primary) |
| `Email Body` | Email Body | Long text | Yes |
| `Send Date` | Send Date | Date | Yes |
| `Recipient Email` | Recipient Email | Single line text | Yes |
| `Status` | Status | Single select | Yes |
| `Email Type` | Email Type | Single select | Yes |
| `Related Donation` | Related Donation | Linked record (to Donations) | Yes |
| `Related Donor` | Related Donor | Linked record (to Donors) | Yes |

**Status Options:**
- Pending
- Sent
- Failed

**Email Type Options:**
- Thank You
- Receipt
- Newsletter
- Other

## Environment Variables

Add these to Vercel (in addition to existing Stripe/SendGrid vars):

```
AIRTABLE_API_KEY=pat_your_personal_access_token
AIRTABLE_BASE_ID=app_your_base_id
AIRTABLE_DONORS_TABLE=Donors
AIRTABLE_DONATIONS_TABLE=Donations
AIRTABLE_COMMUNICATIONS_TABLE=Communications
```

**Note:** Table names are case-sensitive. If your tables have different names, update the environment variables accordingly.
