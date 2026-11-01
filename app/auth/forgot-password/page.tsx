'use client'

import { useState } from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { supabase } from '@/lib/supabase/client'
import Turnstile, { TURNSTILE_ENABLED } from '@/components/Turnstile'
import { KeyRound, Mail, Loader2, AlertCircle, MailCheck, ArrowRight, ArrowLeft } from 'lucide-react'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="cs-auth-bg flex min-h-dvh flex-col overflow-hidden text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="cs-orbit h-155 w-155 sm:h-215 sm:w-215" />
        <div className="cs-orbit h-225 w-225 sm:h-310 sm:w-310" style={{ animationDelay: '-3s' }} />
      </div>
      <header className="px-5 pt-5 sm:px-8 sm:pt-7">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">{children}</main>
    </div>
  )
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaReset, setCaptchaReset] = useState(0)
  const [error, setError] = useState('')
  const [errorKey, setErrorKey] = useState(0)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/reset-password`,
        captchaToken: captchaToken || undefined,
      })
      if (err) throw err
      setSent(true)
    } catch (err: unknown) {
      setCaptchaReset(k => k + 1) // a captcha token works only once
      setError((err as Error).message || 'Could not send the reset link. Please try again.')
      setErrorKey(k => k + 1)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <Shell>
        <div className="cs-card w-full max-w-105 rounded-[28px] p-6 text-center sm:p-8">
          <div className="cs-stagger">
            <div className="flex justify-center">
              <div className="cs-tile flex h-14 w-14 items-center justify-center rounded-2xl">
                <MailCheck className="h-6 w-6 text-white" />
              </div>
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">Check your email</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              If an account exists for <strong className="text-white">{email}</strong>, we sent a link to
              reset your password. It may take a minute to arrive, so check spam too.
            </p>
            <Link
              href="/auth/login"
              className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-white/10 text-[15px] font-medium text-white ring-1 ring-white/10 transition-all hover:bg-white/15"
            >
              Back to sign in
            </Link>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-3 text-[13px] font-medium text-[#6aa2ff] underline-offset-4 hover:text-white hover:underline"
            >
              Use a different email
            </button>
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
              <KeyRound className="h-5 w-5 text-white" />
            </div>
          </div>

          <div className="mt-5 text-center">
            <h1 className="text-[22px] font-semibold tracking-tight sm:text-2xl">Forgot your password?</h1>
            <p className="mx-auto mt-1.5 max-w-75 text-sm leading-relaxed text-white/55">
              Enter your email and we will send you a link to choose a new one.
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

            {TURNSTILE_ENABLED && <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />}

            <button
              type="submit"
              disabled={loading || (TURNSTILE_ENABLED && !captchaToken)}
              className="cs-btn flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f1c] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending link...
                </>
              ) : (
                <>
                  Send reset link
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <Link
            href="/auth/login"
            className="mt-5 flex items-center justify-center gap-1.5 text-[13px] font-medium text-white/60 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </Shell>
  )
}