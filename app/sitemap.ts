import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'

// Served automatically at /sitemap.xml
//
// Only list PUBLIC pages that really exist and that you want in Google.
// Do NOT add: /dashboard, /admin, /api, /auth/*, /pending, /suspended, /expired.
//
// When you build a new public page (for example /features or /pricing),
// add one line to the list below.

const LAST_UPDATED = new Date('2026-11-01')

const publicPages: Array<{
  path: string
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']
  priority: number
}> = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  // { path: '/features', changeFrequency: 'monthly', priority: 0.8 },
  // { path: '/pricing', changeFrequency: 'monthly', priority: 0.8 },
  // { path: '/download', changeFrequency: 'monthly', priority: 0.8 },
  // { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  // { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
]

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPages.map(page => ({
    url: absoluteUrl(page.path),
    lastModified: LAST_UPDATED,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }))
}