'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { signIn } from '@/lib/auth'
import { LogIn, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react'

const DISABLED_MSG =
  'Your account is disabled. Please contact your gym owner or the platform administrator.'

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in the App Router
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(
    params.get('error') === 'account_disabled' ? DISABLED_MSG : ''
  )
  // Re-keyed on every failed attempt so the shake animation replays
  const [errorKey, setErrorKey] = useState(0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn(email, password)

      // Staff with a temporary password must choose a new one first
      if (result?.mustChangePassword) {
        router.push('/auth/reset-password')
      } else {
        router.push('/dashboard')
      }
      router.refresh()
    } catch (err: unknown) {
      setError((err as Error).message || 'Invalid email or password')
      setErrorKey(k => k + 1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cs-auth-bg flex min-h-dvh flex-col overflow-hidden text-white">
      {/* Atmosphere */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="cs-orbit h-[620px] w-[620px] sm:h-[860px] sm:w-[860px]" />
        <div className="cs-orbit h-[900px] w-[900px] sm:h-[1240px] sm:w-[1240px]" style={{ animationDelay: '-3s' }} />
      </div>

      <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-8 sm:pt-7">
  <Logo />
  <Link
    href="/"
    aria-label="Back to home"
    className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white/10 text-white ring-1 ring-white/10 transition-all hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d84ff] sm:h-10 sm:w-auto sm:rounded-xl sm:px-3.5 sm:text-sm sm:font-medium"
  >
    <ArrowLeft className="h-5 w-5 sm:h-4 sm:w-4" />
    <span className="hidden sm:inline">Back to home</span>
  </Link>
</header>
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <div className="cs-card w-full max-w-[420px] rounded-[28px] p-6 sm:p-8">
          <div className="cs-stagger">
            <div className="flex justify-center">
              <div className="cs-tile flex h-12 w-12 items-center justify-center rounded-2xl">
                <LogIn className="h-5 w-5 text-white" />
              </div>
            </div>

            <div className="mt-5 text-center">
              <h1 className="text-[22px] font-semibold tracking-tight text-white sm:text-2xl">
                Welcome back
              </h1>
              <p className="mx-auto mt-1.5 max-w-[300px] text-sm leading-relaxed text-white/55">
                Sign in to manage members, attendance and payments for your gym.
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
                <Mail className="h-4 w-4 shrink-0 text-white/40" />
                <span className="sr-only">Email</span>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="email"
                  className="h-full w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/35 disabled:opacity-60"
                />
              </label>

              <div>
                <label className="cs-field flex h-12 items-center gap-3 rounded-2xl pl-4 pr-2">
                  <Lock className="h-4 w-4 shrink-0 text-white/40" />
                  <span className="sr-only">Password</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="current-password"
                    className="h-full w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/35 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d84ff]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </label>
                <div className="mt-2 flex justify-end">
                  <Link
                    href="/auth/forgot-password"
                    className="text-[13px] font-medium text-[#6aa2ff] underline-offset-4 transition-colors hover:text-white hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="cs-btn flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d84ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f1c] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 flex items-center gap-3 text-xs text-white/40">
              <span className="h-px flex-1 bg-white/10" />
              New to OpenSmash?
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <Link
              href="/auth/signup"
              className="mt-4 flex h-11 w-full items-center justify-center rounded-2xl bg-white/10 text-sm font-medium text-white ring-1 ring-white/10 transition-all hover:-translate-y-px hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d84ff]"
            >
              Create your gym account
            </Link>
          </div>
        </div>
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-white/40">
        By signing in, you agree to our Terms of Service and Privacy Policy
      </footer>
    </div>
  )
}