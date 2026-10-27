'use client'

import { useRouter } from 'next/navigation'
import { Clock, LogOut } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth'

export default function PendingPage() {
  const router = useRouter()

  const handleLogout = async () => {
    await signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardContent className="space-y-4 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <Clock className="h-7 w-7 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Awaiting approval</h1>
          <p className="text-sm text-gray-600">
            Thanks for signing up! Your gym is waiting for approval from the platform
            administrator. You will get access as soon as it is approved.
          </p>
          <p className="text-xs text-gray-500">
            Questions? Please contact the platform administrator.
          </p>
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}