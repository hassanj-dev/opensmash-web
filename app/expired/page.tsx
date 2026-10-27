'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarX, Phone } from 'lucide-react'
import { signOut } from '@/lib/auth'
import { useRouter } from 'next/navigation'

export default function ExpiredPage() {
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-yellow-50 flex items-center justify-center p-4">
      <Card className="border-0 shadow-xl max-w-lg w-full">
        <CardHeader className="text-center pb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-4 mx-auto">
            <CalendarX className="w-8 h-8 text-orange-600" />
          </div>
          <CardTitle className="text-2xl text-orange-900">License Expired</CardTitle>
          <CardDescription className="text-base">
            Your gym&apos;s license period has ended
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <p className="text-sm text-orange-800">
              Your license has expired, so access to your gym&apos;s data, members, payments,
              and other features is paused until it is renewed.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">What does this mean?</h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>You cannot use your gym dashboard until renewal</li>
              <li>Your data is safe and preserved</li>
              <li>No new transactions can be recorded</li>
              <li>Access returns as soon as the license is renewed</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Next Steps</h3>
            <p className="text-sm text-gray-600">
              Please contact the platform administrator to renew your license.
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Contact Support</p>
                <p className="text-sm text-gray-600 mt-1">
  Phone: <a href="tel:+923102378691" className="text-blue-600 hover:underline">+923102378691</a>
</p>
              </div>
            </div>
          </div>

          <Button onClick={handleSignOut} variant="outline" className="w-full">
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
