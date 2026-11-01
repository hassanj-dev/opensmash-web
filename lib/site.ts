// Central place for everything SEO needs to know about the site.
// Set NEXT_PUBLIC_SITE_URL in Vercel (Production) to your final domain, e.g. https://opensmash.app
// Until then the Vercel URL below is used.

const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://opensmash-web.vercel.app'

export const siteConfig = {
  name: 'OpenSmash',
  url: rawUrl.replace(/\/+$/, ''), // never a trailing slash
  title: 'OpenSmash - Gym Management Software',
  description:
    'Run your gym from one place: members, attendance, payments and reports, synced with the OpenSmash desktop app.',
  keywords: [
    'gym management software',
    'gym software',
    'gym membership software',
    'gym attendance system',
    'gym payment and receipt software',
    'gym management software Pakistan',
    'offline gym software',
    'multi gym management',
  ],
  locale: 'en_PK',
}

export function absoluteUrl(path = '/'): string {
  return `${siteConfig.url}${path.startsWith('/') ? path : `/${path}`}`
}