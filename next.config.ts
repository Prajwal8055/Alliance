import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  poweredByHeader: false,
  // Photos are capped at 2 MB; leave room for multipart overhead.
  experimental: { serverActions: { bodySizeLimit: '2200kb' } },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Review links carry a one-time token in the URL: never leak it, never index it.
      { source: '/review/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Robots-Tag', value: 'noindex' }] },
      { source: '/(admin|me|login)/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
    ];
  },
};

export default config;
