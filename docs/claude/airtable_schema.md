# Airtable schema — tables, fields, singleSelect options, traps

Base: `Donor Management` (ID `app73ZPGbM0BQTOZW`).

> **Rule zero:** Before writing to Airtable from code, verify the field exists on the destination table. The Stripe webhook has returned 422 UNKNOWN_FIELD_NAME more than once because code tried to write fields that only exist on a different table, or don't exist at all. When in doubt, query the schema with the Airtable MCP tool `get_table_schema` and confirm.

> **Rule one:** singleSelect fields reject unknown values (422 INVALID_MULTIPLE_CHOICE_OPTIONS). You cannot add options via the REST API — Airtable's metadata API is blocked by the sandbox proxy. Either use an existing option, normalize to one in code, or ask Kevin to add the option in the Airtable UI.

## Tables

### Donors

The people who pay us. One record per unique email address.

Key fields:
- `Name` (single line text) — display name. Can be blank for anonymous.
- `Email` (email) — unique, lowercase, canonical identifier.
- `Stripe Customer ID` (single line text) — `cus_...`.
- `First Donation Date`, `Last Donation Date` (date).
- `Lifetime Total` (currency, rollup of Donations).
- `Status` (singleSelect: Active, Lapsed, Refunded, Test).
- `Tags` (multipleSelect).
- `Unsubscribed` (checkbox) — checked = respect unsub on all non-transactional email.
- Reverse links: `Donations`, `Sponsorships`, `Communications`.

Drip nurture fields (added April 16 for post-purchase conversion pipelines):
- `DripPipeline` (singleSelect: shirt_nurture, sponsor_onboard, donor_convert, shirt_sponsor, monthly_donor) — which sequence, if any. 5 pipelines, 17 total emails.
- `DripStage` (number) — 0 = first email pending, increments after each send, cleared when sequence completes. Max stages vary by pipeline (3–4).
- `DripNextSend` (date, ISO) — next scheduled send. Cron at `/api/cron/drip` checks daily.
- `DripChildName` (single line text) — child's first name for email personalization.
- `DripShirtNumber` (number) — for building `/children/N` and `/sponsorship?child=N` links.

Upsert key: `Email` (lowercased). If no match by email, try `Stripe Customer ID` as a secondary key before creating a new record.

### Donations

One record per money event (one-time donation, monthly recurring charge, shirt purchase, refund).

Key fields:
- `Amount` (currency).
- `Date` (datetime).
- `Donor` (linked record → Donors).
- `Stripe Payment Intent ID` / `Stripe Session ID` / `Stripe Invoice ID` (single line text).
- `Donation Source` (singleSelect) — **see trap below**.
- `Donation Note` (long text).
- `Status` (singleSelect: Succeeded, Refunded, Pending, Failed).
- `Receipt Sent` (checkbox).
- `Receipt URL` (URL, set by SendGrid template callback).
- `Sponsorship` (linked record → Sponsorships, set for subscription-generated donations).

