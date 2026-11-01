import type { MetadataRoute } from 'next'
import { siteConfig } from '@/lib/site'

// Served automatically at /manifest.webmanifest.
// Replaces the old /manifest.json link that returned 404.
// The icons below already exist in your public/ folder.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.title,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}