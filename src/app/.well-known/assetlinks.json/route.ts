/**
 * GET /.well-known/assetlinks.json
 *
 * Android's Digital Asset Links file. When the BAN Android app is
 * installed, the Play Services stack fetches this file to verify the
 * app is authorized to handle beanumber.org URLs, then routes matching
 * intents into the app instead of the browser.
 *
 * Critical Android rules for this endpoint:
 *   1. MUST be at exactly this path (with the .json extension) over
 *      HTTPS. Google's verifier is strict.
 *   2. Content-Type MUST be `application/json`.
 *   3. No auth, no redirects.
 *   4. The SHA-256 fingerprint must match the signing certificate on
 *      the release APK. EAS gives you this out of the box; find it
 *      via `eas credentials` → Android → View credentials → SHA-256.
 *      Debug builds have a DIFFERENT fingerprint — if you want to
 *      test App Links on a debug APK, add its fingerprint to the
 *      array below.
 *
 * Env:
 *   APPLE_BUNDLE_ID          — reused? NO. See ANDROID_PACKAGE_NAME below.
 *   ANDROID_PACKAGE_NAME     — Android package (e.g. "org.beanumber.app")
 *   ANDROID_APP_SHA256       — colon-separated hex fingerprint of the
 *                              release signing cert. From EAS credentials.
 *                              Example: "AB:CD:EF:...:12:34"
 *
 * Both fail loudly (500) if missing. Same reasoning as the AASA route:
 * a placeholder assetlinks that returns 200 breaks App Links silently.
 *
 * Test:
 *   curl -H "Accept: application/json" \
 *     https://beanumber.org/.well-known/assetlinks.json | jq .
 *
 * Verify with Google's tool once the fingerprint is filled in:
 *   https://developers.google.com/digital-asset-links/tools/generator
 */

import { NextResponse } from 'next/server';

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const packageName = process.env.ANDROID_PACKAGE_NAME;
  const sha256Fingerprint = process.env.ANDROID_APP_SHA256;

  if (!packageName || !sha256Fingerprint) {
    return NextResponse.json(
      {
        error:
          'Android App Links not configured. Set ANDROID_PACKAGE_NAME and ANDROID_APP_SHA256 in Vercel env. Get the SHA-256 from `eas credentials` for the release build.',
      },
      { status: 500 }
    );
  }

  const body = [
    {
      relation: [
        'delegate_permission/common.handle_all_urls',
        // The get_login_creds permission would let the app share
        // password autofill with Chrome. We use OAuth / passkey; not
        // needed today.
      ],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: [sha256Fingerprint],
      },
    },
  ];

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
