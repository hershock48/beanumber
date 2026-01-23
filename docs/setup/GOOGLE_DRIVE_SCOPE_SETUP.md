# Adding Google Drive Scope to OAuth

Your existing Gmail OAuth credentials can also access Google Drive. You just need to add the Drive scope and get a new refresh token.

## Current Setup

You already have Gmail OAuth configured with these scopes:
- `https://www.googleapis.com/auth/gmail.send`

## Required Additional Scope

To upload photos to Drive, add:
- `https://www.googleapis.com/auth/drive.file`

This scope allows the app to create and manage files it creates (not access all Drive files).

---

## Step-by-Step Instructions

### Step 1: Update OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (the one with Gmail OAuth)
3. Navigate to **APIs & Services** → **OAuth consent screen**
4. Click **Edit App**
5. Proceed through to the **Scopes** section
6. Click **Add or Remove Scopes**
7. Find and add: `https://www.googleapis.com/auth/drive.file`
8. Save and continue through the remaining steps

### Step 2: Enable the Drive API

1. In Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for "Google Drive API"
3. Click on it and click **Enable** (if not already enabled)

### Step 3: Get a New Refresh Token

You need to re-authorize with the new scope to get a fresh refresh token.

**Option A: Use the OAuth Playground**

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your:
   - OAuth Client ID
   - OAuth Client Secret
5. Close the settings
6. In the left panel, under "Select & authorize APIs":
   - Expand "Gmail API v1" and select `https://www.googleapis.com/auth/gmail.send`
   - Expand "Drive API v3" and select `https://www.googleapis.com/auth/drive.file`
7. Click **Authorize APIs**
8. Sign in with your Google Workspace account
9. Grant the permissions
10. Click **Exchange authorization code for tokens**
11. Copy the **Refresh Token**

**Option B: Use the get-token script (if you have one)**

If you have the helper script from Gmail setup:
```bash
# Update the script to include both scopes, then run
node scripts/get-google-tokens.js
```

### Step 4: Update Environment Variables

Update your Vercel environment variables:

```
GMAIL_REFRESH_TOKEN=your_new_refresh_token_here
```

Also update your local `.env.local` for development.

### Step 5: Verify the Setup

Test that Drive access works by uploading a test file:

```bash
# In your project directory
npm run dev

# Then test the Drive integration by submitting a form with a photo
# Or call the API directly
```

---

## Verification Checklist

- [ ] OAuth consent screen includes `drive.file` scope
- [ ] Google Drive API is enabled in your project
- [ ] New refresh token obtained with both Gmail and Drive scopes
- [ ] `GMAIL_REFRESH_TOKEN` updated in Vercel
- [ ] `GMAIL_REFRESH_TOKEN` updated in local `.env.local`
- [ ] Test photo upload works

---

## Troubleshooting

### "Insufficient Permission" error

The refresh token doesn't have Drive scope. Re-authorize with both scopes.

### "Access Denied" error

1. Verify the Drive API is enabled
2. Verify the scope is added to OAuth consent screen
3. Try revoking and re-granting access

### Files not appearing in Drive

Check the folder structure: `Be A Number → Children → {ChildID}`

The app creates this structure automatically on first upload.

---

## Security Notes

1. The `drive.file` scope is limited - it only allows access to files the app creates
2. The app cannot read, modify, or delete files created by other apps or users
3. All files are created under the authorized user's Drive account
4. Files are organized in a dedicated folder structure for easy management
