# Airtable Field Reference for Sponsor System

This document lists the exact field names used in the code to match your Airtable schema.

## Sponsorships Table

| Field Name in Code | Airtable Field Name | Type | Notes |
|-------------------|---------------------|------|-------|
| `SponsorCode` | SponsorCode | Single line text | Primary identifier |
| `SponsorEmail` | SponsorEmail | Email | For authentication |
| `ChildID` | ChildID | Single line text | Links to Updates table |
| `ChildDisplayName` | ChildDisplayName | Single line text | Display name |
| `ChildPhoto` | ChildPhoto | Attachment | Child's photo |
| `ChildAge` | ChildAge | Single line text | Optional |
| `ChildLocation` | ChildLocation | Single line text | Optional |
| `SponsorshipStartDate` | SponsorshipStartDate | Date | Optional |
| `LastRequestAt` | LastRequestAt | Date/time | When sponsor last requested update |
| `NextRequestEligibleAt` | NextRequestEligibleAt | Date/time | When next request is allowed |
| `AuthStatus` | AuthStatus | Single select | Active/Revoked |
| `Status` | Status | Single select | Sponsorship status |
| `VisibleToSponsor` | VisibleToSponsor | Checkbox | Controls visibility |

## Updates Table

| Field Name in Code | Airtable Field Name | Type | Notes |
|-------------------|---------------------|------|-------|
| `ChildID` | ChildID | Single line text | **Primary join key** - links to Sponsorships |
| `SponsorCode` | SponsorCode | Single line text | Optional linking field |
| `UpdateType` | UpdateType | Single select | Progress Report, Photo Update, etc. |
| `Title` | Title | Single line text | Update title |
| `Content` | Content | Long text | Update content |
| `Photos` | Photos | Attachment | Multiple photos allowed |
| `Status` | Status | Single select | **Pending Review**, **Published**, **Rejected** |
| `VisibleToSponsor` | VisibleToSponsor | Checkbox | Must be TRUE for sponsor to see |
| `RequestedBySponsor` | RequestedBySponsor | Checkbox | If sponsor requested this update |
| `RequestedAt` | RequestedAt | Date/time | When update was requested |
| `PublishedAt` | PublishedAt | Date/time | When update was published |
| `SubmittedBy` | SubmittedBy | Single line text | Field team member name |

## Important Notes

### Querying Updates
- Updates are linked to sponsors via **ChildID** (not SponsorCode directly)
- To show updates to sponsor: `{ChildID} = "XXX" AND {VisibleToSponsor} = TRUE() AND {Status} = "Published"`
- Updates with `Status = "Pending Review"` are not visible to sponsors

### Request Throttling
- Uses `NextRequestEligibleAt` from Sponsorships table
- Automatically set to 90 days in the future when sponsor requests update
- Check: `new Date() >= NextRequestEligibleAt` to allow request

### Publishing Workflow
1. Field team submits → `Status = "Pending Review"`, `VisibleToSponsor = FALSE`
2. Staff reviews in Airtable
3. Staff publishes → `Status = "Published"`, `VisibleToSponsor = TRUE`, `PublishedAt = now()`
4. Update appears on sponsor's dashboard

## Environment Variables

Make sure these are set in Vercel:

```
AIRTABLE_SPONSORSHIPS_TABLE=Sponsorships
AIRTABLE_UPDATES_TABLE=Updates
```
