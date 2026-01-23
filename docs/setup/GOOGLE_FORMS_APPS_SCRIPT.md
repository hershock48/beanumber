# Google Forms + Apps Script Setup

This guide explains how to connect Google Forms to the Child Update System via Apps Script.

## Overview

When a field partner submits an update through Google Forms:
1. Google Forms collects the data
2. Apps Script triggers on form submission
3. Apps Script calls your API endpoint
4. API creates the record in Airtable and uploads photos to Drive

---

## Step 1: Create the Google Form

### Field Update Form (Form A)

Create a new Google Form with these questions:

| Question | Type | Required | Notes |
|----------|------|----------|-------|
| Child ID | Short answer | Yes | Format: BAN-XXXX |
| Update Period | Dropdown | Yes | Options: 2026-01, 2026-02, ... 2026-12 |
| Physical Wellbeing | Multiple choice | Yes | Excellent, Good, Okay, Needs attention |
| Physical Wellbeing Notes | Paragraph | No | |
| Emotional Wellbeing | Multiple choice | Yes | Excellent, Good, Okay, Needs attention |
| Emotional Wellbeing Notes | Paragraph | No | |
| School Engagement | Multiple choice | Yes | Very engaged, Engaged, Inconsistent, Not engaged |
| Engagement Notes | Paragraph | No | |
| Sponsor Narrative | Paragraph | Yes | 60-900 characters |
| Positive Highlight | Short answer | Yes | Max 140 characters |
| Challenge | Short answer | No | Max 140 characters |
| Photo 1 | File upload | Yes | Images only, max 10MB |
| Photo 2 | File upload | No | |
| Photo 3 | File upload | No | |
| Handwritten Note | File upload | No | |

**Form Settings:**
- Collect email addresses: Yes (set to collect submitter email)
- Restrict to users in your organization: Yes (if using Google Workspace)
- File uploads go to: Submitter's Drive (default)

---

## Step 2: Add Apps Script

1. Open your Google Form in edit mode
2. Click the three-dot menu (⋮) → **Script editor**
3. Delete any existing code
4. Paste the code below
5. Update the configuration values at the top
6. Save the project

### Apps Script Code

```javascript
/**
 * Be A Number - Field Update Form Bridge
 *
 * This script submits form responses to the Child Update System API.
 *
 * CONFIGURATION: Update these values before deploying
 */
const CONFIG = {
  // Your API endpoint (Vercel URL)
  API_URL: 'https://www.beanumber.org/api/admin/child-updates/intake',

  // Admin API token (from Vercel environment variables)
  ADMIN_TOKEN: 'YOUR_ADMIN_API_TOKEN_HERE',

  // Source type for this form
  SOURCE_TYPE: 'field', // 'field' or 'academic'

  // Role email that will be recorded as the submitter
  SUBMITTER_EMAIL: 'field-updates@beanumber.org',
};

/**
 * Form field mappings - match these to your form question titles
 * The keys must match EXACTLY (case-sensitive)
 */
const FIELD_MAPPINGS = {
  childId: 'Child ID',
  period: 'Update Period',
  physicalWellbeing: 'Physical Wellbeing',
  physicalNotes: 'Physical Wellbeing Notes',
  emotionalWellbeing: 'Emotional Wellbeing',
  emotionalNotes: 'Emotional Wellbeing Notes',
  schoolEngagement: 'School Engagement',
  engagementNotes: 'Engagement Notes',
  sponsorNarrative: 'Sponsor Narrative',
  positiveHighlight: 'Positive Highlight',
  challenge: 'Challenge',
};

/**
 * Photo field mappings - file upload questions
 */
const PHOTO_MAPPINGS = {
  photo1: 'Photo 1',
  photo2: 'Photo 2',
  photo3: 'Photo 3',
  handwrittenNote: 'Handwritten Note',
};

/**
 * Trigger function - runs when form is submitted
 */
function onFormSubmit(e) {
  try {
    const response = e.response;
    const itemResponses = response.getItemResponses();

    // Build a map of question title -> answer
    const answers = {};
    itemResponses.forEach(item => {
      answers[item.getItem().getTitle()] = item.getResponse();
    });

    // Extract field values
    const childId = answers[FIELD_MAPPINGS.childId];
    const periodOrTerm = answers[FIELD_MAPPINGS.period];

    if (!childId || !periodOrTerm) {
      console.error('Missing required fields: childId or period');
      return;
    }

    // Build payload
    const payload = {
      childId: childId,
      sourceType: CONFIG.SOURCE_TYPE,
      periodOrTerm: periodOrTerm,
      submittedBy: CONFIG.SUBMITTER_EMAIL,
      fields: {
        physicalWellbeing: answers[FIELD_MAPPINGS.physicalWellbeing] || null,
        physicalNotes: answers[FIELD_MAPPINGS.physicalNotes] || null,
        emotionalWellbeing: answers[FIELD_MAPPINGS.emotionalWellbeing] || null,
        emotionalNotes: answers[FIELD_MAPPINGS.emotionalNotes] || null,
        schoolEngagement: answers[FIELD_MAPPINGS.schoolEngagement] || null,
        engagementNotes: answers[FIELD_MAPPINGS.engagementNotes] || null,
        sponsorNarrative: answers[FIELD_MAPPINGS.sponsorNarrative] || null,
        positiveHighlight: answers[FIELD_MAPPINGS.positiveHighlight] || null,
        challenge: answers[FIELD_MAPPINGS.challenge] || null,
      },
      photos: [],
    };

    // Process photo uploads
    for (const [key, questionTitle] of Object.entries(PHOTO_MAPPINGS)) {
      const fileIds = answers[questionTitle];
      if (fileIds && fileIds.length > 0) {
        // fileIds is an array of Drive file IDs
        fileIds.forEach((fileId, index) => {
          try {
            const file = DriveApp.getFileById(fileId);
            const blob = file.getBlob();

            payload.photos.push({
              key: key + (index > 0 ? String(index + 1) : ''),
              fileName: file.getName(),
              mimeType: blob.getContentType(),
              base64Content: Utilities.base64Encode(blob.getBytes()),
            });
          } catch (fileError) {
            console.error('Error processing file ' + fileId + ': ' + fileError.message);
          }
        });
      }
    }

    // Send to API
    const options = {
      method: 'POST',
      contentType: 'application/json',
      headers: {
        'X-Admin-Token': CONFIG.ADMIN_TOKEN,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const apiResponse = UrlFetchApp.fetch(CONFIG.API_URL, options);
    const statusCode = apiResponse.getResponseCode();
    const responseBody = apiResponse.getContentText();

    if (statusCode === 200) {
      console.log('Success: ' + responseBody);
    } else {
      console.error('API Error (' + statusCode + '): ' + responseBody);
      // Optionally send notification email on failure
      sendErrorNotification(childId, periodOrTerm, statusCode, responseBody);
    }

  } catch (error) {
    console.error('Script Error: ' + error.message);
    console.error(error.stack);
  }
}

/**
 * Send email notification on API failure
 */
function sendErrorNotification(childId, period, statusCode, errorBody) {
  const adminEmail = 'admin@beanumber.org';
  const subject = '[Be A Number] Form Submission Failed - ' + childId;
  const body = `
