import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://js.stripe.com https://checkout.stripe.com",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: https://*.stripe.com https://dl.airtable.com https://v5.airtableusercontent.com https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://api.airtable.com https://*.supabase.co",
      "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  // URL redirects. Permanent (301) so search engines + browsers
  // cache the new canonical URL.
  async redirects() {
    return [
      {
        // /sponsorship → /campus. The page changed from a kid-picker
        // checkout to an explore page; the URL "sponsorship" no
        // longer matched the content (it's now about meeting the
        // campus, not buying a sponsorship). Old links from emails,
        // social posts, and bookmarks keep working via this 301.
        source: '/sponsorship',
        destination: '/campus',
        permanent: true,
      },
    ];
  },
  // next/image optimization. We use this for every Airtable-hosted
  // photo (kid hero, OtherKidsAtCampus strip, CampusNewsfeed covers)
  // so the browser receives a device-sized WebP/AVIF instead of the
  // raw 1.5–2 MB source JPEG, and so the edge cache keeps serving
  // those variants long after Airtable's signed URL expires.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'v5.airtableusercontent.com' },
      { protocol: 'https', hostname: 'dl.airtable.com' },
    ],
    // Modern formats first; Next.js will fall back to the original
    // if the browser doesn't accept these.
    formats: ['image/avif', 'image/webp'],
  },
  poweredByHeader: false,
};

export default nextConfig;
