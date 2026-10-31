'use client'

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  X,
  XCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* PageHeader                                                          */
/* ------------------------------------------------------------------ */
export function PageHeader({
  title,
  description,
  actions
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900 sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* StatCard                                                            */
/* ------------------------------------------------------------------ */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  featured = false
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: LucideIcon
  /** e.g. { value: '12%', up: true } */
  trend?: { value: string; up: boolean }
  /** One per page: solid brand-gradient card */
  featured?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl p-5 transition-shadow',
        featured
          ? 'cs-blue-card text-white shadow-lg shadow-brand/25'
          : 'bg-white shadow-sm ring-1 ring-slate-200/70 hover:shadow-md'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn('text-sm font-medium', featured ? 'text-white/80' : 'text-slate-500')}>{label}</p>
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            featured ? 'bg-white/15' : 'bg-brand-soft'
          )}
        >
          <Icon className={cn('h-5 w-5', featured ? 'text-white' : 'text-brand')} />
        </div>
      </div>
      <p
        className={cn(
          'mt-3 truncate text-3xl font-semibold tracking-tight tabular-nums',
          featured ? 'text-white' : 'text-slate-900'
        )}
      >
        {value}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
              featured
                ? 'bg-white/20 text-white'
                : trend.up
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700'
            )}
          >
            {trend.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {trend.value}
          </span>
        )}
        {hint && <p className={cn('text-xs', featured ? 'text-white/75' : 'text-slate-500')}>{hint}</p>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* StatusPill                                                          */
/* ------------------------------------------------------------------ */
const toneStyles = {
  success: { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  warning: { pill: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
  danger: { pill: 'bg-red-50 text-red-700 ring-red-600/20', dot: 'bg-red-500' },
  info: { pill: 'bg-brand-soft text-brand-deep ring-brand/20', dot: 'bg-brand' },
  neutral: { pill: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-400' }
} as const

export type PillTone = keyof typeof toneStyles

export function StatusPill({
  tone = 'neutral',
  children,
  className
}: {
  tone?: PillTone
  children: ReactNode
  className?: string
}) {
  const t = toneStyles[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset',
        t.pill,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} />
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* EmptyState + Skeleton                                               */
/* ------------------------------------------------------------------ */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  /** Smaller, no dashed box. Use inside a Card. */
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center px-6 text-center',
        compact ? 'py-6' : 'rounded-2xl border border-dashed border-slate-200 py-12'
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft">
        <Icon className="h-6 w-6 text-brand" />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('cs-skeleton rounded-xl', className)} />
}

/* ------------------------------------------------------------------ */
/* Modal (portal, focus trap, Esc to close, scroll lock)               */
/* ------------------------------------------------------------------ */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

const sizeClass = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' } as const

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  size?: keyof typeof sizeClass
  /** false = cannot close with Esc / backdrop / X (e.g. while saving) */
  dismissible?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const items = () => (panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [])
    document.body.style.overflow = 'hidden'
    // Focus the first form field if there is one, otherwise the first control
    const first = panel?.querySelector<HTMLElement>('input,select,textarea') ?? items()[0] ?? panel
    first?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = items()
      if (list.length === 0) return
      const head = list[0]
      const tail = list[list.length - 1]
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault()
        tail.focus()
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault()
        head.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus?.()
    }
  }, [open, dismissible])

  if (!open || typeof document === 'undefined') return null

  // Rendered into document.body (portal) so no parent transform/animation
  // can trap this fixed overlay inside <main>.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto p-4 sm:items-center">
      <div
        className="cs-backdrop-in fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={dismissible ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'cs-pop-in relative my-auto w-full rounded-3xl bg-white p-6 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-200 focus:outline-none',
          sizeClass[size]
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {dismissible && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

/* ------------------------------------------------------------------ */
/* ConfirmDialog                                                       */
/* ------------------------------------------------------------------ */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  onConfirm,
  onCancel
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Please wait...' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            danger ? 'bg-red-50' : 'bg-brand-soft'
          )}
        >
          <AlertTriangle className={cn('h-5 w-5', danger ? 'text-red-600' : 'text-brand')} />
        </div>
        <p className="pt-1 text-sm leading-relaxed text-slate-600">{message}</p>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */
interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastApi>({ success: () => {}, error: () => {} })

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; kind: 'success' | 'error'; message: string }[]>([])
  const counter = useRef(0)

  const push = useCallback((kind: 'success' | 'error', message: string) => {
    const id = ++counter.current
    setItems(list => [...list, { id, kind, message }])
    window.setTimeout(() => setItems(list => list.filter(t => t.id !== id)), 4500)
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: m => push('success', m),
      error: m => push('error', m)
    }),
    [push]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      >
        {items.map(t => (
          <div
            key={t.id}
            role="status"
            className="cs-toast-in pointer-events-auto flex items-start gap-3 rounded-2xl bg-white p-3.5 text-sm shadow-lg shadow-slate-900/10 ring-1 ring-slate-200"
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            )}
            <p className="flex-1 text-slate-700">{t.message}</p>
            <button
              onClick={() => setItems(list => list.filter(x => x.id !== t.id))}
              aria-label="Dismiss"
              className="rounded-md p-0.5 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/* Pagination (client-side: page 1, 2, 3 ... + rows per page)          */
/* ------------------------------------------------------------------ */
// 1 ... 4 5 6 ... 20  (numbers are only shown on wider screens)
function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | 'gap')[] = [1]
  const from = Math.max(2, current - 1)
  const to = Math.min(total - 1, current + 1)
  if (from > 2) out.push('gap')
  for (let p = from; p <= to; p++) out.push(p)
  if (to < total - 1) out.push('gap')
  out.push(total)
  return out
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = [10, 25, 50],
  className
}: {
  /** current page, starting at 1 */
  page: number
  pageSize: number
  /** total number of rows (after search / filters) */
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizes?: number[]
  className?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, page), totalPages)
  const first = total === 0 ? 0 : (current - 1) * pageSize + 1
  const last = Math.min(current * pageSize, total)

  const navBtn =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
        <span className="tabular-nums">
          Showing {first}-{last} of {total}
        </span>
        {onPageSizeChange && (
          <label className="flex items-center gap-2">
            <span className="hidden sm:inline">Rows per page</span>
            <select
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              aria-label="Rows per page"
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {pageSizes.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <nav aria-label="Pagination" className="flex items-center justify-between gap-1.5 sm:justify-end">
        <button
          type="button"
          onClick={() => onPageChange(current - 1)}
          disabled={current <= 1}
          aria-label="Previous page"
          className={navBtn}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">Prev</span>
        </button>

        {/* phones: "Page 2 of 14" */}
        <span className="text-sm tabular-nums text-gray-600 sm:hidden">
          Page {current} of {totalPages}
        </span>

        {/* tablets / desktop: numbered pages */}
        <div className="hidden items-center gap-1.5 sm:flex">
          {pageWindow(current, totalPages).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 text-gray-400">
                ...
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-label={`Page ${p}`}
                aria-current={p === current ? 'page' : undefined}
                className={cn(
                  navBtn,
                  'tabular-nums',
                  p === current && 'border-brand bg-brand-soft text-brand-deep hover:bg-brand-soft'
                )}
              >
                {p}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(current + 1)}
          disabled={current >= totalPages}
          aria-label="Next page"
          className={navBtn}
        >
          <span className="mr-1 hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  )
}