**Fields that DO NOT exist on this table (webhook used to try to write these — don't):**

- `Subscription ID`
- `Organization Name`
- `Address Line 1`
- `City`
- `State`
- `Postal Code`
- `Country`

If the webhook collects a billing address from Stripe and you want to persist it, put it on **Donors**, not Donations. Or put a one-line string into `Donation Note`.

### Sponsorships

One record per active sponsor-to-child pairing. Lifecycle: created on subscription start, updated on each invoice, can be canceled or swapped.

Key fields:
- `Donor` (linked record → Donors).
- `Child` (linked record → Children).
- `ShirtNumber` (number) — **preferred join key** per the deferred `ChildID → ShirtNumber` migration note.
- `ChildID` (single line text) — **legacy join key**, still referenced by ~20 files. Migration deferred.
- `Stripe Subscription ID` (single line text) — `sub_...`.
- `Status` (singleSelect: Active, Paused, Canceled, Past Due).
- `Started` (date), `Canceled` (date, nullable).
- `ChildRevealedAt` (datetime, nullable) — **the reveal gate.** Until this is set, the sponsor portal shows the lockbox view.
- `Monthly Amount` (currency, default 25).
- `Total Paid` (currency, rollup).

### Children

The kids. One record per child at the YDO campus.

Key fields:
- `Name` (single line text) — full name.
- `FirstName` (single line text).
- `ShirtNumber` (number) — unique. **This is the public identifier**, used in URLs at `/children/[number]`.
- `Photo` (attachment, single) — required for homepage carousel appearance.
- `Birthday` (date).
- `Class` (single line text, e.g. "Primary 3").
- `Notes` (long text) — legacy freeform bio. Fallback on profile page when structured fields are empty.
- `HomeVillage` (single line text) — new April 15 intake field.
- `FamilyContext` (long text) — new.
- `Loves` (long text) — new.
- `ChildQuote` (long text) — new. Renders as Lora italic pull-quote.
- `TeacherName` (single line text) — new.
- `TeacherQuote` (long text) — new.

Half-filled intake is fine; the page renders each block conditionally.

### Child Updates

Content the YDO team publishes for sponsors. Delivered via sponsor portal + email.

Key fields:
- `Child` (linked record → Children).
- `Date` (date).
- `Title` (single line text).
- `Body` (long text, markdown).
- `Photos` (attachments, multiple).
- `Status` (singleSelect: Draft, Scheduled, Sent).
- `Scheduled For` (datetime, nullable).
- `Visible To` (singleSelect: All Sponsors, Sponsor of This Child, Admin Only).

### Communications

Log of outbound transactional/newsletter sends. Used for audit + unsubscribe enforcement.

Key fields:
- `Donor` (linked → Donors) or `Sponsorship` (linked → Sponsorships).
- `Type` (singleSelect: Thank You, Monthly Update, Receipt, Magic Link, Admin Notification, Newsletter).
- `Sent At` (datetime).
- `Subject` (single line text).
- `SendGrid Message ID` (single line text).
- `Status` (singleSelect: Sent, Delivered, Bounced, Opened, Clicked, Unsubscribed).

### Subscriptions

Shadow table for Stripe subscription state. Synced by webhook events. Don't edit by hand.

Key fields:
- `Stripe Subscription ID` (primary).
- `Sponsorship` (linked → Sponsorships).
- `Status` (mirrors Stripe: active, past_due, canceled, incomplete, trialing).
- `Current Period End` (datetime).
- `Cancel At Period End` (checkbox).

### Scheduled Posts

Social media / newsletter content queue. Dequeued by the cron at `/api/cron/publish-scheduled`.

Key fields:
- `Platform` (singleSelect: Instagram, Facebook, Newsletter).
- `Content` (long text).
- `Media` (attachments).
- `Scheduled For` (datetime).
- `Status` (singleSelect: Draft, Scheduled, Published, Failed).

### Newsletters

Assembled newsletter issues. Produced by `/api/cron/newsletter`.

Key fields:
- `Issue Number` (number).
- `Date` (date).
- `Subject` (single line text).
- `Body HTML` (long text).
- `Recipients` (number, at send time).
- `SendGrid Campaign ID` (single line text).

## Traps already hit (don't hit them again)

### Trap 1: Donation Source rejects unknown singleSelect values

Current valid options: `Website`, `Manual Entry`, `Event`, `Other`.

The code in `src/lib/tools/donation/upsertDonation.ts` wants to pass `Sponsorship`, `Shirt`, `Shirt + Monthly` to describe the flow, but those aren't options. The normalizer introduced in commit `2307241` does this:

```ts
const VALID_SOURCES = new Set(['Website', 'Manual Entry', 'Event', 'Other']);
const rawSource = donationData.donationSource || 'Website';
const sourceForAirtable = VALID_SOURCES.has(rawSource) ? rawSource : 'Website';
const sourceLabelForNote = VALID_SOURCES.has(rawSource) ? null : rawSource;
// Prefix the real label onto Donation Note as [Sponsorship], [Shirt], etc.
```

**Real fix:** Kevin adds `Sponsorship`, `Shirt`, `Shirt + Monthly` as options to the Donation Source singleSelect in Airtable's UI. When he does, remove the normalizer. Until then, the label lives in the Note prefix and we keep the record clean.

### Trap 2: The webhook tried to write address fields to Donations

Fields like `Address Line 1`, `City`, `State`, `Postal Code`, `Country` do not exist on the Donations table. They never did. Writing them returned 422 UNKNOWN_FIELD_NAME, the handler threw, the outer catch returned 500, Stripe retried, Stripe gave up. Fixed in commit `2307241` — those writes are removed. If you want to persist address info, put it on the Donors record (check that table's schema first) or shove it into `Donation Note` as a single string.

### Trap 3: `Subscription ID` vs `Stripe Subscription ID`

The field on Sponsorships is `Stripe Subscription ID`, not `Subscription ID`. Don't guess the field name from memory; copy it.

### Trap 4: ChildID vs ShirtNumber

`ChildID` is the legacy join key between Sponsorships and Children, still referenced in ~20 files. The Ugandan team only uses shirt numbers. We chose not to do the migration mid-stream. When writing new code, prefer `ShirtNumber` for new joins, but don't break the old path — add, don't replace.

### Trap 5: Airtable API can't modify schema

You cannot add singleSelect options, create fields, or rename fields via the REST API from this environment. The Airtable metadata API is blocked by the sandbox proxy (403, `X-Proxy-Error: blocked-by-allowlist`). Schema changes happen in the Airtable UI, manually. Flag needed changes to Kevin; don't spin your wheels trying to do it programmatically.

### Trap 6: Attachments need URLs, not bytes

Airtable attachment fields are written with a URL that Airtable then fetches and re-hosts. You cannot POST raw bytes. For uploads from the admin dashboard, upload to S3 first, get a public URL, then PATCH the record.

### Trap 7: `filterByFormula` is stringy and unforgiving

Quoting rules are finicky. Use `encodeURIComponent` on the formula. Test with the Airtable MCP `search_records` or `list_records_for_table` first if you're not sure.

## Quick reference: introspecting the schema

Use the Airtable MCP tool rather than guessing:

- `list_tables_for_base(base_id="app73ZPGbM0BQTOZW")` — list all tables.
- `get_table_schema(base_id="app73ZPGbM0BQTOZW", table_id_or_name="Donations")` — every field, field ID, singleSelect options.
- `list_records_for_table(...)` / `search_records(...)` — sample data before writing.

This is faster and more reliable than grepping the codebase for field names, because the codebase may be wrong.
