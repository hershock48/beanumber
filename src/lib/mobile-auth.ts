/**
 * Mobile auth core — Apple & Google identity-token verification +
 * BAN-issued JWT sign/verify.
 *
 * Design:
 *
 *   1. Apple and Google publish their signing public keys as JWKS at
 *      well-known URLs. We fetch them with a 24-hour in-memory cache
 *      (Vercel's serverless instances are short-lived, so this is a
 *      practical "share within one warm instance" cache — cold starts
 *      pay the fetch cost). Key rotation happens well outside the
 *      cache window; when it does, the mismatch surfaces as a 401 and
 *      the client re-signs-in.
 *
 *   2. We verify the identity token's RS256 signature ourselves using
 *      Node's built-in crypto — no `jose` / `jsonwebtoken` dependency.
 *      Node 16+ can take a JWK directly with
 *      crypto.createPublicKey({ key, format: 'jwk' }).
 *
 *   3. Our own access token is a plain HS256 JWT signed with
 *      MOBILE_JWT_SECRET. Payload: { userId, email, iat, exp }. 30-day
 *      TTL. We don't need refresh tokens — the /refresh endpoint mints
 *      a fresh JWT from a still-valid or recently-expired one.
 *
 *   4. Sign-out puts a SHA-256 hash of the token in
 *      mobile_token_revocations, and requireMobileAuth() rejects any
 *      match. Idempotent — hash is the primary key.
 */
import crypto from 'crypto';

// ─── Constants ────────────────────────────────────────────────────

export const MOBILE_JWT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const MOBILE_JWT_REFRESH_GRACE_SECONDS = 60 * 60 * 24 * 7; // 7 days

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

const APPLE_ISSUER = 'https://appleid.apple.com';
const GOOGLE_ISSUERS = new Set([
  'https://accounts.google.com',
  'accounts.google.com',
]);

const JWKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

// ─── Types ────────────────────────────────────────────────────────

