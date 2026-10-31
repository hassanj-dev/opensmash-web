'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { LogOut, Menu, X } from 'lucide-react'
import Logo from '@/components/Logo'
import { cn } from '@/lib/utils'

export interface ShellNavItem {
  label: string
  icon: LucideIcon
  /** Link target. Leave out if you use onClick (the admin page scrolls to sections). */
  href?: string
  onClick?: () => void
  /** Force the active state (needed for onClick items). Otherwise it is derived from the URL. */
  active?: boolean
  /** Only highlight when the URL matches exactly (use for '/dashboard') */
  exact?: boolean
  badge?: number
}

export interface ShellUser {
  name?: string | null
  email?: string | null
  avatarUrl?: string | null
}

/* Round avatar with initials fallback (also used when the image fails to load) */
export function Avatar({
  url,
  name,
  className
}: {
  url?: string | null
  name?: string | null
  className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const initial = (name || 'U').trim().charAt(0).toUpperCase()
  if (url && failed !== url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={url}
        src={url}
        alt=""
        onError={() => setFailed(url)}
        className={cn('h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white', className)}
      />
    )
  }
  return (
    <div
      aria-hidden
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#2f78ff] to-[#0a5cff] text-sm font-semibold text-white ring-2 ring-white',
        className
      )}
    >
      {initial}
    </div>
  )
}

/* 'ali' -> 'Ali' */
export const cap = (s?: string | null) => (s ? s.trim().charAt(0).toUpperCase() + s.trim().slice(1) : '')

export default function AppShell({
  navItems,
  workspaceName,
  workspaceRole,
  user,
  onSignOut,
  title,
  subtitle,
  topbarRight,
  children
}: {
  navItems: ShellNavItem[]
  workspaceName: string
  workspaceRole?: string
  user: ShellUser | null
  onSignOut: () => void
  /** Override the topbar title (default: label of the active nav item) */
  title?: string
  subtitle?: string
  topbarRight?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [dateLabel, setDateLabel] = useState('')

  // Set after mount so server and browser HTML always match
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDateLabel(
      new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Karachi'
      }).format(new Date())
    )
  }, [])

  const isActive = (item: ShellNavItem) => {
    if (item.active !== undefined) return item.active
    if (!item.href) return false
    return item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + '/')
  }

  const current = navItems.find(isActive)
  const pageTitle = title ?? current?.label ?? 'Dashboard'

  // Lock page scroll while the mobile drawer is open + close with Esc
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const itemClass = (active: boolean) =>
    cn(
      'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
      active ? 'bg-brand-soft text-brand-deep' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
      // left indicator for the active item
      active && "before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:rounded-full before:bg-brand"
    )

  return (
    <div className="min-h-screen bg-canvas text-slate-900">
      {/* Mobile backdrop */}
      {open && (
        <div
          className="cs-backdrop-in fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        aria-label="Main navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200/70 bg-white transition-transform duration-300 ease-out lg:translate-x-0',
          open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Logo dark={false} tile href="/dashboard" />
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="cs-scroll flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {navItems.map(item => {
            const active = isActive(item)
            const content = (
              <>
                <item.icon className={cn('h-[18px] w-[18px]', active ? 'text-brand' : 'text-slate-400 group-hover:text-slate-600')} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                      active ? 'bg-white text-brand-deep' : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </>
            )
            return item.href ? (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={itemClass(active)}
              >
                {content}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  setOpen(false)
                  item.onClick?.()
                }}
                className={itemClass(active)}
              >
                {content}
              </button>
            )
          })}
        </nav>

        {/* Gym + user (bottom of the sidebar) */}
        <div className="border-t border-slate-100 p-3">
          <div className="mb-1 flex items-center gap-2.5 border-b border-slate-100 px-2 pb-3 pt-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-sm font-semibold text-brand-deep">
              {workspaceName.trim().charAt(0).toUpperCase() || 'G'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-slate-900">{workspaceName}</p>
              {workspaceRole && <p className="truncate text-xs capitalize text-slate-500">{workspaceRole}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl p-2">
            <Avatar url={user?.avatarUrl} name={user?.name || user?.email} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{cap(user?.name) || 'User'}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
            <button
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight text-slate-900">{pageTitle}</p>
              {subtitle && <p className="hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {topbarRight}
            {dateLabel && (
              <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium tabular-nums text-slate-600 sm:inline">
                {dateLabel}
              </span>
            )}
          </div>
        </header>

        {/* key = pathname -> the entrance plays once per page, not on every re-render */}
        <main key={pathname} className="cs-enter mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}