'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Building2, CheckCircle2, KeyRound, Tags, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { updatePassword, MIN_PASSWORD_LENGTH } from '@/lib/auth'

interface GymProfile {
  name: string
  phone: string
  address: string
}

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'

export default function SettingsPage() {
  const [gymId, setGymId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Gym profile
  const [profile, setProfile] = useState<GymProfile>({ name: '', phone: '', address: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<string | null>(null)
  const [pwError, setPwError] = useState<string | null>(null)

  const isOwner = role === 'gym_owner' || role === 'super_admin'
  const canManagePlans = isOwner || role === 'manager'

  const init = useCallback(async () => {
    setError(null)
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) {
        setError('You are not logged in. Please log in again.')
        return
      }
      setEmail(user.email || '')

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('gym_id, role')
        .eq('id', user.id)
        .single()

      if (userError || !userData?.gym_id) {
        setError('No gym is linked to your account.')
        return
      }

      const gid = userData.gym_id as string
      setGymId(gid)
      setRole((userData.role as string) || null)

      const { data: gym, error: gymError } = await supabase
        .from('gyms')
        .select('name, phone, address')
        .eq('id', gid)
        .single()

      if (gymError) throw gymError
      setProfile({
        name: gym?.name || '',
        phone: gym?.phone || '',
        address: gym?.address || ''
      })
    } catch (err) {
      console.error('Error loading settings:', err)
      setError('Could not load settings. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void init()
  }, [init])

  async function handleProfileSave(e: FormEvent) {
    e.preventDefault()
    if (!gymId || !isOwner) return

    if (!profile.name.trim()) {
      setProfileError('Gym name is required.')
      setProfileMsg(null)
      return
    }

    setProfileSaving(true)
    setProfileError(null)
    setProfileMsg(null)

    // .select('id') returns the changed rows, so a change blocked by RLS
    // (0 rows, no error) is detected instead of showing a false "saved".
    const { data, error: updateError } = await supabase
      .from('gyms')
      .update({
        name: profile.name.trim(),
        phone: profile.phone.trim() || null,
        address: profile.address.trim() || null
      })
      .eq('id', gymId)
      .select('id')

    if (updateError) {
      console.error('Error saving gym profile:', updateError)
      setProfileError('Could not save the gym profile. Please try again.')
    } else if (!data || data.length === 0) {
      setProfileError(
        'The change was not saved: you do not have permission. Run the RLS fix from Phase 1 in Supabase, or contact the administrator.'
      )
    } else {
      setProfileMsg('Gym profile saved.')
    }
    setProfileSaving(false)
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault()
    setPwMsg(null)

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPwError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.')
      return
    }

    setPwSaving(true)
    setPwError(null)

    try {
      await updatePassword(newPassword)
      setPwMsg('Password updated.')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      console.error('Error changing password:', err)
      setPwError((err as Error).message || 'Could not change the password. Please try again.')
    } finally {
      setPwSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        {[1, 2].map(i => (
          <Card key={i} className="animate-pulse border-0 shadow-lg">
            <CardHeader>
              <div className="h-5 w-40 rounded bg-gray-200"></div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-10 rounded-lg bg-gray-100"></div>
              <div className="h-10 rounded-lg bg-gray-100"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Settings</h1>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Gym profile */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            Gym Profile
          </CardTitle>
          {!isOwner && (
            <p className="text-xs text-gray-500">Only the gym owner can edit the gym profile.</p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSave} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Gym name *</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                  disabled={!isOwner}
                  className={`${inputClass} disabled:bg-gray-50 disabled:text-gray-500`}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
                <input
                  type="text"
                  value={profile.phone}
                  onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                  disabled={!isOwner}
                  className={`${inputClass} disabled:bg-gray-50 disabled:text-gray-500`}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
              <input
                type="text"
                value={profile.address}
                onChange={e => setProfile(p => ({ ...p, address: e.target.value }))}
                disabled={!isOwner}
                className={`${inputClass} disabled:bg-gray-50 disabled:text-gray-500`}
                placeholder="Optional"
              />
            </div>

            {profileError && (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                {profileError}
              </div>
            )}
            {profileMsg && (
              <div className="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                {profileMsg}
              </div>
            )}

            {isOwner && (
              <div className="flex justify-end">
                <Button type="submit" disabled={profileSaving}>
                  {profileSaving ? 'Saving...' : 'Save Profile'}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Plans now live on ONE page only */}
      {canManagePlans && (
        <Card className="border-0 shadow-lg">
          <CardContent className="pt-6">
            <Link
              href="/dashboard/plans"
              className="flex items-center justify-between rounded-lg p-2 hover:bg-gray-50"
            >
              <span className="flex items-center gap-3">
                <Tags className="h-5 w-5 text-green-600" />
                <span>
                  <span className="block text-sm font-medium text-gray-900">Membership Plans</span>
                  <span className="block text-xs text-gray-500">
                    Add, edit or deactivate plans on the Plans page.
                  </span>
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Account / password */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-purple-600" />
            Account
          </CardTitle>
          <p className="text-xs text-gray-500">
            Signed in as <span className="font-medium text-gray-700">{email || '-'}</span>
            {role ? ` (${role.replace('_', ' ')})` : ''}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => {
                    setNewPassword(e.target.value)
                    setPwError(null)
                    setPwMsg(null)
                  }}
                  autoComplete="new-password"
                  className={inputClass}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => {
                    setConfirmPassword(e.target.value)
                    setPwError(null)
                    setPwMsg(null)
                  }}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
            </div>

            {pwError && (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                {pwError}
              </div>
            )}
            {pwMsg && (
              <div className="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                {pwMsg}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={pwSaving || !newPassword}>
                {pwSaving ? 'Updating...' : 'Change Password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}