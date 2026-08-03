/**
 * BAN mobile auth client.
 *
 * Responsibilities:
 *   - Store / retrieve the BAN-issued access token in Expo SecureStore.
 *   - Drive Sign in with Apple (via expo-apple-authentication).
 *   - Drive Sign in with Google (via expo-auth-session).
 *   - Talk to /api/mobile/v1/auth/{apple,google,refresh,sign-out}.
 *   - Expose a signed-in-user snapshot and pub/sub for UI.
 *
 * The token is opaque to the client (server-side HS256 JWT). We never
 * store the raw Apple identityToken / Google idToken on the device —
 * those are single-use, exchanged inline for our own token, then
 * dropped.
 *
 * Refresh is transparent: `authFetch()` (in lib/api.ts) intercepts a
 * 401 response with body `{ error: 'tokenExpired', ... }` from
 * requireMobileAuth() surfaces, calls /refresh, and retries the
 * original request once.
 */
import * as SecureStore from 'expo-secure-store';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

// Complete auth sessions when the browser closes on Google flows.
WebBrowser.maybeCompleteAuthSession();

// ─── Types ────────────────────────────────────────────────────────

export interface AuthUser {
  userId: string;
  email: string;
  hasSponsorships: boolean;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
}

type Listener = (state: AuthState) => void;

// ─── Config ───────────────────────────────────────────────────────

// Same resolution order as lib/api.ts — keep the two in lockstep.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  'https://www.beanumber.org';

const GOOGLE_IOS_CLIENT_ID = Constants.expoConfig?.extra?.googleIosClientId as
  | string
  | undefined;
const GOOGLE_ANDROID_CLIENT_ID = Constants.expoConfig?.extra
  ?.googleAndroidClientId as string | undefined;
const GOOGLE_WEB_CLIENT_ID = Constants.expoConfig?.extra?.googleWebClientId as
  | string
  | undefined;

const TOKEN_KEY = 'ban.mobile.token.v1';
const USER_KEY = 'ban.mobile.user.v1';

// ─── State + pub/sub ──────────────────────────────────────────────

let currentState: AuthState = { user: null, token: null };
let hydrated = false;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(currentState);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentState);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthState(): AuthState {
  return currentState;
}

export function isAuthenticated(): boolean {
  return !!currentState.token && !!currentState.user;
}

export function getCurrentUser(): AuthUser | null {
  return currentState.user;
}

export function getAccessToken(): string | null {
  return currentState.token;
}

// ─── Persisted storage ────────────────────────────────────────────

async function persistSession(token: string, user: AuthUser) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  currentState = { token, user };
  emit();
}

async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(USER_KEY).catch(() => {});
  currentState = { token: null, user: null };
  emit();
}

/**
 * Load the persisted session on app boot. Safe to call multiple times —
 * only reads from SecureStore once.
 */
export async function hydrateAuth(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const userRaw = await SecureStore.getItemAsync(USER_KEY);
    if (token && userRaw) {
      const user = JSON.parse(userRaw) as AuthUser;
      currentState = { token, user };
      emit();
    }
  } catch {
    // Ignore — bad JSON etc. means we start signed out.
  }
}

// ─── Server-side auth calls ───────────────────────────────────────

