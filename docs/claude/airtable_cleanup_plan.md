# Airtable cleanup plan

> Hand-off for Kevin to execute in the Airtable UI. Verified against the live schema on 2026-05-21 via `get_table_schema`.

The Airtable base has accumulated ~25 fields and one whole table that no code touches, plus a Child Updates table that's grown to ~40 fields supporting a compliance/review workflow we've decided to retire. This plan splits the cleanup into two phases so we don't break working code while we trim.

## Phase 1 — safe to delete today

These fields are already tagged `[DELETE]` in Airtable and verified unused in code. Open each table in Airtable, right-click the field header, Delete field. Confirm. Move on.

### Donors table

| Field name | Field ID | Why it can go |
|---|---|---|
| [DELETE] Profile Photo | fld2PULfiIEFEM0zV | No reads/writes |
| [DELETE] Engagement Score | fldNs0Uqsymmkq1fh | No reads/writes |
| [DELETE] Communications | fldoJoO0VPmCDeZ01 | Reverse link, unused |
| [DELETE] Number of Donations | fldC2N6i8bq8Hi1GR | Rollup nothing reads — `updateDonorSummary()` computes this directly |
| [DELETE] Exports | fldYbv2E893GFjRfP | Link to dead Exports table |
| [DELETE] Preferred Contact Method | fldJIEsTLasJixOIZ | No reads/writes |

### Donations table

| Field name | Field ID | Why it can go |
|---|---|---|
| [DELETE] Receipt Photo | fldZ6KNT6ntYjLBEY | No reads/writes |
| [DELETE] Donation Note Summary (AI) | fldX3KeAaoEMJBHwJ | Airtable AI field nothing reads |
| [DELETE] Donation Impact Tag (AI) | fldN2WOyuDauR4Wa4 | Airtable AI field nothing reads |
| [DELETE] Exports | fldCVczoWpA2A4eGH | Link to dead Exports table |

### Communications table

| Field name | Field ID | Why it can go |
|---|---|---|
| [DELETE] Email Body | fldBIAFUpiBAx2lKA | No code writes full email body here |
| [DELETE] Attachments | fldQ8Viz7tlUc59o2 | No reads/writes |
| [DELETE] Stripe Event ID | fldT7vJWCpibOtlQa | No code writes Stripe event IDs here |
| [DELETE] Related Donation Amount | fld9vYwV4FaoO3xLw | Lookup nothing reads |
| [DELETE] Related Donation Date | fldprPupEB3ygdzq6 | Lookup nothing reads |
| [DELETE] Related Donor Name | fldkbxL2kDUzcaYHa | Lookup nothing reads |
| [DELETE] Related Donor Email | fldptiJd6QnfBxPej | Lookup nothing reads |
| [DELETE] Days Since Sent | fldiiBdr1U3bJ3kEw | Formula nothing reads |
| [DELETE] Is Thank You Sent? | fldNMIvBEMW1bkhH2 | Formula nothing reads |
| [DELETE] Email Body Summary | fldRY4veHlCDidAHS | Airtable AI nothing reads |
| [DELETE] Sentiment of Email | fldqlL9UbVQ2CkZAH | Airtable AI nothing reads |

### Exports table (delete the entire table)

Table ID: `tbljNFr1c4an7SrEr`. Zero records, zero code references anywhere in the repo. From the tab bar in Airtable, right-click → Delete table.

**Phase 1 total:** 21 fields + 1 table. Should take ~15 minutes.

---

## Phase 2 — Child Updates simplification (do this after the unified /[number] work lands)

The Child Updates table has ~40 fields supporting a per-child quarterly-assessment workflow with wellbeing rubrics, subject grades, Google Drive file IDs, and a submit/review/reject pipeline. Across the codebase, 21 files reference these fields — admin update intake routes, compliance crons, email digests, and the tools library.

The new model only needs six fields. The full simplification has to happen *with* the corresponding code deprecation, not before it. Once the unified /[number] sponsor view is live and reads from the simplified set, we delete the elaborate update path and the obsolete fields together. The exact six fields the new model keeps:

| Field name | Field ID | Role |
|---|---|---|
| UpdateID | fldY6GwFO2j7WBgzQ | Primary identifier |
| Title | fldBuSsjoIO6XA8C7 | Update headline shown on /[number] |
| Content | fld1pZktTh3ctX9Tm | The paragraph body |
| Child | fldmIx57XgBa1ZRrI | Link to which kid this is about |
| UpdateDate | fldld5dXNzCZcO0Ul | When the update was published |
| VisibleToSponsor | fldRVFU8kZ5gZNb7l | Gate so drafts stay hidden until ready |
| Photos | fldQAaTEXyASWNGMz | Attachment field — the photo(s) |

Everything else gets deleted in Phase 2. Don't delete them yet — current admin tooling and compliance cron will 422 on the field reads.

---

## Phase 3 — verify the simplified Child Updates render path

After Phase 2 fields are gone and the simplified /[number] is reading from the trimmed schema, validate end-to-end: upload a photo + paragraph from Airtable mobile to a real child record, confirm it appears on that child's /[number] page within the sponsor view, confirm the public view doesn't show it.

---

## Notes for Kevin

The Airtable REST API can't delete fields or tables from this codebase — that's why this is a manual UI job. Once Phase 1 is done, the `pending deletion` notes in `airtable_schema.md` get cleaned up to reflect the new state, and the schema doc should match what's in Airtable again.

If anything looks risky to delete (e.g., you remember a workflow that depends on a field), pause and ping me — I can grep the codebase before you hit the button.
