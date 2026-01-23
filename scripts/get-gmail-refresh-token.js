/**
 * Helper script to get Gmail OAuth2 refresh token
 * 
 * Usage:
 * 1. Set CLIENT_ID and CLIENT_SECRET below (or pass as env vars)
 * 2. Run: node scripts/get-gmail-refresh-token.js
 * 3. Follow the prompts
 * 
 * IMPORTANT: Delete this file or remove credentials after use!
 */

const { google } = require('googleapis');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Get from environment or set here (will be prompted if not set)
const CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://localhost';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Error: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set');
  console.error('Set them as environment variables or edit this script');
  process.exit(1);
}

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

console.log('\n📧 Gmail OAuth2 Refresh Token Generator\n');
console.log('1. Open this URL in your browser:');
console.log(`\n   ${authUrl}\n`);
console.log('2. Sign in with your Google Workspace account');
console.log('3. Click "Allow" to grant permissions');
console.log('4. You will be redirected to http://localhost');
console.log('5. Look at the URL in your browser - it will contain "code=..."');
console.log('6. Copy everything after "code=" (before any & symbols)\n');

rl.question('Enter the authorization code: ', (code) => {
  oauth2Client.getToken(code, (err, token) => {
    if (err) {
      console.error('\n❌ Error getting token:', err.message);
      if (err.message.includes('invalid_grant')) {
        console.error('\n💡 Tip: The authorization code may have expired. Try again.');
      }
      rl.close();
      process.exit(1);
      return;
    }

    if (!token.refresh_token) {
      console.error('\n❌ Error: No refresh token received');
      console.error('💡 Tip: Make sure you selected "offline" access and granted all permissions');
      rl.close();
      process.exit(1);
      return;
    }

    console.log('\n✅ Success! Add these to your .env.local file:\n');
    console.log('```');
    console.log(`GMAIL_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GMAIL_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GMAIL_REFRESH_TOKEN=${token.refresh_token}`);
    console.log(`GMAIL_USER_EMAIL=your-email@beanumber.org`);
    console.log(`GMAIL_FROM_EMAIL=info@beanumber.org`);
    console.log(`GMAIL_FROM_NAME=Be A Number, International`);
    console.log('```\n');
    console.log('⚠️  Remember to add these to Vercel environment variables for production!\n');

    rl.close();
  });
});
