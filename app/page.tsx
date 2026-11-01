import type { Metadata } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import Landing from '@/components/ui/landing/landing'
import { absoluteUrl, siteConfig } from '@/lib/site'

export const metadata: Metadata = {
  title: { absolute: siteConfig.title },
  description: siteConfig.description,
  alternates: { canonical: '/' },
}

const softwareApplication = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'OpenSmash',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, Windows',
  description: 'Gym management software: members, attendance, payments and reports.',
  url: siteConfig.url,
  logo: absoluteUrl('/logo.png'),
}

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }}
      />
      <Landing />
      <SpeedInsights />
    </>
  )
}