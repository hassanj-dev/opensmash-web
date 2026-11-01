/** @type {import('next').NextConfig} */
const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]

// ---- Security headers -------------------------------------------------
const SUPABASE_HTTPS = 'https://cejmbsnyuyolgrvabmux.supabase.co'
const SUPABASE_WSS = 'wss://cejmbsnyuyolgrvabmux.supabase.co'
const isDev = process.env.NODE_ENV !== 'production'

// Content-Security-Policy is REPORT-ONLY first: the browser only logs
// violations in the console, nothing is blocked. Watch the console for a
// week, fix what it reports, then rename the header to
// 'Content-Security-Policy'.
//
// script-src keeps 'unsafe-inline' because Next.js writes small inline
// scripts. Removing it needs a per-request nonce (set in proxy.ts), which
// forces every page to render dynamically. That is a bigger change, so the
// simpler choice was made here.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://challenges.cloudflare.com https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${SUPABASE_HTTPS}`,
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE_HTTPS} ${SUPABASE_WSS} https://challenges.cloudflare.com`,
  'frame-src https://challenges.cloudflare.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const security = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy-Report-Only', value: csp },
]

const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  async headers() {
    return [
      { source: '/:path*', headers: security },
      // Login, dashboard, admin aur status pages Google mein na aayein
      { source: '/auth/:path*', headers: noindex },
      { source: '/dashboard/:path*', headers: noindex },
      { source: '/admin/:path*', headers: noindex },
      { source: '/pending', headers: noindex },
      { source: '/suspended', headers: noindex },
      { source: '/expired', headers: noindex },
      { source: '/api/:path*', headers: noindex },
    ]
  },
}

export default nextConfig