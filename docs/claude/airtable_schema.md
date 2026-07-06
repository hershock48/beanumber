# Airtable schema — tables, fields, singleSelect options, traps

Base: `Donor Management` (ID `app73ZPGbM0BQTOZW`).

> **Rule zero:** Before writing to Airtable from code, verify the field exists on the destination table. The Stripe webhook has returned 422 UNKNOWN_FIELD_NAME more than once because code tried to write fields that only exist on a different table, or don't exist at all. When in doubt, query the schema with the Airtable MCP tool `get_table_schema` and confirm.

> **Rule one:** singleSelect fields reject unknown values (422 INVALID_MULTIPLE_CHOICE_OPTIONS). You cannot add options via the REST API — Airtable's metadata API is blocked by the sandbox proxy. Either use an existing option, normalize to one in code, or ask Kevin to add the option in the Airtable UI.

> **Last verified against live schema:** 2026-05-11 via `list_tables_for_base`. If this doc drifts, trust the MCP tool output, then update this file.

## Tables

### Donors (`tblhuLpJgYLB0pTjx`)

The people who pay us. One record per unique email address.

Key fields:
- `Donor Name` (singleLineText) — display name. Can be blank for anonymous.
- `Organization Name` (singleLineText) — company/org if applicable.
- `Email Address` (singleLineText) — unique, lowercase, canonical identifier.
- `Phone Number` (singleLineText).
- `Mailing Address` (singleLineText).
- `Stripe Customer ID` (singleLineText) — `cus_...`.
- `Total Lifetime Giving` (currency) — computed by `updateDonorSummary()` in the webhook and the backfill endpoint.
- `First Donation Date` (date) — computed by `updateDonorSummary()`.
- `Most Recent Donation` (date) — computed by `updateDonorSummary()`.
- `Donor Status` (singleSelect) — computed by `updateDonorSummary()`. Values: check Airtable for current options.
- `Recurring Supporter` (checkbox) — computed by `updateDonorSummary()`.
- `Communication Opt-In` (checkbox) — has the donor consented to marketing emails beyond transactional receipts?
- `How They Heard` (singleSelect) — attribution source.
- `Notes` (multilineText) — internal relationship notes.

Reverse links (auto-managed by Airtable):
- `Donations` (multipleRecordLinks → Donations).
- `Sponsorships` (multipleRecordLinks → Sponsorships).
- `Subscriptions` (multipleRecordLinks → Subscriptions).

Drip nurture fields (post-purchase conversion pipelines, 5 pipelines / 17 emails):
- `DripPipeline` (singleSelect: shirt_nurture, sponsor_onboard, donor_convert, shirt_sponsor, monthly_donor).
- `DripStage` (number) — 0 = first email pending, increments after each send, cleared when sequence completes.
- `DripNextSend` (date) — next scheduled send. Cron at `/api/cron/drip` checks daily.
- `DripChildName` (singleLineText) — child's first name for email personalization. May be comma-separated for multi-shirt/repeat orders.
- `DripShirtNumber` (singleLineText) — shirt number(s) for building `/children/N` links. May be comma-separated.

Upsert key: `Email Address` (lowercased). If no match by email, try `Stripe Customer ID` as a secondary key before creating a new record.

**Pending deletion (tagged `[DELETE]` in Airtable, Kevin needs to delete in UI):** Profile Photo, Engagement Score, Preferred Contact Method, Communications (reverse link), Number of Donations (rollup), Exports (link to dead table).

### Donations (`tblw0ss8qpGL7l25s`)

One record per money event (one-time donation, monthly recurring charge, shirt purchase, refund).

Key fields:
- `Stripe Payment Intent ID` (singleLineText) — primary field.
- `Donation Date` (date).
- `Payment Status` (singleSelect).
- `Donation Amount` (currency).
- `Stripe Checkout Session ID` (singleLineText).
- `Currency` (singleLineText).
- `Recurring Donation` (checkbox).
- `Donor` (multipleRecordLinks → Donors).
- `Donation Note` (multilineText).
- `Donor Email at Donation` (singleLineText).
- `Stripe Customer ID` (singleLineText).
- `Donation Source` (singleSelect) — **see trap below**.
- `Child` (multipleRecordLinks → Children) — if this gift is tagged to a specific child.
- `Communications` (multipleRecordLinks → Communications).

