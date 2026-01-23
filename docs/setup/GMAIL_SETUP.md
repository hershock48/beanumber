# Gmail API Setup Guide

This guide will help you set up Gmail API integration for sending emails through your Google Workspace (G Suite) account.

## Prerequisites

- A Google Workspace account (nonprofit accounts work great!)
- Access to Google Cloud Console
- The email address you want to send from (e.g., `info@beanumber.org`)

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click **"New Project"**
4. Name it something like "Be A Number Email" or "Beanumber Gmail API"
5. Click **"Create"**

## Step 2: Enable Gmail API

1. In your new project, go to **"APIs & Services"** > **"Library"**
2. Search for **"Gmail API"**
3. Click on **"Gmail API"**
4. Click **"Enable"**

## Step 3: Create OAuth 2.0 Credentials

1. Go to **"APIs & Services"** > **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** at the top
3. Select **"OAuth client ID"**
4. If prompted, configure the OAuth consent screen first:
   - Choose **"Internal"** (for Google Workspace) or **"External"** (if you need external users)
   - Fill in the required fields:
     - App name: "Be A Number Email Service"
     - User support email: Your email
     - Developer contact: Your email
   - Click **"Save and Continue"**
   - Skip scopes for now (click **"Save and Continue"**)
   - Add yourself as a test user (click **"Save and Continue"**)
   - Review and click **"Back to Dashboard"**

5. Back at Credentials, click **"+ CREATE CREDENTIALS"** > **"OAuth client ID"**
6. Select **"Web application"** as the application type
7. Name it: "Be A Number Gmail API"
8. Under **"Authorized redirect URIs"**, add:
   ```
   http://localhost:3000/oauth2callback
   urn:ietf:wg:oauth:2.0:oob
   ```
9. Click **"Create"**
10. **IMPORTANT**: Copy the **Client ID** and **Client Secret** - you'll need these!

## Step 4: Get Refresh Token

You need to generate a refresh token that allows the application to send emails on your behalf.

### Option A: Using a Script (Recommended)

1. Create a temporary file `get-refresh-token.js` in your project root:

```javascript
const { google } = require('googleapis');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Replace these with your values from Step 3
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const scopes = [
  'https://www.googleapis.com/auth/gmail.send',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent', // Force consent screen to get refresh token
});

console.log('\n1. Open this URL in your browser:');
console.log(authUrl);
console.log('\n2. Authorize the application');
console.log('3. Copy the authorization code from the page\n');

rl.question('Enter the authorization code: ', (code) => {
  oauth2Client.getToken(code, (err, token) => {
    if (err) {
      console.error('Error getting token:', err);
      rl.close();
      return;
    }

    console.log('\n✅ Success! Add these to your .env file:\n');
    console.log(`GMAIL_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GMAIL_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GMAIL_REFRESH_TOKEN=${token.refresh_token}`);
    console.log(`GMAIL_USER_EMAIL=your-email@beanumber.org`);
    console.log(`GMAIL_FROM_EMAIL=info@beanumber.org`);
    console.log(`GMAIL_FROM_NAME=Be A Number, International\n`);

    rl.close();
  });
});
```

2. Run the script:
```bash
node get-refresh-token.js
```

3. Follow the prompts to get your refresh token

4. **Delete the script after use** (it contains sensitive info)

### Option B: Using OAuth Playground

1. Go to [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check **"Use your own OAuth credentials"**
4. Enter your **Client ID** and **Client Secret** from Step 3
5. In the left panel, find **"Gmail API v1"**
6. Select **"https://www.googleapis.com/auth/gmail.send"**
7. Click **"Authorize APIs"**
8. Sign in with your Google Workspace account
9. Click **"Exchange authorization code for tokens"**
10. Copy the **"Refresh token"** value

## Step 5: Add Environment Variables

Add these to your `.env.local` file (for local development) and Vercel environment variables (for production):

```bash
# Gmail API Configuration
GMAIL_CLIENT_ID=your_client_id_here
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REFRESH_TOKEN=your_refresh_token_here
GMAIL_USER_EMAIL=your-email@beanumber.org
GMAIL_FROM_EMAIL=info@beanumber.org
GMAIL_FROM_NAME=Be A Number, International
```

**Important Notes:**
- `GMAIL_USER_EMAIL`: The Gmail/Google Workspace account that will send emails
- `GMAIL_FROM_EMAIL`: The "From" address shown to recipients (can be different if you have aliases)
- `GMAIL_FROM_NAME`: The display name shown to recipients

## Step 6: Test the Integration

1. Make sure your environment variables are set
2. Restart your development server:
   ```bash
   npm run dev
   ```
3. The system will automatically use Gmail if configured, or fall back to SendGrid if Gmail is not set up

## Troubleshooting

### "Gmail authentication failed"
- Check that your refresh token is correct
- Make sure you selected "offline" access when generating the token
- Try regenerating the refresh token

### "Gmail API permission denied"
- Verify that Gmail API is enabled in your Google Cloud project
- Check that you granted the `gmail.send` scope
- Make sure you're using a Google Workspace account (not a personal Gmail)

### "Rate limit exceeded"
- Gmail API has daily sending limits (varies by account type)
- For Google Workspace: 2,000 emails per day (can be increased)
- For personal Gmail: 500 emails per day
- Consider implementing rate limiting in your application

### Refresh Token Expires
- Refresh tokens can expire if:
  - The user revokes access
  - The token hasn't been used for 6 months
  - Security settings change
- If expired, regenerate using Step 4

## Security Best Practices

1. **Never commit credentials to git** - Always use environment variables
2. **Use separate credentials for development and production**
3. **Rotate credentials periodically** (every 90 days recommended)
4. **Monitor API usage** in Google Cloud Console
5. **Set up alerts** for unusual activity

## Switching Back to SendGrid

If you want to switch back to SendGrid, simply:
1. Remove or comment out the Gmail environment variables
2. Add your `SENDGRID_API_KEY` environment variable
3. The system will automatically use SendGrid

## Support

For issues with:
- **Google Cloud Console**: [Google Cloud Support](https://cloud.google.com/support)
- **Gmail API**: [Gmail API Documentation](https://developers.google.com/gmail/api)
- **This application**: Check the application logs for detailed error messages
