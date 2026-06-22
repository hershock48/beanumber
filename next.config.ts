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
        // /sponsorship → /shirts. The page went through a
        // kid-picker → explore → sign-in-gated arc. Pointing the
        // legacy URL straight at /shirts keeps cold visitors on
        // the brand mechanic instead of bouncing them through a
        // gated page that will redirect them to /shirts anyway.
        source: '/sponsorship',
        destination: '/shirts',
        permanent: true,
      },
    ];
  },
  // next/image optimization. We use this for every kid hero photo,
  // OtherKidsAtCampus strip image, CampusNewsfeed cover, etc. The
  // optimizer fetches the source, transcodes to WebP/AVIF sized for
  // the device, and edge-caches.
  //
  // Allowed source hosts:
  //   - Supabase Storage (current home for migrated kid + newsletter
  //     photos; permanent URLs, no expiry).
  //   - Airtable CDN hosts (legacy era — kept allowlisted so any
  //     in-flight Airtable-sourced URLs still optimize correctly
  //     during the cutover window. Can be removed once Airtable
  //     reads are fully retired.).
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
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