Lookup/rollup fields (auto-computed by Airtable):
- `Donor Name (Lookup)` (multipleLookupValues).
- `Donor Status (Lookup)` (multipleLookupValues).
- `Donation Year` (formula).
- `Donor Lifetime Giving (Rollup)` (rollup).
- `Thank You Email Sent? (Rollup)` (rollup).

**Fields that DO NOT exist on this table (webhook used to try to write these — don't):**
- `Subscription ID`, `Organization Name`, `Address Line 1`, `City`, `State`, `Postal Code`, `Country`.
If the webhook collects a billing address from Stripe, put it on **Donors**, not Donations. Or shove it into `Donation Note`.

**Pending deletion:** Receipt Photo, Donation Note Summary (AI), Donation Impact Tag (AI), Exports.

### Sponsorships (`tbluUPB0FrtxZZi8S`)

One record per active sponsor-to-child pairing. Lifecycle: created on subscription start (or manually for missed sponsors), updated on each invoice, can be canceled or swapped.

Key fields:
- `SponsorCode` (singleLineText) — primary field. Format: `BAN-YYYY-NNN`.
- `SponsorEmail` (email).
- `SponsorName` (singleLineText).
- `ChildID` (singleLineText) — **legacy join key**, still referenced by ~20 files. Migration deferred.
- `ChildDisplayName` (singleLineText).
- `ChildPhoto` (multipleAttachments).
- `ChildAge` (singleLineText).
- `ChildLocation` (singleLineText).
- `Children` (multipleRecordLinks → Children).
- `Donor` (multipleRecordLinks → Donors).
- `Child Updates` (multipleRecordLinks → Child Updates).
- `Status` (singleSelect).
- `AuthStatus` (singleSelect).
- `VisibleToSponsor` (checkbox).
- `SponsorshipStartDate` (date).
- `MonthlyAmount` (currency, default 25).
- `StripeSubscriptionID` (singleLineText) — `sub_...`.
- `ChildRevealedAt` (dateTime, nullable) — **the reveal gate.** Until this is set, the sponsor portal shows the lockbox view.

Request/publish lifecycle fields:
- `RequestedBySponsor` (checkbox).
- `RequestedAt` (dateTime).
- `LastRequestAt` (dateTime).
- `NextRequestEligibleAt` (dateTime).
- `PublishedAt` (dateTime).

### Children (`tbl4po2E8c72MUpan`)

The kids. One record per child at the YDO campus.

Key fields:
- `ChildID` (singleLineText) — primary field.
- `ShirtNumber` (number) — unique. **This is the public identifier**, used in URLs at `/children/[number]`.
- `DisplayName` (singleLineText).
- `FirstName` (singleLineText).
- `LastInitial` (singleLineText).
- `DateOfBirth` (date).
- `Gender` (singleSelect).
- `ProfilePhoto` (multipleAttachments) — required for homepage carousel appearance.
- `Status` (singleSelect).
- `EnrollmentDate` (date).
- `GradeClass` (singleLineText).
- `SchoolLocation` (singleSelect).
- `Notes` (multilineText) — legacy freeform bio. Fallback on profile page when structured fields are empty.

Structured intake fields (April 15 redesign):
- `HomeVillage` (singleLineText).
- `FamilyContext` (singleLineText).
- `Loves` (singleLineText).
- `ChildQuote` (multilineText) — renders as Lora italic pull-quote.
- `TeacherName` (singleLineText).
- `TeacherQuote` (multilineText).
- `NameMeaning` (singleLineText) — renders as small italic line directly under the kid's name on `/[number]`. Cultural meaning of their Acholi/Luo name. Added May 28, 2026.

Shirt assignment fields:
- `ShirtAssignedAt` (dateTime) — BLANK means shirt number is available.
- `ShirtBuyerEmail` (email) — denormalized from linked Donation.
- `ShirtBuyerName` (singleLineText) — denormalized from linked Donation.
- `ReservedForAuction` (checkbox) — if checked, skip auto-assignment.

Update scheduling fields:
- `ExpectedFieldPeriod` (singleSelect).
- `ExpectedAcademicTerm` (singleSelect).
- `LastFieldUpdateDate` (date).
- `LastAcademicUpdateDate` (date).

Reverse links:
- `Associated Sponsorships` (multipleRecordLinks → Sponsorships).
- `Child Updates` (multipleRecordLinks → Child Updates).
- `Donations` (multipleRecordLinks → Donations).
- `Child ID` (singleLineText) — duplicate of ChildID? Verify in UI.

Half-filled intake is fine; the page renders each block conditionally.

### Child Updates (`tblrmtVBVzL7zCQDE`)

Content the YDO team publishes for sponsors. Delivered via sponsor portal + email.

Key fields:
- `UpdateID` (singleLineText) — primary field.
- `SponsorCode` (singleLineText).
- `UpdateType` (singleSelect).
- `Title` (singleLineText).
- `Content` (multilineText).
- `Child` (multipleRecordLinks → Children).
- `UpdateDate` (date).
- `Type` (singleSelect).
- `Status` (singleSelect).
- `Summary` (multilineText).
- `UpdateDetails` (multilineText).
- `Photos` (multipleAttachments).
- `VisibleToSponsor` (checkbox).
- `RequestedBySponsor` (checkbox).
- `RequestedAt` (dateTime).
- `PublishedAt` (dateTime).
- `Author` (singleLineText).
- `LastModified` (date).
- `Linked Sponsor Request` (multipleRecordLinks → Sponsorships).
- `Scheduled Posts` (multipleRecordLinks → Scheduled Posts).

Academic/wellbeing assessment fields:
- `PhysicalWellbeing`, `EmotionalWellbeing`, `SchoolEngagement` (singleSelect).
- `PhysicalNotes`, `EmotionalNotes`, `EngagementNotes` (multilineText).
- `SponsorNarrative` (multilineText).
- `PositiveHighlight`, `Challenge` (singleLineText).
- `AttendancePercent`, `EnglishGrade`, `MathGrade`, `ScienceGrade`, `SocialStudiesGrade` (number).
- `TeacherComment` (multilineText).

Google Drive file IDs (for pulling photos/docs from Drive):
- `DriveFolderID`, `Photo1FileID`, `Photo2FileID`, `Photo3FileID`, `HandwrittenNoteFileID`, `ReportCardFileID` (singleLineText).

Review workflow:
- `SubmittedAt` (dateTime), `SubmittedBy` (email).
- `ReviewedBy` (email), `ReviewedAt` (dateTime).
- `RejectionReason`, `CorrectionNotes` (multilineText).
- `SourceType`, `Period`, `AcademicTerm` (singleSelect).
- `ChildID` (singleLineText).

### Communications (`tblw7ZmsfcphmfsWT`)

Log of outbound transactional/newsletter sends. Used for audit + unsubscribe enforcement.

Key fields:
- `Subject` (singleLineText) — primary field.
- `Send Date` (date).
- `Status` (singleSelect).
- `Recipient Email` (singleLineText).
- `Email Type` (singleSelect).
- `Related Donation` (multipleRecordLinks → Donations).
- `Related Donor` (multipleRecordLinks → Donors).

**Pending deletion (11 fields tagged `[DELETE]`):** Email Body, Attachments, Stripe Event ID, Related Donation Amount, Related Donation Date, Related Donor Name, Related Donor Email, Days Since Sent, Is Thank You Sent?, Email Body Summary, Sentiment of Email.

### Subscriptions (`tbl3WANtB8pg7XZpw`)

Legacy shadow table for Stripe subscription state. Historical only — Postgres `subscriptions` is now the source of truth. The webhook still writes here during the observation window but nothing sponsor-facing reads from it. Don't edit by hand.

Key fields:
- `Subscription ID` (singleLineText) — primary field. `sub_...`.
- `Donor` (multipleRecordLinks → Donors).
- `Status` (singleSelect — mirrors Stripe: active, past_due, canceled, etc.).
- `Start Date` (date).
- `Current Period End` (date).
- `Amount` (currency).
- `Frequency` (singleSelect).

### Scheduled Posts (`tbltCdrr6ehpP8wX8`)

Social media / newsletter content queue. Dequeued by the cron at `/api/cron/publish-scheduled`.

Key fields:
- `ScheduledPostID` (autoNumber) — primary field.
- `Platform` (singleSelect).
- `ContentType` (singleSelect).
- `Caption` (multilineText).
- `Hashtags` (singleLineText).
- `ScheduledAt` (dateTime).
- `Status` (singleSelect).
- `PublishedAt` (dateTime).
- `MediaDriveId` (singleLineText), `MediaUrl` (url).
- `InstagramPostId`, `FacebookPostId` (singleLineText).
- `Error` (multilineText).
- `CreatedBy` (email), `CreatedAt` (dateTime).
- `Related Child Update` (multipleRecordLinks → Child Updates).
- `Review Needed` (checkbox).
- `Notes` (multilineText).

### Newsletters (`tblqP1zrRsh4mblHq`)

Monthly campus newsletters sent to all active sponsors. Kevin drafts here, sends on demand or via cron.

Key fields:
- `Title` (singleLineText) — primary field. Internal label.
- `Subject` (singleLineText) — email subject line as sponsors see it.
- `BodyHTML` (multilineText) — full HTML. Supports `{{sponsorFirstName}}` merge tag.
- `HeroPhoto` (multipleAttachments).
- `Status` (singleSelect).
- `SendDate` (dateTime) — if Status=Scheduled and SendDate ≤ now, cron picks it up.
- `PublishedAt` (dateTime) — actual send timestamp, written by code.
- `RecipientCount`, `SentCount`, `FailedCount` (number).
- `SendNotes` (multilineText).
- `Author` (singleLineText).

### Fulfillment (`tblkSZBRrMiHhT3MP`)

Production queue and shipping tracker. One row per shirt. Group by Design → Shirt Color for batch production.

Key fields:
- `Order #` (number) — primary field. The shirt number stamped inside the collar.
- `Design` (singleSelect).
- `Shirt Color` (singleSelect).
- `Size` (singleSelect).
- `Vinyl Front`, `Vinyl Back` (singleSelect) — auto-set based on shirt color.
- `Buyer` (singleLineText), `Email` (email).
- `Ship Name`, `Ship Street1`, `Ship Street2`, `Ship City`, `Ship State`, `Ship ZIP` (singleLineText).
- `Production` (singleSelect), `Shipping` (singleSelect).
- `Tracking` (singleLineText).
- `Child Name` (singleLineText).
- `Order Date` (date).
- `Notes` (multilineText).

### Exports (`tbljNFr1c4an7SrEr`) — DELETE THIS TABLE

Entirely unused. Zero records, zero code references. Kevin: delete the whole table from the tab bar.

## Traps already hit (don't hit them again)

### Trap 1: Donation Source rejects unknown singleSelect values (resolved May 13 for current code paths)

Current valid options: `Website`, `Manual Entry`, `Event`, `Other`, `Portal Repeat`, `Sponsorship`, `Shirt Order`, `Shirt + Monthly`. All values the current code actually passes are now valid Airtable options, so the normalizer never falls back in normal operation.

The normalizer introduced in commit `2307241` stays in place as a safety net for any future label the code might pass before Kevin adds it in the Airtable UI (e.g., a future "Founder's Series" or "Gift" source). It does this:

```ts
const VALID_SOURCES = new Set(['Website', 'Manual Entry', 'Event', 'Other']);
const rawSource = donationData.donationSource || 'Website';
const sourceForAirtable = VALID_SOURCES.has(rawSource) ? rawSource : 'Website';
const sourceLabelForNote = VALID_SOURCES.has(rawSource) ? null : rawSource;
// Prefix the real label onto Donation Note as [Sponsorship], [Shirt], etc.
```

**Status (May 13):** Done for current code paths. All four extra labels are valid Airtable options and the webhook's `VALID_SOURCES` set mirrors them. The normalizer stays as a safety net for any future label the code might pass (e.g., "Founder's Series", "Gift Shirt", "Gift Sponsorship") before the corresponding Airtable option is added.

### Trap 2: The webhook tried to write address fields to Donations

Fields like `Address Line 1`, `City`, `State`, `Postal Code`, `Country` do not exist on the Donations table. They never did. Writing them returned 422 UNKNOWN_FIELD_NAME. Fixed in commit `2307241` — those writes are removed. If you want to persist address info, put it on the Donors record or shove it into `Donation Note` as a single string.

### Trap 3: Field names in code vs Airtable

Field names in the codebase don't always match the actual Airtable field names. Examples: the doc used to say `Name` but the field is `Donor Name`; used to say `Email` but the field is `Email Address`; Sponsorships uses `StripeSubscriptionID` not `Stripe Subscription ID`. **Always verify with `get_table_schema` before writing.** Copy field names exactly.

### Trap 3.5: Cycle records — shirts #54+ resolve via the Batches table

**Source of truth: `core_model.md` §2.** This entry exists only to
note the historical formulas so a future Claude reading old code
isn't surprised. Cycle resolution lives in `src/lib/cycle.ts`
(`resolveShirtToKid`), backed by the Postgres `batches` table.

BAN has roughly 53 unique children at the YDO campus. Shirt numbers
go higher because shirts are an outreach product, not a child-count
cap. Each Batches row covers a contiguous range of shirt numbers and
locks an ordered `RosterSnapshot` of kids' ChildIDs. Inside a batch:

    shirt N → batch B where B.start ≤ N ≤ B.end
           → kid = B.snapshot[(N - B.start) mod B.snapshot.length]

In the Postgres world, the snapshot stores ChildID text values
(`HSP/BAN-001` etc.) directly. The kid page (`/children/[N]`) and
the `/api/children` API both call `resolveShirtToKid(N)`, then
hydrate the canonical kid via `getChildByChildId(...)`. The cycle
record's identity stays bound to the requested shirt N — synthesized
on the fly with `id=''`, `shirtNumber=N`, `childId=HSP/BAN-NNN` —
while presentation fields (ProfilePhoto, HomeVillage, FamilyContext,
ChildQuote, etc.) come from the canonical kid. Sponsorships and
donations link by the cycle-record ChildID, not the canonical UUID.

**Historical formulas** (still hardcoded as a safety-net fallback in
`canonicalShirtNumber()` for any shirt not yet covered by a Batches
row):

  - Era 1 (#54–150): `((N - 54) % 52) + 2` → kid 2–53. Naume (#1)
    excluded from the original cycle. #54 = kid 2 (Marvin),
    #67 = kid 15 (Isaiah), #105 = kid 53 (Amarorwot), #106 = kid 2
    (Marvin again, next loop), #150 = kid 46.
  - Era 2 (#151+): `((N - 151) % 53) + 1` → kid 1–53. Naume is in.

These formulas matched what was in the Airtable-era Batches; the
Postgres `batches` table is loaded with `RosterSnapshot` strings that
make `resolveShirtToKid` return the same results. New batches Kevin
opens past the current end (#150 as of 2026-06-22) won't follow these
formulas — they'll follow whatever roster is locked into the new
batch's snapshot.

**Operational implication:** the people, photos, bios are maintained
on records 1–53 only. Higher shirt numbers don't need their own
Children rows in Postgres — `resolveShirtToKid` reads the canonical
kid and the kid page synthesizes a cycle record at render time.

### Trap 4: ChildID vs ShirtNumber

`ChildID` is the legacy join key between Sponsorships and Children, still referenced in ~20 files. The Ugandan team only uses shirt numbers. We chose not to do the migration mid-stream. When writing new code, prefer `ShirtNumber` for new joins, but don't break the old path — add, don't replace.

### Trap 5: Airtable API can't delete fields or tables

You cannot delete fields, delete tables, add singleSelect options, or change field types via the REST API from this environment. The Airtable metadata API is blocked by the sandbox proxy (403, `X-Proxy-Error: blocked-by-allowlist`). You CAN rename fields and update descriptions via `update_field`. Schema changes that require deletion happen in the Airtable UI manually.

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
