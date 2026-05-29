# Gmail integration — one-time setup

You do this once, after which "Email Sarah" inside the admin actually sends an email from your Gmail account.

Estimated time: 10–15 minutes. None of it is hard, but the Google Cloud Console UI is unfriendly.

---

## What you're setting up

A Google Cloud OAuth client that authorizes the BAN admin app to send email on your behalf. Three pieces:

1. A Google Cloud project (you may already have one — fine to reuse).
2. The Gmail API enabled in that project.
3. An OAuth 2.0 client ID + client secret, with `https://www.beanumber.org/api/auth/google/callback` registered as a redirect URI.

Once those exist, you copy the Client ID + Client Secret into Vercel env vars, then go to `/admin/connect-gmail` once and grant permission. Done forever (or until you revoke).

---

## Steps

### 1. Open Google Cloud Console

Go to https://console.cloud.google.com/

You should be logged in with the Google account you want to send email from (probably kevin@beanumber.org).

### 2. Pick or create a project

Top of the page, click the project dropdown. If you already have a project for BAN, pick it. Otherwise: **New Project** → name it "Be A Number" → Create.

### 3. Enable the Gmail API

In the search bar at the top, type **Gmail API** and click the result.
Click the blue **Enable** button. Wait ~30 seconds.

### 4. Configure the OAuth consent screen

Left sidebar → **APIs & Services** → **OAuth consent screen**.

- User Type: **External** → Create.
- App name: `Be A Number Admin`
- User support email: kevin@beanumber.org
- Developer contact email: kevin@beanumber.org
- Save and Continue.

On the **Scopes** screen: click **Add or Remove Scopes**. Search for and check:

- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/userinfo.email`
- `openid`

Update → Save and Continue.

On the **Test users** screen: click **Add Users** → add kevin@beanumber.org (and any other Google account you might want to authorize from). Save and Continue.

On the summary: **Back to Dashboard**.

> If you ever publish the app (move it from Testing to In production), Google will require a verification process. For now, leave it in Testing — that's fine for single-user setup.

### 5. Create the OAuth client

Left sidebar → **APIs & Services** → **Credentials**.

**Create Credentials** → **OAuth client ID**.

- Application type: **Web application**
- Name: `Be A Number Admin`
- Authorized redirect URIs → **Add URI**:
  - `https://www.beanumber.org/api/auth/google/callback`
  - (Optional, for local testing) `http://localhost:3000/api/auth/google/callback`
- **Create**.

A modal pops up with your **Client ID** and **Client Secret**. Copy both somewhere safe. You'll paste them into Vercel next.

### 6. Set the env vars in Vercel

In Vercel → Project: **beanumber** → Settings → Environment Variables. Add two:

| Name | Value | Environments |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | the Client ID from step 5 | Production + Preview + Development |
| `GOOGLE_OAUTH_CLIENT_SECRET` | the Client Secret from step 5 | Production + Preview + Development |

Save. Vercel will trigger a redeploy automatically; wait for it to go green.

### 7. Connect from inside the admin

Visit https://www.beanumber.org/admin/connect-gmail

Click **Connect Gmail**. Google's consent screen appears.

> If you see a "this app isn't verified" warning, click **Advanced** → **Go to Be A Number Admin (unsafe)** → continue. This warning shows up because the app is in Testing mode (which is what we want for single-user use).

Grant the permissions (Gmail send, basic profile). You'll be redirected back to `/admin/connect-gmail?status=connected`.

### 8. Set your signature

On the same page, edit the signature textarea. Save.

Example signature:

```
Kevin Hershock
Founder, Be A Number, International
kevin@beanumber.org
beanumber.org
```

### 9. Test it

Open any donor profile (e.g. `/admin/donors` → click a row). Hit **Email [name]**. Compose subject + body. Send.

The email leaves from your Gmail address, lands in your Sent folder, and arrives in their inbox like any other email you write. The donor's timeline gets an outbound interaction entry automatically.

If something fails, check:

- Vercel env vars are set in the right environment
- The deploy after setting env vars actually went green
- You completed step 7 (connecting once)
- The donor has an email on file (Airtable Donors → Email Address)

---

## Operational notes

- **Refresh token lifetime.** Google's refresh tokens can expire if not used for 6+ months. If sends start failing with a 401, just revisit `/admin/connect-gmail` and reconnect — takes 10 seconds.
- **Token storage.** The refresh token lives in Airtable's `AppSettings` table. Same security model as everything else in BAN (the Airtable PAT itself is the protected secret).
- **Single-user.** The current setup assumes one admin (you) sends from one Gmail account. If you ever want Simon to be able to send from his own Gmail, we'll need to extend the AppSettings to be per-user.
- **Reading replies.** Not implemented in v1. Replies come to your normal Gmail inbox; the admin doesn't surface them. We can add this in v2 with the `gmail.readonly` scope.
- **Revoking access.** If you ever want to disconnect, go to https://myaccount.google.com/permissions and remove "Be A Number Admin." Then clear the AppSettings rows in Airtable.
