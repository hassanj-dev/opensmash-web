import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'

// Served automatically at /robots.txt
export default function robots(): MetadataRoute.Robots {
  // Vercel preview deployments (every branch / pull request gets its own URL)
  // must never appear in Google, otherwise they compete with the real site.
  if (process.env.VERCEL_ENV === 'preview') {
    return { rules: { userAgent: '*', disallow: '/' } }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private areas. (/auth/* and the status pages are kept out of Google with
        // an X-Robots-Tag header, see next.config.mjs. They are NOT listed here on
        // purpose: Google can only obey a noindex header on a page it is allowed to open.)
        disallow: ['/api/', '/dashboard', '/admin'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}