async function postAuth(
  path: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<{ accessToken: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // Non-JSON error body.
  }
  if (!res.ok) {
    const msg = json?.error || `Auth request failed (${res.status})`;
    // Carry the HTTP status so callers can tell "server rejected the
    // token" (sign the user out) from "network hiccup / 500" (keep
    // the session and let the next attempt retry).
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json;
}

// ─── Apple ────────────────────────────────────────────────────────

/**
 * Kick off Sign in with Apple. Resolves with the signed-in user or
 * throws on user cancellation / verification failure.
 */
export async function signInWithApple(): Promise<AuthUser> {
  // Generate a raw nonce and pass its SHA-256 hash to Apple. Apple
  // echoes the hash in the resulting identityToken; the server hashes
  // our raw nonce and compares.
  const rawNonce = await Crypto.getRandomBytesAsync(32).then((bytes: Uint8Array) =>
    Array.from(bytes)
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('')
  );
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  const result = await postAuth('/api/mobile/v1/auth/apple', {
    identityToken: credential.identityToken,
    nonce: rawNonce,
  });

  await persistSession(result.accessToken, result.user);
  return result.user;
}

// ─── Google ───────────────────────────────────────────────────────

/**
 * Kick off Sign in with Google. Uses expo-auth-session's IdTokenAuthRequest
 * so we get an idToken directly (no server round-trip on our side to
 * exchange an auth code). The client IDs come from app.json's `extra`.
 */
export async function signInWithGoogle(): Promise<AuthUser> {
  // Pick the right client ID for the current platform.
  // expo-auth-session's Google provider handles the choice internally
  // when we pass all three via the config below.
  const redirectUri = AuthSession.makeRedirectUri({
    // native scheme lives in app.json / expo config
  });

  const discovery = await AuthSession.fetchDiscoveryAsync(
    'https://accounts.google.com'
  );

  const clientIdForPlatform =
    GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID;
  if (!clientIdForPlatform) {
    throw new Error(
      'No Google OAuth client ID configured — set googleIosClientId / googleAndroidClientId / googleWebClientId in app.json extra.'
    );
  }

  const request = new AuthSession.AuthRequest({
    clientId: clientIdForPlatform,
    scopes: ['openid', 'email', 'profile'],
    redirectUri,
    responseType: AuthSession.ResponseType.IdToken,
    extraParams: {
      nonce: await Crypto.getRandomBytesAsync(16).then((b: Uint8Array) =>
        Array.from(b)
          .map((x: number) => x.toString(16).padStart(2, '0'))
          .join('')
      ),
    },
  });

  await request.makeAuthUrlAsync(discovery);
  const promptResult = await request.promptAsync(discovery);

  if (promptResult.type !== 'success') {
    if (promptResult.type === 'cancel' || promptResult.type === 'dismiss') {
      throw new Error('Google sign-in was cancelled.');
    }
    throw new Error('Google sign-in failed.');
  }

  const idToken =
    (promptResult.params as Record<string, string>).id_token ||
    (promptResult.authentication as any)?.idToken;
  if (!idToken) {
    throw new Error('Google did not return an id_token.');
  }

  const result = await postAuth('/api/mobile/v1/auth/google', { idToken });
  await persistSession(result.accessToken, result.user);
  return result.user;
}

// ─── Sign out ─────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  const token = currentState.token;
  // Clear locally first so the UI reflects the sign-out immediately;
  // network call is best-effort.
  await clearSession();
  if (!token) return;
  try {
    await fetch(`${API_BASE_URL}/api/mobile/v1/auth/sign-out`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Sign-out is idempotent server-side; local clear is enough.
  }
}

// ─── Refresh (called by api.ts on 401 tokenExpired) ───────────────

/**
 * Ask the server for a fresh token. Returns true on success, false if
 * the current session is too far gone to refresh — in which case the
 * caller should surface a sign-in prompt.
 */
// Single-flight guard. The kid page fires four requests in parallel
// (kid, updates, timeline, thread); when the token has just expired
// all four 401 at once and all four used to call refresh
// concurrently — four redundant network calls, and worse: any ONE of
// them failing transiently called clearSession() and nuked the
// session a sibling call had just successfully refreshed, signing
// the user out mid-scroll for no reason. Now the first caller does
// the work and the other three await the same promise.
let refreshInFlight: Promise<boolean> | null = null;

export async function refreshToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const token = currentState.token;
    if (!token) return false;
    try {
      const result = await postAuth(
        '/api/mobile/v1/auth/refresh',
        {},
        { Authorization: `Bearer ${token}` }
      );
      await persistSession(result.accessToken, result.user);
      return true;
    } catch (err) {
      // Only sign out when the SERVER rejected the token (401/403 —
      // revoked, malformed, or past the refresh window). A network
      // failure or a 5xx is not a verdict on the session: keep it,
      // fail this request, and let the next attempt retry.
      const status = (err as Error & { status?: number })?.status;
      if (status === 401 || status === 403) {
        await clearSession();
      }
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// ─── Dev sign-in (Expo Go preview only) ───────────────────────────

/**
 * Bypass Apple/Google verification. Only responds when the server has
 * MOBILE_DEV_AUTH='1' set. Only usable when the client has
 * EXPO_PUBLIC_MOBILE_DEV_AUTH='1' set. Both are cleaned up before
 * App Store submission.
 *
 * Purpose: Sign in with Apple requires the native
 * expo-apple-authentication module, which does not run inside Expo Go.
 * This lets Kevin preview the app on his phone via Expo Go without
 * needing an EAS development build first.
 */
export async function signInAsDev(email: string): Promise<AuthUser> {
  const result = await postAuth('/api/mobile/v1/auth/dev-sign-in', { email });
  await persistSession(result.accessToken, result.user);
  return result.user;
}
