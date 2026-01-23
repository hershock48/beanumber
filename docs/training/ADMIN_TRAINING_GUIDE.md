# Be A Number Admin Training Guide

## Child Update System Operations

**Last Updated:** January 2026
**Audience:** Be A Number staff and administrators

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Your Role](#your-role)
3. [Daily Operations](#daily-operations)
4. [Reviewing & Publishing Updates](#reviewing--publishing-updates)
5. [Compliance Monitoring](#compliance-monitoring)
6. [Troubleshooting](#troubleshooting)
7. [Quick Reference](#quick-reference)

---

## System Overview

### What This System Does

The Child Update System ensures every sponsored child receives regular, standardized updates that are delivered to their sponsors. The system:

- **Collects** updates from field partners via structured Google Forms
- **Stores** photos securely in Google Drive (organized by child)
- **Tracks** which children need updates and when
- **Automates** reminders to field partners when updates are overdue
- **Enables** you to review, approve, and publish updates
- **Notifies** sponsors when new updates are available

### The Two Types of Updates

| Update Type | Who Submits | Content | Frequency |
|-------------|-------------|---------|-----------|
| **Field Updates** | YDO Field Staff | Wellbeing, photos, narrative | Monthly |
| **Academic Updates** | School Administration | Grades, attendance, report cards | Per term |

### Role-Based Email Addresses

The system uses role-based emails (not personal inboxes) to ensure continuity:

| Role | Email | Purpose |
|------|-------|---------|
| Field Updates | `field-updates@beanumber.org` | Receives field update reminders |
| Academics | `academics@beanumber.org` | Receives academic update reminders |
| Admin | `admin@beanumber.org` | Receives escalations and system alerts |

---

## Your Role

As a Be A Number administrator, you are responsible for:

### 1. Quality Control
- Reviewing submitted updates before they go to sponsors
- Ensuring photos are appropriate and clear
- Checking that narratives are well-written and accurate
- Verifying no sensitive information is included

### 2. Publishing
- Approving updates that meet quality standards
- Requesting corrections when needed
- Rejecting updates that don't meet standards (with explanation)

### 3. Compliance Oversight
- Monitoring which children are missing updates
- Following up when field partners don't submit on time
- Reviewing compliance reports

### 4. Sponsor Communication
- Updates are automatically sent to sponsors when published
- You don't need to manually email sponsors

---

## Daily Operations

### Checking the Admin Dashboard

1. **Navigate to:** `/admin/dashboard`
2. **Enter your admin token** when prompted
3. **Review the pending updates queue** - these need your attention

### What You'll See

The dashboard shows:
- **Pending Updates** - Submitted but not yet reviewed
- **Overdue Children** - Haven't received updates recently
- **Recent Activity** - What's been published

### Priority Order

Handle updates in this order:
1. Updates that have been waiting longest
2. Updates for children whose sponsors have requested them
3. Regular updates

---

## Reviewing & Publishing Updates

### Step 1: Open an Update for Review

Click on any pending update to see:
- Child information (name, ID, photo)
- Submitted content (narrative, wellbeing ratings)
- Attached photos
- Submission details (who submitted, when)

### Step 2: Quality Checklist

Before approving, verify:

- [ ] **Photos are appropriate**
  - Child is clearly visible
  - No sensitive locations shown
  - Good quality (not blurry)
  - Recent (matches the update period)

- [ ] **Narrative is well-written**
  - Grammatically correct
  - Positive and engaging tone
  - Specific to this child (not generic)
  - Between 60-900 characters

- [ ] **No sensitive information**
  - No full names of family members
  - No medical diagnoses
  - No financial details
  - No exact addresses

- [ ] **Wellbeing assessments are complete**
  - Physical, emotional, and engagement ratings filled
  - Notes explain the ratings

### Step 3: Take Action

**Option A: Publish** (if everything looks good)
- Click "Publish"
- Update status changes to "Published"
- Sponsor is automatically notified via email
- Update appears in sponsor's portal

**Option B: Request Correction** (if minor issues)
- Click "Request Correction"
- Enter clear instructions for what needs to change
- Field partner receives notification to resubmit
- Update status changes to "Needs Correction"

**Option C: Reject** (if major issues)
- Click "Reject"
- Enter reason for rejection
- This is a permanent action
- Field partner must submit a completely new update

### Important Rules

1. **Published updates cannot be edited** - This is by design for data integrity
2. **If you make a mistake**, a new "correction" update must be submitted
3. **Always leave notes** when requesting corrections - be specific!

---

## Compliance Monitoring

### How the System Tracks Compliance

The system automatically:
- Knows which children are active and need updates
- Tracks when the last update was published for each child
- Calculates which children are "overdue" (no update in 30+ days)
- Sends reminders to field partners at scheduled intervals

### Reminder Schedule (Field Updates)

| Day of Month | Action |
|--------------|--------|
| 1st | Initial reminder sent |
| 23rd | Follow-up reminder sent |
| 28th | Final reminder sent |
| After 28th | Escalation to admin |

### Viewing Compliance Status

**Option 1: Admin Dashboard**
- Shows overdue children count
- Click to see full list

**Option 2: Compliance Summary API**
- Navigate to: `/api/admin/compliance/summary`
- Add your admin token in headers
- Returns detailed statistics

### What to Do When Children Are Overdue

1. **Check if reminders were sent** - System does this automatically
2. **Review the missing children list** - Are there patterns?
3. **Contact field partners directly** if automation hasn't worked
4. **Document any issues** for future process improvement

### Escalation Process

When updates are overdue:
1. System sends escalation email to `admin@beanumber.org`
2. Email includes:
   - Number of missing updates
   - List of affected children
   - Days overdue
   - Responsible role
3. You should follow up with the responsible party

---

## Troubleshooting

### "I can't log into the admin dashboard"

- Verify you have the correct `ADMIN_API_TOKEN`
- Check that the token hasn't been rotated
- Token is case-sensitive

### "An update was published with an error"

Since published updates can't be edited:
1. Note the error
2. Have field partner submit a correction update
3. The new update will link to (supersede) the old one
4. Publish the correction
5. Both remain in history for audit purposes

### "Field partners say they never received reminders"

Check:
1. Is the reminder going to the right email? (`field-updates@beanumber.org`)
2. Is someone checking that inbox?
3. Check spam/junk folders
4. Verify email service is configured correctly

### "Photos aren't uploading"

Possible causes:
1. Google Drive OAuth token may have expired
2. File size too large
3. Unsupported file format

Solution:
- Check Google Cloud Console for OAuth status
- Verify Drive scope is enabled
- Photos should be images (jpg, png) under 10MB

### "Sponsor says they didn't get notified"

Check:
1. Was the update actually published? (Status = "Published")
2. Is the sponsor's email correct in their record?
3. Check email service logs for delivery status

---

## Quick Reference

### Key URLs

| Page | URL | Purpose |
|------|-----|---------|
| Admin Dashboard | `/admin/dashboard` | Main control panel |
| Submit Update | `/admin/updates/submit` | Manual update entry |
| Compliance Summary | `/api/admin/compliance/summary` | Statistics |

### Key Contacts

| Role | Email |
|------|-------|
| Field Updates | `field-updates@beanumber.org` |
| Academics | `academics@beanumber.org` |
| Admin | `admin@beanumber.org` |

### Status Meanings

| Status | Meaning | Action Needed |
|--------|---------|---------------|
| `submitted_unverified` | New submission waiting | Review and publish |
| `needs_correction` | You requested changes | Wait for resubmission |
| `published` | Live and visible to sponsor | None |
| `rejected` | Permanently declined | None |

### Checklist Before Publishing

- [ ] Photos are clear and appropriate
- [ ] Narrative is well-written
- [ ] No sensitive information
- [ ] Wellbeing fields complete
- [ ] Child ID matches content

---

## Getting Help

If you encounter issues not covered here:

1. **Check the technical documentation** in `/docs/`
2. **Review workflow files** in `/workflows/`
3. **Contact technical support** with:
   - What you were trying to do
   - What happened instead
   - Any error messages
   - Screenshots if possible

---

*This guide is part of the Be A Number Child Update System documentation.*