interface JsonWebKey {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

interface Jwks {
  keys: JsonWebKey[];
}

interface CachedJwks {
  fetchedAt: number;
  keys: Map<string, JsonWebKey>; // kid -> JWK
}

export interface VerifiedIdentityToken {
  sub: string;
  email: string;
  emailVerified: boolean;
}

export interface MobileJwtPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

// ─── JWKS fetch + cache ───────────────────────────────────────────

const jwksCache = new Map<string, CachedJwks>();

async function getJwks(url: string): Promise<Map<string, JsonWebKey>> {
  const now = Date.now();
  const cached = jwksCache.get(url);
  if (cached && now - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.keys;
  }

  const res = await fetch(url, {
    // Explicitly disable any Next.js caching — we manage our own.
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch JWKS from ${url}: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as Jwks;
  const keys = new Map<string, JsonWebKey>();
  for (const key of body.keys) {
    if (key.kid) keys.set(key.kid, key);
  }
  jwksCache.set(url, { fetchedAt: now, keys });
  return keys;
}

// ─── Base64URL + JWT parsing ──────────────────────────────────────

function b64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

function b64urlEncode(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

interface DecodedJwt {
  header: { alg: string; kid?: string; typ?: string };
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
}

function decodeJwt(token: string): DecodedJwt {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(b64urlDecode(headerB64).toString('utf8'));
  const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  return {
    header,
    payload,
    signingInput: `${headerB64}.${payloadB64}`,
    signature: b64urlDecode(sigB64),
  };
}

// ─── Identity token verification (RS256, Apple / Google) ──────────

async function verifyRs256IdentityToken(params: {
  token: string;
  jwksUrl: string;
  expectedIssuers: Set<string> | string;
  expectedAudience: string | string[];
  nonce?: string;
  audienceMatchesPrefix?: boolean;
}): Promise<VerifiedIdentityToken> {
  const {
    token,
    jwksUrl,
    expectedIssuers,
    expectedAudience,
    nonce,
    audienceMatchesPrefix,
  } = params;

  const decoded = decodeJwt(token);
  if (decoded.header.alg !== 'RS256') {
    throw new Error(`Unexpected identity token alg: ${decoded.header.alg}`);
  }
  const kid = decoded.header.kid;
  if (!kid) throw new Error('Identity token missing kid');

  const keys = await getJwks(jwksUrl);
  let jwk = keys.get(kid);
  if (!jwk) {
    // Key not in cache — force a refresh in case Apple/Google rotated.
    jwksCache.delete(jwksUrl);
    const refreshed = await getJwks(jwksUrl);
    jwk = refreshed.get(kid);
    if (!jwk) throw new Error(`No JWKS entry for kid=${kid}`);
  }

  const publicKey = crypto.createPublicKey({
    key: jwk as unknown as crypto.JsonWebKey,
    format: 'jwk',
  });

  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(decoded.signingInput, 'utf8'),
    publicKey,
    decoded.signature
  );
  if (!ok) throw new Error('Identity token signature invalid');

  const payload = decoded.payload as {
    iss?: string;
    aud?: string | string[];
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    exp?: number;
    nbf?: number;
    nonce?: string;
  };

  // Issuer check
  if (typeof payload.iss !== 'string') throw new Error('Missing iss');
  const issuerOk =
    typeof expectedIssuers === 'string'
      ? payload.iss === expectedIssuers
      : expectedIssuers.has(payload.iss);
  if (!issuerOk) throw new Error(`Unexpected iss: ${payload.iss}`);

  // Audience check
  const audValues = Array.isArray(payload.aud)
    ? payload.aud
    : payload.aud
      ? [payload.aud]
      : [];
  const expectedAudList = Array.isArray(expectedAudience)
    ? expectedAudience
    : [expectedAudience];
  const audOk = audValues.some(a =>
    expectedAudList.some(e =>
      audienceMatchesPrefix ? a.startsWith(e) : a === e
    )
  );
  if (!audOk) {
    throw new Error(`Unexpected aud: ${JSON.stringify(payload.aud)}`);
  }

  // Time checks
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < nowSec) {
    throw new Error('Identity token expired');
  }
  if (typeof payload.nbf === 'number' && payload.nbf > nowSec + 60) {
    throw new Error('Identity token nbf in future');
  }

  // Nonce check (Apple only — Google's mobile flow doesn't require it
  // client-side in a way we can universally verify without extra
  // client wiring; leave as optional).
  if (nonce) {
    if (payload.nonce !== nonce) {
      throw new Error('Nonce mismatch');
    }
  }

  // sub + email
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Missing sub');
  }
  if (typeof payload.email !== 'string' || !payload.email) {
    throw new Error('Missing email');
  }
  // Apple returns email_verified as a string ("true"/"false"). Google
  // returns a boolean. Normalize.
  const emailVerified =
    payload.email_verified === true || payload.email_verified === 'true';

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified,
  };
}

/**
 * Verify an Apple identityToken from Sign in with Apple.
 *
 * `nonce` is the raw nonce the client generated for the request. Apple
 * echoes the SHA-256 hex of that raw nonce in the token's `nonce`
 * claim when the client sets nonceEnabledHashedNonce (the recommended
 * path with expo-apple-authentication). If your client sends the
 * unhashed nonce, pass that directly and this function will hash it.
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  rawNonce?: string
): Promise<VerifiedIdentityToken> {
  // Bundle ID(s) authorized for our Apple app. Multiple entries allow
  // dev / TestFlight / prod builds to share the endpoint.
  const audRaw = process.env.APPLE_BUNDLE_IDS || process.env.APPLE_BUNDLE_ID || '';
  const audList = audRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (audList.length === 0) {
    // In practice the client sends the bundle id via the identity
    // token's aud. Accepting any aud when unset would defeat the
    // purpose; fail loudly instead.
    throw new Error(
      'APPLE_BUNDLE_IDS is not configured — set it to your app bundle id(s) in Vercel env.'
    );
  }

  // Apple's nonce claim is the SHA-256 hex of the raw nonce when
  // hashed-nonce mode is used (Expo's default). Support both.
  let nonceForCheck: string | undefined;
  if (rawNonce) {
    const hashed = crypto
      .createHash('sha256')
      .update(rawNonce)
      .digest('hex');
    // We don't know which mode the client used; the caller must send
    // the raw one and we'll accept either the raw or the hashed value
    // in the token. Do this by first trying hashed (Expo default),
    // then raw as a fallback.
    nonceForCheck = hashed;
    try {
      return await verifyRs256IdentityToken({
        token: identityToken,
        jwksUrl: APPLE_JWKS_URL,
        expectedIssuers: APPLE_ISSUER,
        expectedAudience: audList,
        nonce: nonceForCheck,
      });
    } catch (err) {
      // Retry with raw nonce for clients that don't hash.
      return verifyRs256IdentityToken({
        token: identityToken,
        jwksUrl: APPLE_JWKS_URL,
        expectedIssuers: APPLE_ISSUER,
        expectedAudience: audList,
        nonce: rawNonce,
      });
    }
  }

  return verifyRs256IdentityToken({
    token: identityToken,
    jwksUrl: APPLE_JWKS_URL,
    expectedIssuers: APPLE_ISSUER,
    expectedAudience: audList,
  });
}

/**
 * Verify a Google idToken from Sign in with Google. Accepts any of
 * the client IDs in GOOGLE_CLIENT_IDS (comma-separated) so iOS,
 * Android, and web builds can all hit the same endpoint.
 */
