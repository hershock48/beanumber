/**
 * GET /.well-known/apple-app-site-association
 *
 * The Apple App Site Association (AASA) file. iOS reads this when
 * the BAN app is installed to decide which URLs on beanumber.org
 * should route to the app instead of Safari. Universal Links,
 * end-to-end.
 *
 * Critical Apple rules for this endpoint:
 *   1. MUST be served at exactly this path (no `.json` extension)
 *      over HTTPS. Any redirect or trailing junk breaks it.
 *   2. Content-Type MUST be `application/json` (NOT
 *      `application/pkcs7-mime` — that's the legacy signed-payload
 *      format and modern iOS rejects it if you also send the JSON
 *      body).
 *   3. No auth, no redirects, no cookies. Apple's CDN fetches this
 *      unauthenticated during app install and periodically after.
 *
 * The `paths` list drives which URLs jump into the app. Every path
 * in the Deep-link table (docs/claude/architecture.md
 * §"Deep linking") appears here. `NOT ` prefixes exclude — we keep
 * /admin/*, /api/*, and the .well-known bucket itself out of the
 * app so admin work and webhooks never trigger a Universal Link.
 *
 * Env:
 *   APPLE_TEAM_ID   — 10-char Apple Developer team ID (e.g. "AB12CD34EF")
 *   APPLE_BUNDLE_ID — iOS bundle identifier (e.g. "org.beanumber.app")
 *
 * Both fail loudly (500) if missing — silently serving an AASA with
 * a placeholder appIDs entry would break every install without a
 * clear error signal.
 *
 * Test:
 *   curl -H "Accept: application/json" \
 *     https://beanumber.org/.well-known/apple-app-site-association | jq .
 */

import { NextResponse } from 'next/server';

// Cache the response at Vercel's edge for an hour — Apple's CDN
// hits this a lot after a fresh install, but the content is stable.
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const teamId = process.env.APPLE_TEAM_ID;
  const bundleId = process.env.APPLE_BUNDLE_ID;

  if (!teamId || !bundleId) {
    // Fail loudly. Don't serve a placeholder — a broken AASA served
    // 200 would let a bad build ship without anyone noticing until
    // sponsors report the "app doesn't open from the link" bug.
    return NextResponse.json(
      {
        error:
          'Universal Links not configured. Set APPLE_TEAM_ID and APPLE_BUNDLE_ID in Vercel env.',
      },
      { status: 500 }
    );
  }

  const appID = `${teamId}.${bundleId}`;

  const body = {
    applinks: {
      // `apps` must be an empty array per Apple's format spec.
      apps: [],
      details: [
        {
          appID,
          // Modern format — `paths` is legacy but still respected;
          // `components` is the newer form that supports query
          // matching. We include both for maximum compatibility
          // across iOS versions.
          paths: [
            '/meet/*',
            '/children/*',
            '/newsletter/*',
            '/campus',
            '/me',
            // Explicitly exclude admin, api, and .well-known — a
            // universal link into the app for these paths would
            // break admin work and webhook handling.
            'NOT /admin/*',
            'NOT /api/*',
            'NOT /.well-known/*',
          ],
          components: [
            { '/': '/meet/*' },
            { '/': '/children/*' },
            { '/': '/newsletter/*' },
            { '/': '/campus' },
            { '/': '/me' },
            { '/': '/admin/*', exclude: true },
            { '/': '/api/*', exclude: true },
            { '/': '/.well-known/*', exclude: true },
          ],
        },
      ],
    },
    // webcredentials lets the app share password autofill with
    // Safari, but we use passkey / OAuth sign-in — leave it out to
    // keep the file minimal.
  };

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      // MUST be application/json. NOT application/pkcs7-mime.
      'Content-Type': 'application/json',
      // Apple's CDN respects this. Long enough to avoid hammering
      // the origin, short enough to recover from a bad deploy in
      // under an hour.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
