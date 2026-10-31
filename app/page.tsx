import type { Metadata } from 'next'
import { SpeedInsights } from "@vercel/speed-insights/next"
import Landing from '@/components/ui/landing/landing'

export const metadata: Metadata = {
  title: 'OpenSmash - Gym Management Software',
  description:
    'Run your gym from one place: members, attendance, payments and reports, synced with the OpenSmash desktop app.',
}

export default function HomePage() {
  <SpeedInsights/>
  return <Landing /> 

}