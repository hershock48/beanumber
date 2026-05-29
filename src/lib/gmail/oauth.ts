/**
 * Gmail OAuth 2.0 helpers — minimal implementation for the single-
 * admin use case. We use Google's standard authorization code flow:
 *
 *   1. Build a consent URL pointing at our /api/auth/google/callback.
 *   2. Google sends back ?code=... after the user grants permission.
 *   3. Exchange that code for an access token + refresh token.
 *   4. Store the refresh token in AppSettings; use it later to mint
 *      fresh access tokens whenever we need to send an email.
 *
 * Scope: gmail.send only. We only need to send emails, not read.
 * Adding gmail.readonly later would let us surface replies on the
 * donor profile.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  scope?: string;
  token_type?: string;
}

export interface UserInfo {
  email: string;
  email_verified?: boolean;
}

function clientCreds(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'}/api/auth/google/callback`;
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET env vars. ' +
      'See docs/claude/gmail_setup.md for the one-time Google Cloud setup.'
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/** Returns true when the OAuth env vars are configured. Used to
 *  render a graceful 'not yet set up' state on the connect page
 *  before Kevin's done the Google Cloud Console setup. */
export function gmailOAuthConfigured(): boolean {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
}

/** Construct the Google consent URL that the connect page redirects
 *  to. `state` is a CSRF token we verify on the callback. */
export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = clientCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: `${SCOPE} https://www.googleapis.com/auth/userinfo.email openid`,
    access_type: 'offline', // required to get a refresh token
    prompt: 'consent', // force consent so we always get a refresh token
    state,
    include_granted_scopes: 'true',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Exchange the authorization code from Google's redirect for an
 *  access + refresh token pair. */
export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
  const { clientId, clientSecret, redirectUri } = clientCreds();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Gmail token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<OAuthTokens>;
}

/** Mint a fresh access token from a stored refresh token. Google
 *  *may* rotate the refresh token in the response — when it does,
 *  the caller should store the new one. */
export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const { clientId, clientSecret } = clientCreds();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<OAuthTokens>;
}

/** Look up the authorized user's email using the access token. We
 *  store this so the connect page can show "connected as ...". */
export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as UserInfo;
  return data.email || null;
}
