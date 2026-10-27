'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Phone } from 'lucide-react'
import { signOut } from '@/lib/auth'
import { useRouter } from 'next/navigation'

export default function SuspendedPage() {
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4">
      <Card className="border-0 shadow-xl max-w-lg w-full">
        <CardHeader className="text-center pb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4 mx-auto">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl text-red-900">Account Suspended</CardTitle>
          <CardDescription className="text-base">
            Your gym account has been temporarily suspended
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">
              Your account access has been restricted by the platform administrator.
              This means you cannot access your gym&apos;s data, members, payments, or any other features at this time.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">What does this mean?</h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>You cannot log in to your gym dashboard</li>
              <li>Your data is safe and preserved</li>
              <li>No new transactions can be recorded</li>
              <li>Your subscription may be affected</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">Next Steps</h3>
            <p className="text-sm text-gray-600">
              Please contact the platform administrator to resolve this issue and restore your account access.
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

          <Button
            onClick={handleSignOut}
            variant="outline"
            className="w-full"
          >
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
