'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import Logo from '@/components/Logo'
import AttendanceLineChart from '@/components/AttendanceLineChart'
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarCheck,
  Check,
  Menu,
  MonitorSmartphone,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react'

/* Brand blue (matches logo) */
const BRAND = 'bg-[#1f6bff] text-white'

const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
  { href: '#roles', label: 'Teams' },
  { href: '#start', label: 'Get started' },
]

/* Adds .is-in to every .cs-reveal when it scrolls into view */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.cs-reveal')
    if (!('IntersectionObserver' in window)) {
      els.forEach(e => e.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      entries =>
        entries.forEach(en => {
          if (en.isIntersecting) {
            en.target.classList.add('is-in')
            io.unobserve(en.target)
          }
        }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    els.forEach(e => io.observe(e))
    return () => io.disconnect()
  }, [])
}

function Wordmark({ dark = true }: { dark?: boolean }) {
  return <Logo dark={dark} />
}

export default function Landing() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const mounted = useRef(true)

  useReveal()

  useEffect(() => {
    mounted.current = true
    // Display-only: decides whether the button says Login or Dashboard.
    // Real protection stays in proxy.ts.
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (mounted.current) setSignedIn(!!data.user)
      })
      .catch(() => {})
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      mounted.current = false
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const authHref = signedIn ? '/dashboard' : '/auth/login'
  const authLabel = signedIn ? 'Dashboard' : 'Login'

  return (
    <div className="overflow-x-hidden bg-[#05070d] text-white antialiased">
      {/* ---------------- Navbar ---------------- */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled || open ? 'bg-[#05070d]/85 backdrop-blur-xl' : 'bg-transparent'
        }`}
      >
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Wordmark />

          <ul className="hidden items-center gap-7 text-[13px] text-white/70 md:flex">
            {NAV.map(n => (
              <li key={n.href}>
                <a href={n.href} className="transition-colors hover:text-white">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={authHref}
              className="hidden rounded-full px-4 py-1.5 text-[13px] font-medium text-white/90 transition-colors hover:bg-white/10 sm:inline-block"
            >
              {authLabel}
            </Link>
            {!signedIn && (
              <Link
                href="/auth/signup"
                className="hidden rounded-full bg-[#1f6bff] px-4 py-1.5 text-[13px] font-semibold text-white transition-transform hover:scale-[1.03] active:scale-95 sm:inline-block"
              >
                Get started
              </Link>
            )}
            <button
              onClick={() => setOpen(o => !o)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 md:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        <div
          className={`overflow-hidden transition-[max-height,opacity] duration-300 md:hidden ${
            open ? 'max-h-[420px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="space-y-1 border-t border-white/10 px-4 pb-6 pt-3">
            {NAV.map(n => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-3 text-base text-white/80 hover:bg-white/5"
              >
                {n.label}
              </a>
            ))}
            <div className="grid grid-cols-2 gap-3 pt-3">
              <Link
                href={authHref}
                className="flex h-12 items-center justify-center rounded-full bg-white/10 text-sm font-medium"
              >
                {authLabel}
              </Link>
              <Link
                href={signedIn ? '/dashboard' : '/auth/signup'}
                className={`flex h-12 items-center justify-center rounded-full text-sm font-semibold ${BRAND}`}
              >
                {signedIn ? 'Open app' : 'Get started'}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="cs-hero-bg relative isolate overflow-hidden">
        <div aria-hidden className="cs-grid-lines absolute inset-0 -z-10" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-14 pt-20 sm:px-6 sm:pt-24 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:px-8 lg:pb-16 lg:pt-28">
          <div>
            <div className="cs-reveal inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pl-2.5 pr-3.5 text-[11px] text-white/80">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="cs-pulse-dot absolute inline-flex h-full w-full rounded-full bg-[#3d84ff]" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3d84ff]" />
              </span>
              Web dashboard + offline-first desktop app
            </div>

            <h1
              className="cs-reveal mt-5 text-[1.9rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-5xl lg:text-[3.2rem]"
              style={{ ['--d' as string]: '80ms' }}
            >
              Run your gym.
              <br />
              Not your <span className="cs-text-grad">spreadsheets.</span>
            </h1>

            <p
              className="cs-reveal mt-4 max-w-lg text-[14px] leading-relaxed text-white/65 sm:mt-5 sm:text-base"
              style={{ ['--d' as string]: '160ms' }}
            >
              OpenSmash brings members, attendance, payments and reports into one clean system, built for
              gym owners who want to spend less time on admin and more time on the floor.
            </p>

            <div
              className="cs-reveal mt-7 flex flex-col gap-3 sm:flex-row"
              style={{ ['--d' as string]: '240ms' }}
            >
              <Link
                href="/auth/signup"
                className={`cs-lime-btn group inline-flex h-12 w-full items-center justify-between gap-3 rounded-full pl-6 pr-2 text-[14px] font-semibold sm:w-auto sm:justify-center ${BRAND}`}
              >
                Get started
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white transition-transform group-hover:rotate-45">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </Link>
              <Link
                href={authHref}
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-white/10 px-6 text-[14px] font-medium transition-colors hover:bg-white/15 sm:w-auto"
              >
                {signedIn ? 'Go to dashboard' : 'Login to your gym'}
              </Link>
            </div>

            <ul
              className="cs-reveal mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-white/55"
              style={{ ['--d' as string]: '320ms' }}
            >
              {['Multi-gym ready', 'Role-based access', 'Syncs with desktop'].map(t => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#3d84ff]" /> {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Product preview (illustrative) */}
          <div className="cs-reveal relative mx-auto w-full max-w-lg" style={{ ['--d' as string]: '200ms' }}>
            <div className="cs-float-a rounded-[24px] border border-white/10 bg-[#0e1320] p-3.5 shadow-2xl shadow-[#1f6bff]/10 sm:rounded-[28px] sm:p-5">
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                </div>
                <span className="text-[11px] uppercase tracking-widest text-white/35">Preview</span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { k: 'Members', v: 'Active', i: Users },
                  { k: 'Today', v: 'Check-ins', i: CalendarCheck },
                  { k: 'This month', v: 'Revenue', i: Wallet },
                ].map(c => (
                  <div key={c.k} className="min-w-0 rounded-2xl bg-white/[0.06] p-2.5 sm:p-3">
                    <c.i className="h-4 w-4 text-[#3d84ff]" />
                    <p className="mt-3 truncate text-[10px] text-white/45 sm:text-[11px]">{c.k}</p>
                    <p className="truncate text-[13px] font-medium sm:text-[14px]">{c.v}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-2xl bg-white/[0.06] p-3.5 sm:p-4">
                <div className="flex items-center justify-between text-xs text-white/50">
                  <span>Weekly attendance</span>
                  <span className="text-[#3d84ff]">live</span>
                </div>
                <div className="mt-4">
                  <AttendanceLineChart />
                </div>
              </div>
            </div>

            {/* Floating cards */}
            <div className="cs-float-b absolute -bottom-6 -left-2 hidden w-52 rounded-2xl bg-white p-3.5 text-black shadow-xl sm:block lg:-left-10">
              <div className="flex items-center gap-2">
                <MonitorSmartphone className="h-4 w-4 text-[#1f6bff]" />
                <p className="text-xs font-semibold">Desktop in sync</p>
              </div>
              <p className="mt-1.5 text-xs leading-snug text-black/60">
                Reception keeps working offline. Everything syncs when the connection is back.
              </p>
            </div>
            <div className="cs-float-a absolute -right-2 -top-5 hidden rounded-2xl bg-[#1f6bff] px-4 py-3 text-white shadow-xl shadow-[#1f6bff]/30 sm:block lg:-right-6">
              <p className="text-xs font-semibold">Receipts, auto-numbered</p>
              <p className="text-[11px] text-white/75">per gym, every payment</p>
            </div>
          </div>
        </div>

        {/* Marquee */}
        <div className="border-y border-white/10 bg-black/40 py-3.5">
          <div className="overflow-hidden">
            <div className="cs-marquee flex w-max gap-12 whitespace-nowrap text-[13px] text-white/45">
              {Array.from({ length: 2 }).flatMap((_, r) =>
                ['Members', 'Attendance', 'Payments', 'Memberships', 'Expenses', 'Reports', 'Staff roles', 'Multi-gym'].map(
                  t => (
                    <span key={`${r}-${t}`} className="flex items-center gap-12">
                      {t}
                      <span className="h-1 w-1 rounded-full bg-[#3d84ff]" />
                    </span>
                  )
                )
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section id="features" className="scroll-mt-16 bg-white py-14 text-black sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            <div className="cs-reveal">
              <span className="inline-block rounded-full border border-[#1f6bff]/70 px-4 py-1.5 text-[13px] text-[#1f6bff]">
                Everything in one place
              </span>
              <h2 className="mt-5 text-[1.5rem] font-semibold leading-tight tracking-tight sm:text-3xl">
                Built for how gyms actually work, front desk to owner.
              </h2>
              <p className="mt-4 max-w-md text-[14px] text-black/60 sm:text-[15px]">
                No bloated tools. Just the modules a gym needs every single day, designed to be fast on a
                busy reception desk.
              </p>
              <Link
                href="/auth/signup"
                className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#05070d] py-1.5 pl-5 pr-1.5 text-[13px] font-medium text-white transition-transform hover:scale-[1.03]"
              >
                Start now
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1f6bff] text-white">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { i: Users, t: 'Member management', d: 'Profiles, membership plans, expiry tracking and quick search. Member codes generated for you.' },
                { i: CalendarCheck, t: 'Attendance', d: 'Fast check-ins from the front desk with a clear daily and monthly picture.' },
                { i: Wallet, t: 'Payments & receipts', d: 'Record payments in seconds and get numbered receipts per gym automatically.' },
                { i: BarChart3, t: 'Reports & expenses', d: 'Track income against expenses and see how your gym is really performing.' },
              ].map((f, idx) => (
                <div
                  key={f.t}
                  className="cs-reveal group rounded-3xl bg-gray-50 p-5 ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:bg-[#eaf1ff] hover:shadow-lg sm:p-6"
                  style={{ ['--d' as string]: `${idx * 80}ms` }}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#05070d] text-[#4d8dff] transition-transform duration-300 group-hover:-rotate-6">
                    <f.i className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-[16px] font-semibold">{f.t}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-black/60">{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Bento ---------------- */}
      <section className="px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="mx-auto max-w-[96rem] rounded-[28px] bg-[#0a0d16] p-3 sm:rounded-[36px] sm:p-5">
          <div className="grid auto-rows-[minmax(140px,auto)] gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
            <div className="cs-reveal cs-bento relative overflow-hidden rounded-3xl bg-[#111626] p-6 sm:p-8 md:col-span-4 lg:col-span-3 lg:row-span-2">
              <MonitorSmartphone className="cs-bento-icon relative z-10 h-8 w-8 text-[#3d84ff]" />
              <h3 className="relative z-10 mt-5 max-w-sm text-xl font-semibold leading-snug sm:text-2xl">
                A desktop app that never stops working.
              </h3>
              <p className="relative z-10 mt-3 max-w-md text-[14px] text-white/55">
                The reception desktop app is offline-first, so check-ins and payments continue even when the
                internet drops, then sync with your web dashboard automatically.
              </p>
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-6 -right-3 select-none text-[7rem] font-black leading-none tracking-tighter text-[#1f6bff]/30 sm:-bottom-8 sm:-right-5 sm:text-[11rem] sm:text-[#1f6bff]/80"
              >
                .C
              </div>
            </div>

            <div className="cs-reveal cs-bento rounded-3xl bg-[#111626] p-6 md:col-span-2 lg:col-span-3" style={{ ['--d' as string]: '80ms' }}>
              <ShieldCheck className="cs-bento-icon h-7 w-7 text-[#3d84ff]" />
              <h3 className="mt-4 text-[16px] font-semibold">Secure by design</h3>
              <p className="mt-1 text-[13px] text-white/55">
                Each gym only ever sees its own data, enforced at the database level.
              </p>
            </div>

            <div className="cs-reveal cs-bento rounded-3xl bg-[#111626] p-6 md:col-span-2 lg:col-span-3" style={{ ['--d' as string]: '160ms' }}>
              <Building2 className="cs-bento-icon h-7 w-7 text-[#3d84ff]" />
              <h3 className="mt-4 text-[16px] font-semibold">Multi-gym platform</h3>
              <p className="mt-1 text-[13px] text-white/55">
                One platform, many gyms. Every owner gets a private, separate workspace.
              </p>
            </div>

            <div className="cs-reveal cs-blue-card flex flex-col justify-between gap-5 rounded-3xl p-6 text-white md:col-span-4 lg:col-span-6 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">Ready to set up your gym?</h3>
                <p className="mt-1 text-[13px] text-white/75">Create your account and add your first members today.</p>
              </div>
              <Link
                href="/auth/signup"
                className="group inline-flex h-11 w-full items-center justify-between gap-3 rounded-full bg-black pl-6 pr-1.5 text-[13px] font-semibold text-white sm:w-fit"
              >
                Create account
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1f6bff] text-white transition-transform group-hover:rotate-45">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how" className="scroll-mt-16 bg-white py-14 text-black sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="cs-reveal max-w-2xl">
            <span className="inline-block rounded-full border border-[#1f6bff]/70 px-4 py-1.5 text-[13px] text-[#1f6bff]">How it works</span>
            <h2 className="mt-5 text-[1.5rem] font-semibold tracking-tight sm:text-3xl">Up and running in three steps.</h2>
          </div>
          <div className="mt-9 grid gap-4 sm:mt-10 md:grid-cols-3">
            {[
              { n: '01', t: 'Create your gym', d: 'Sign up with your gym name. Your workspace and default membership plans are created for you.' },
              { n: '02', t: 'Add your team', d: 'Invite managers and receptionists, each with the right level of access.' },
              { n: '03', t: 'Start managing', d: 'Add members, mark attendance, collect payments and watch your reports fill up.' },
            ].map((s, i) => (
              <div
                key={s.n}
                className="cs-reveal relative overflow-hidden rounded-3xl bg-gray-50 p-6 ring-1 ring-black/5 sm:p-7"
                style={{ ['--d' as string]: `${i * 100}ms` }}
              >
                <span className="text-5xl font-semibold tracking-tighter text-[#1f6bff]/15">{s.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.t}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-black/60">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Roles ---------------- */}
      <section id="roles" className="scroll-mt-16 bg-[#05070d] py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="cs-reveal max-w-2xl">
            <h2 className="text-[1.5rem] font-semibold tracking-tight sm:text-3xl">The right access for every role.</h2>
            <p className="mt-3 text-[14px] text-white/55 sm:text-[15px]">Your team only sees what they need, nothing more.</p>
          </div>
          <div className="mt-9 grid gap-4 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { r: 'Gym owner', d: 'Full control: settings, staff, plans, expenses and reports.' },
              { r: 'Manager', d: 'Runs daily operations, plans, expenses and reports.' },
              { r: 'Receptionist', d: 'Members, attendance and payments, fast at the front desk.' },
            ].map((x, i) => (
              <div
                key={x.r}
                className="cs-reveal cs-bento rounded-3xl bg-[#0e1320] p-6 ring-1 ring-white/5 sm:p-7"
                style={{ ['--d' as string]: `${i * 90}ms` }}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f6bff] text-sm font-bold text-white">
                  {x.r[0]}
                </div>
                <h3 className="mt-4 text-[16px] font-semibold">{x.r}</h3>
                <p className="mt-1.5 text-[13px] text-white/55">{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section id="start" className="scroll-mt-16 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="cs-blue-card relative mx-auto max-w-[96rem] overflow-hidden rounded-[28px] px-5 py-12 text-center text-white sm:rounded-[36px] sm:px-6 sm:py-20">
          <div aria-hidden className="cs-float-b absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/25 blur-2xl" />
          <div aria-hidden className="cs-float-a absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-black/30 blur-2xl" />
          <h2 className="cs-reveal relative mx-auto max-w-3xl text-[1.8rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-5xl sm:leading-[1.08]">
            Be organized. Be profitable. Be in control.
          </h2>
          <p className="cs-reveal relative mx-auto mt-4 max-w-xl text-[14px] text-white/80 sm:text-base" style={{ ['--d' as string]: '80ms' }}>
            Join gym owners who run their business on OpenSmash.
          </p>
          <div className="cs-reveal relative mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center" style={{ ['--d' as string]: '160ms' }}>
            <Link
              href="/auth/signup"
              className="inline-flex h-12 items-center justify-center rounded-full bg-black px-7 text-[14px] font-semibold text-white transition-transform hover:scale-[1.04]"
            >
              Create your gym account
            </Link>
            <Link
              href={authHref}
              className="inline-flex h-12 items-center justify-center rounded-full bg-white/15 px-7 text-[14px] font-medium transition-colors hover:bg-white/25"
            >
              {authLabel}
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-9 text-center text-[13px] text-white/45 sm:flex-row sm:px-6 sm:text-left lg:px-8">
        <Wordmark />
        <p>&copy; {new Date().getFullYear()} OpenSmash. All rights reserved.</p>
        <div className="flex gap-5">
          <Link href="/auth/login" className="hover:text-white">Login</Link>
          <Link href="/auth/signup" className="hover:text-white">Sign up</Link>
        </div>
      </footer>
    </div>
  )
}