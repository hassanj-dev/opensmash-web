'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { signUp, MIN_PASSWORD_LENGTH } from '@/lib/auth'
import Turnstile, { TURNSTILE_ENABLED } from '@/components/Turnstile'
import {
  UserPlus,
  User,
  Building2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft
} from 'lucide-react'

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

export default function SignUpPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    gymName: ''
  })
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaReset, setCaptchaReset] = useState(0)
  const [error, setError] = useState('')
  const [errorKey, setErrorKey] = useState(0)
  const [success, setSuccess] = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  const fail = (msg: string) => {
    setError(msg)
    setErrorKey(k => k + 1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password.length < MIN_PASSWORD_LENGTH) {
      fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`)
      return
    }
    if (formData.password !== formData.confirmPassword) {
      fail('Passwords do not match')
      return
    }
    if (!formData.fullName.trim()) {
      fail('Full name is required')
      return
    }
    if (!formData.gymName.trim()) {
      fail('Gym name is required')
      return
    }

    setLoading(true)
    try {
      const result = await signUp(
        formData.email,
        formData.password,
        formData.fullName.trim(),
        formData.gymName.trim(),
        captchaToken || undefined
      )
      setNeedsConfirm(!!result?.needsEmailConfirmation)
      setSuccess(true)

      // Only redirect when a session really exists (no email confirmation step)
      if (!result?.needsEmailConfirmation) {
        setTimeout(() => {
          router.push('/dashboard')
          router.refresh()
        }, 1500)
      }
    } catch (err: unknown) {
      setCaptchaReset(k => k + 1) // a captcha token works only once
      console.error('Signup error:', err)
      // lib/auth.ts already returns clear messages
      fail((err as Error).message || 'Failed to create account. Please try again.')
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
                {needsConfirm ? (
                  <Mail className="h-6 w-6 text-white" />
                ) : (
                  <CheckCircle2 className="h-6 w-6 text-white" />
                )}
              </div>
            </div>
            {needsConfirm ? (
              <>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight text-white">Check your email</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  We sent a confirmation link to <strong className="text-white">{formData.email}</strong>. Open it to
                  confirm your email, then sign in. Your gym will be available once the platform
                  administrator approves it.
                </p>
                <Link
                  href="/auth/login"
                  className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-white/10 text-[15px] font-medium text-white ring-1 ring-white/10 transition-all hover:bg-white/15"
                >
                  Go to Sign In
                </Link>
              </>
            ) : (
              <>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight text-white">Account Created!</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  Your gym account has been created. Redirecting to dashboard...
                </p>
                <Loader2 className="mx-auto mt-5 h-6 w-6 animate-spin text-brand-light" />
              </>
            )}
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
              <UserPlus className="h-5 w-5 text-white" />
            </div>
          </div>

          <div className="mt-5 text-center">
            <h1 className="text-[22px] font-semibold tracking-tight text-white sm:text-2xl">
              Create your gym account
            </h1>
            <p className="mx-auto mt-1.5 max-w-75 text-sm leading-relaxed text-white/55">
              Start managing your gym with OpenSmash.
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

            <label className="cs-field flex h-12 items-center gap-3 rounded-2xl px-4">
              <User className="h-4 w-4 shrink-0 text-white/40" />
              <span className="sr-only">Full Name</span>
              <input
                type="text"
                name="fullName"
                placeholder="Full name"
                value={formData.fullName}
                onChange={handleChange}
                required
                disabled={loading}
                autoComplete="name"
                className="h-full w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/35 disabled:opacity-60"
              />
            </label>

            <label className="cs-field flex h-12 items-center gap-3 rounded-2xl px-4">
              <Building2 className="h-4 w-4 shrink-0 text-white/40" />
              <span className="sr-only">Gym Name</span>
              <input
                type="text"
                name="gymName"
                placeholder="Gym name"
                value={formData.gymName}
                onChange={handleChange}
                required
                disabled={loading}
                className="h-full w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/35 disabled:opacity-60"
              />
            </label>

            <label className="cs-field flex h-12 items-center gap-3 rounded-2xl px-4">
              <Mail className="h-4 w-4 shrink-0 text-white/40" />
              <span className="sr-only">Email</span>
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={loading}
                autoComplete="email"
                className="h-full w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/35 disabled:opacity-60"
              />
            </label>

            <label className="cs-field flex h-12 items-center gap-3 rounded-2xl pl-4 pr-2">
              <Lock className="h-4 w-4 shrink-0 text-white/40" />
              <span className="sr-only">Password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder={`Password (min ${MIN_PASSWORD_LENGTH} characters)`}
                value={formData.password}
                onChange={handleChange}
                required
                disabled={loading}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
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
              <span className="sr-only">Confirm Password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                name="confirmPassword"
                placeholder="Confirm password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                disabled={loading}
                autoComplete="new-password"
                className="h-full w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/35 disabled:opacity-60"
              />
            </label>

            {TURNSTILE_ENABLED && <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />}

            <button
              type="submit"
              disabled={loading || (TURNSTILE_ENABLED && !captchaToken)}
              className="cs-btn flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f1c] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 flex items-center gap-3 text-xs text-white/40">
            <span className="h-px flex-1 bg-white/10" />
            Already have an account?
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <Link
            href="/auth/login"
            className="mt-4 flex h-11 w-full items-center justify-center rounded-2xl bg-white/10 text-sm font-medium text-white ring-1 ring-white/10 transition-all hover:-translate-y-px hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light"
          >
            Sign In
          </Link>

          <p className="mt-5 text-center text-xs text-white/40">
            By creating an account, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </Shell>
  )
}