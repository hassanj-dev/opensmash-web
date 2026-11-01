/** @type {import('next').NextConfig} */
const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]

const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Login, dashboard, admin aur status pages Google mein na aayein
  async headers() {
    return [
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