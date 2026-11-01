'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { updatePassword, MIN_PASSWORD_LENGTH } from '@/lib/auth'
import { ShieldCheck, Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ArrowRight, Check, ArrowLeft } from 'lucide-react'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="cs-auth-bg flex min-h-dvh flex-col overflow-hidden text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="cs-orbit h-155 w-155 sm:h-215 sm:w-215" />
        <div className="cs-orbit h-225 w-225 sm:h-310 sm:w-310" style={{ animationDelay: '-3s' }} />
      </div>
      <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-8 sm:pt-7">
        <Logo />
        <Link
          href="/"
          aria-label="Back to home"
          className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white/10 text-white ring-1 ring-white/10 transition-all hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light sm:h-10 sm:w-auto sm:rounded-xl sm:px-3.5 sm:text-sm sm:font-medium"
        >
          <ArrowLeft className="h-5 w-5 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Back to home</span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">{children}</main>
    </div>
  )
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorKey, setErrorKey] = useState(0)
  const [success, setSuccess] = useState(false)

  const longEnough = password.length >= MIN_PASSWORD_LENGTH
  const matches = confirm.length > 0 && password === confirm

  const fail = (msg: string) => {
    setError(msg)
    setErrorKey(k => k + 1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!longEnough) return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`)
    if (password !== confirm) return fail('Passwords do not match')

    setLoading(true)
    try {
      // Works for a recovery-link session AND a normal login session
      // (updatePassword also clears the must_change_password flag)
      await updatePassword(password)
      setSuccess(true)
      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 2000)
    } catch (err: unknown) {
      fail((err as Error).message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <Shell>
        <div className="cs-card w-full max-w-105 rounded-[28px] p-6 text-center sm:p-8">
          <div className="cs-stagger">
            <div className="flex justify-center">
              <div className="cs-tile flex h-14 w-14 items-center justify-center rounded-2xl">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">Password updated</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Your password has been changed. Taking you to your dashboard...
            </p>
            <Loader2 className="mx-auto mt-5 h-6 w-6 animate-spin text-brand-light" />
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="cs-card w-full max-w-105 rounded-[28px] p-6 sm:p-8">
        <div className="cs-stagger">
          <div className="flex justify-center">
            <div className="cs-tile flex h-12 w-12 items-center justify-center rounded-2xl">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
          </div>

          <div className="mt-5 text-center">
            <h1 className="text-[22px] font-semibold tracking-tight sm:text-2xl">Create a new password</h1>
            <p className="mx-auto mt-1.5 max-w-75 text-sm leading-relaxed text-white/55">
              Choose a strong password you have not used before.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-3.5">
            {error && (
              <div
                key={errorKey}
                role="alert"
                className="cs-shake flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <label className="cs-field flex h-12 items-center gap-3 rounded-2xl pl-4 pr-2">
              <Lock className="h-4 w-4 shrink-0 text-white/40" />
              <span className="sr-only">New password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="New password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                className="h-full w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/35 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </label>

            <label className="cs-field flex h-12 items-center gap-3 rounded-2xl px-4">
              <Lock className="h-4 w-4 shrink-0 text-white/40" />
              <span className="sr-only">Confirm new password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                disabled={loading}
                autoComplete="new-password"
                className="h-full w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/35 disabled:opacity-60"
              />
            </label>

            <ul className="space-y-1.5 px-1 text-[13px]">
              <li className={`flex items-center gap-2 transition-colors ${longEnough ? 'text-emerald-300' : 'text-white/40'}`}>
                <Check className="h-3.5 w-3.5" /> At least {MIN_PASSWORD_LENGTH} characters
              </li>
              <li className={`flex items-center gap-2 transition-colors ${matches ? 'text-emerald-300' : 'text-white/40'}`}>
                <Check className="h-3.5 w-3.5" /> Both passwords match
              </li>
            </ul>

            <button
              type="submit"
              disabled={loading}
              className="cs-btn flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f1c] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  Update password
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </Shell>
  )
}