export async function verifyGoogleIdToken(
  idToken: string
): Promise<VerifiedIdentityToken> {
  const audRaw = process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '';
  const audList = audRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (audList.length === 0) {
    throw new Error(
      'GOOGLE_CLIENT_IDS is not configured — set it to your OAuth client id(s) in Vercel env.'
    );
  }

  return verifyRs256IdentityToken({
    token: idToken,
    jwksUrl: GOOGLE_JWKS_URL,
    expectedIssuers: GOOGLE_ISSUERS,
    expectedAudience: audList,
  });
}

// ─── BAN-issued JWT (HS256, MOBILE_JWT_SECRET) ────────────────────

function getMobileJwtSecret(): string {
  const s = process.env.MOBILE_JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'MOBILE_JWT_SECRET is not set or too short (need 32+ chars). Generate with `openssl rand -base64 48`.'
    );
  }
  return s;
}

/**
 * Mint a BAN access token. Returns the token string. 30-day TTL.
 */
export function signMobileToken(input: {
  userId: string;
  email: string;
}): { token: string; payload: MobileJwtPayload } {
  const secret = getMobileJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload: MobileJwtPayload = {
    userId: input.userId,
    email: input.email,
    iat: now,
    exp: now + MOBILE_JWT_TTL_SECONDS,
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = b64urlEncode(JSON.stringify(header));
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');
  return { token: `${signingInput}.${sig}`, payload };
}

export interface VerifiedMobileToken {
  payload: MobileJwtPayload;
  /** Set when the token is past exp but within the refresh grace window. */
  expired: boolean;
}

/**
 * Parse + verify a BAN access token. If `allowGrace` is true, returns
 * a verified result with `expired: true` when the token is past exp
 * but within MOBILE_JWT_REFRESH_GRACE_SECONDS — used by /refresh.
 *
 * Throws on any invalid signature / malformed token / past grace.
 */
export function verifyMobileToken(
  token: string,
  opts: { allowGrace?: boolean } = {}
): VerifiedMobileToken {
  const secret = getMobileJwtSecret();
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed access token');
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(b64urlDecode(headerB64).toString('utf8'));
  if (header.alg !== 'HS256') {
    throw new Error(`Unexpected access token alg: ${header.alg}`);
  }
  const signingInput = `${headerB64}.${payloadB64}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest();
  const actual = b64urlDecode(sigB64);
  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    throw new Error('Access token signature invalid');
  }

  const payload = JSON.parse(
    b64urlDecode(payloadB64).toString('utf8')
  ) as MobileJwtPayload;
  if (
    typeof payload.userId !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number'
  ) {
    throw new Error('Access token payload malformed');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    if (!opts.allowGrace) {
      throw new Error('Access token expired');
    }
    if (payload.exp + MOBILE_JWT_REFRESH_GRACE_SECONDS < now) {
      throw new Error('Access token past refresh grace window');
    }
    return { payload, expired: true };
  }
  return { payload, expired: false };
}

/**
 * SHA-256 hex digest of the token — used as the primary key in
 * mobile_token_revocations.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