A form submission failed to process:

Child ID: ${childId}
Period: ${period}
Status Code: ${statusCode}

Error Response:
${errorBody}

Please check the form submission and try again, or manually enter the update.
`;

  MailApp.sendEmail(adminEmail, subject, body);
}

/**
 * Manual function to set up the form trigger
 * Run this ONCE after deploying the script
 */
function setupTrigger() {
  // Remove any existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new trigger
  const form = FormApp.getActiveForm();
  ScriptApp.newTrigger('onFormSubmit')
    .forForm(form)
    .onFormSubmit()
    .create();

  console.log('Trigger created successfully!');
}

/**
 * Test function - simulates a form submission for debugging
 */
function testSubmission() {
  const testPayload = {
    childId: 'BAN-0001',
    sourceType: 'field',
    periodOrTerm: '2026-01',
    submittedBy: CONFIG.SUBMITTER_EMAIL,
    fields: {
      physicalWellbeing: 'Good',
      physicalNotes: 'Test notes',
      emotionalWellbeing: 'Good',
      emotionalNotes: 'Test emotional notes',
      schoolEngagement: 'Engaged',
      engagementNotes: 'Test engagement notes',
      sponsorNarrative: 'This is a test narrative for the sponsor to see.',
      positiveHighlight: 'Test highlight',
      challenge: null,
    },
    photos: [],
  };

  const options = {
    method: 'POST',
    contentType: 'application/json',
    headers: {
      'X-Admin-Token': CONFIG.ADMIN_TOKEN,
    },
    payload: JSON.stringify(testPayload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(CONFIG.API_URL, options);
  console.log('Status: ' + response.getResponseCode());
  console.log('Response: ' + response.getContentText());
}
```

---

## Step 3: Configure the Script

1. Update the `CONFIG` object at the top:
   - `API_URL`: Your Vercel deployment URL + `/api/admin/child-updates/intake`
   - `ADMIN_TOKEN`: Copy from your Vercel environment variables
   - `SOURCE_TYPE`: `'field'` for field forms, `'academic'` for academic forms
   - `SUBMITTER_EMAIL`: The role email for this form type

2. Update `FIELD_MAPPINGS` to match your exact question titles (case-sensitive)

3. Update `PHOTO_MAPPINGS` to match your file upload question titles

---

## Step 4: Set Up the Trigger

1. In the Script Editor, run the `setupTrigger` function once
2. Authorize the script when prompted (it needs access to Forms, Drive, Mail)
3. The trigger is now active

---

## Step 5: Test the Integration

1. Run the `testSubmission` function to verify API connectivity
2. Submit a test form response
3. Check the Apps Script logs (View → Logs) for success/error messages
4. Verify the record appears in Airtable

---

## Academic Form (Form B)

For academic updates, create a separate form with these questions:

| Question | Type | Required |
|----------|------|----------|
| Child ID | Short answer | Yes |
| Academic Term | Dropdown | Yes (Term 1 2026, Term 2 2026, etc.) |
| Attendance Percentage | Number | Yes |
| English Grade | Number | No |
| Math Grade | Number | No |
| Science Grade | Number | No |
| Social Studies Grade | No | No |
| Teacher Comment | Paragraph | No |
| Report Card | File upload | No |

Use the same Apps Script code but update:
- `SOURCE_TYPE: 'academic'`
- `SUBMITTER_EMAIL: 'academics@beanumber.org'`
- `FIELD_MAPPINGS` to match academic field names

---

## Troubleshooting

### "Unauthorized" error
- Verify `ADMIN_TOKEN` matches your Vercel environment variable exactly
- Check the token hasn't been rotated

### "Child not found" error
- Verify the Child ID exists in your Children table
- Check the format matches (BAN-XXXX)

### Photos not uploading
- Ensure the form is set to allow file uploads
- Check file size limits (max 10MB)
- Verify Drive permissions are working

### Trigger not firing
- Run `setupTrigger` again
- Check Apps Script quotas (free tier has limits)
- Verify the form is accepting responses

---

## Security Notes

1. **Never share the ADMIN_TOKEN** - it provides full admin access
2. **Restrict form access** to your organization if possible
3. **Monitor the Apps Script logs** for unauthorized submission attempts
4. **Rotate the ADMIN_TOKEN** periodically in Vercel settings
