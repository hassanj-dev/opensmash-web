'use client'
import { useLiveRefresh } from '@/lib/auto-refresh'
import { useCurrency } from '@/lib/user-context'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { format } from 'date-fns'
import {
  AlertTriangle,
  BarChart3,
  Download,
  RefreshCw,
  Receipt,
  TrendingUp,
  UserPlus,
  Wallet,
  Activity
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import {
  pkToday,
  pkMonth,
  pkAddDays,
  pkAddMonths,
  pkMonthEnd,
  pkDayStartISO
} from '@/lib/pk-date'

interface Bucket {
  key: string
  total: number
}

interface ReportSummary {
  payments_count: number
  expenses_count: number
  payments_by_month: Bucket[]
  payments_by_method: Bucket[]
  expenses_by_month: Bucket[]
  expenses_by_category: Bucket[]
}

interface MemberRow {
  id: string
  code: string
  name: string
  phone: string | null
  expiry_date: string | null
  is_active: boolean
}

const emptySummary: ReportSummary = {
  payments_count: 0,
  expenses_count: 0,
  payments_by_month: [],
  payments_by_method: [],
  expenses_by_month: [],
  expenses_by_category: []
}

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'

const MEMBER_COLUMNS = 'id, code, name, phone, expiry_date, is_active'

// Column that holds the member's join date (same meaning as the desktop app).
// If your members table uses another name, change it here only.
const JOIN_COLUMN = 'join_date'

const monthStr = (d: Date) => format(d, 'yyyy-MM')

function monthsBetween(from: string, to: string): string[] {
  const result: string[] = []
  let cur = new Date(`${from}-01T00:00:00`)
  const last = new Date(`${to}-01T00:00:00`)
  while (cur <= last && result.length < 36) {
    result.push(monthStr(cur))
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
  return result
}

// Neutralise values that Excel/Sheets could interpret as formulas.
// Phone numbers such as "+92 300 1234567" are NOT touched.
function safeCell(v: string | number): string {
  if (typeof v === 'number') return String(v)
  const s = String(v)
  const formulaLike = /^[=@\t\r]/.test(s) || /^[+-][^0-9\s()+-]/.test(s)
  return formulaLike ? `'${s}` : s
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${safeCell(v).replace(/"/g, '""')}"`
  const csv = rows.map(r => r.map(escape).join(',')).join('\n')
  // BOM so Excel reads UTF-8 (non-ASCII names) correctly
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface ChartPoint {
  month: string
  revenue: number
  expenses: number
  profit: number
}

function niceCeil(v: number) {
  if (v <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / exp
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nf * exp
}

function compact(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${+(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

// Smooth monotone curve (no overshoot below zero)
function smoothPath(pts: { x: number; y: number }[]): string {
  const n = pts.length
  if (n < 2) return ''
  const dx: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x
    m[i] = (pts[i + 1].y - pts[i].y) / dx[i]
  }
  const t: number[] = new Array(n)
  t[0] = m[0]
  t[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0
      t[i + 1] = 0
    } else {
      const a = t[i] / m[i]
      const b = t[i + 1] / m[i]
      const s = a * a + b * b
      if (s > 9) {
        const tau = 3 / Math.sqrt(s)
        t[i] = tau * a * m[i]
        t[i + 1] = tau * b * m[i]
      }
    }
  }
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C ${pts[i].x + h} ${pts[i].y + t[i] * h}, ${pts[i + 1].x - h} ${
      pts[i + 1].y - t[i + 1] * h
    }, ${pts[i + 1].x} ${pts[i + 1].y}`
  }
  return d
}

const REV_COLOR = '#10b981'
const EXP_COLOR = '#fb7185'

function RevenueChart({ data }: { data: ChartPoint[] }) {
  const { fmt } = useCurrency()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(Math.max(280, el.clientWidth))
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(Math.max(280, w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const height = 300
  const pad = { top: 16, right: 16, bottom: 32, left: 48 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const baseY = pad.top + innerH
  const n = data.length

  const maxVal = niceCeil(Math.max(1, ...data.map(d => Math.max(d.revenue, d.expenses))))
  const ticks = [0, 1, 2, 3, 4].map(i => (maxVal / 4) * i)

  const xAt = (i: number) => (n === 1 ? pad.left + innerW / 2 : pad.left + (innerW * i) / (n - 1))
  const yAt = (v: number) => baseY - (v / maxVal) * innerH

  const revPts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.revenue) }))
  const expPts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.expenses) }))
  const areaOf = (pts: { x: number; y: number }[]) =>
    pts.length < 2
      ? ''
      : `${smoothPath(pts)} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`

  const labelStep = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 64))))

  function onMove(e: ReactPointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const idx = n === 1 ? 0 : Math.round((x / rect.width) * (n - 1))
    setHover(Math.min(n - 1, Math.max(0, idx)))
  }

  const active = hover !== null ? data[hover] : null
  const tipLeft = hover !== null ? Math.min(Math.max(xAt(hover), 84), width - 84) : 0

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg width={width} height={height} role="img" aria-label="Monthly revenue and expenses chart">
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={REV_COLOR} stopOpacity="0.28" />
            <stop offset="100%" stopColor={REV_COLOR} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EXP_COLOR} stopOpacity="0.22" />
            <stop offset="100%" stopColor={EXP_COLOR} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* grid + y labels */}
        {ticks.map(tv => (
          <g key={tv}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={yAt(tv)}
              y2={yAt(tv)}
              stroke="#e5e7eb"
              strokeDasharray={tv === 0 ? undefined : '4 4'}
            />
            <text x={pad.left - 10} y={yAt(tv) + 4} textAnchor="end" fontSize="11" fill="#9ca3af">
              {compact(tv)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {data.map((d, i) =>
          i % labelStep === 0 ? (
            <text
              key={d.month}
              x={xAt(i)}
              y={height - 8}
              textAnchor="middle"
              fontSize="11"
              fill={hover === i ? '#111827' : '#9ca3af'}
              fontWeight={hover === i ? 600 : 400}
            >
              {format(new Date(`${d.month}-01T00:00:00`), 'MMM yy')}
            </text>
          ) : null
        )}

        {/* areas + lines */}
        {n > 1 && (
          <>
            <path d={areaOf(expPts)} fill="url(#expGrad)" />
            <path d={areaOf(revPts)} fill="url(#revGrad)" />
            <path
              d={smoothPath(expPts)}
              fill="none"
              stroke={EXP_COLOR}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d={smoothPath(revPts)}
              fill="none"
              stroke={REV_COLOR}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </>
        )}

        {/* hover guide */}
        {hover !== null && (
          <line
            x1={xAt(hover)}
            x2={xAt(hover)}
            y1={pad.top}
            y2={baseY}
            stroke="#94a3b8"
            strokeDasharray="4 4"
          />
        )}

        {/* dots: always for a single month, on hover otherwise */}
        {(n === 1 || hover !== null) &&
          [
            { pts: expPts, color: EXP_COLOR },
            { pts: revPts, color: REV_COLOR }
          ].map(({ pts, color }) => {
            const i = hover ?? 0
            return (
              <circle
                key={color}
                cx={pts[i].x}
                cy={pts[i].y}
                r="5"
                fill="#fff"
                stroke={color}
                strokeWidth="2.5"
              />
            )
          })}

        {/* interaction layer */}
        <rect
          x={pad.left}
          y={pad.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          style={{ touchAction: 'pan-y' }}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs shadow-xl"
          style={{ left: tipLeft }}
        >
          <p className="mb-1.5 font-semibold text-gray-900">
            {format(new Date(`${active.month}-01T00:00:00`), 'MMMM yyyy')}
          </p>
          <div className="space-y-1">
            <p className="flex items-center justify-between gap-4 text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: REV_COLOR }} />
                Revenue
              </span>
              <span className="font-medium text-gray-900">{fmt(active.revenue)}</span>
            </p>
            <p className="flex items-center justify-between gap-4 text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: EXP_COLOR }} />
                Expenses
              </span>
              <span className="font-medium text-gray-900">{fmt(active.expenses)}</span>
            </p>
            <p className="flex items-center justify-between gap-4 border-t border-gray-100 pt-1 text-gray-600">
              <span>Profit</span>
              <span
                className={`font-semibold ${active.profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}
              >
                {fmt(active.profit)}
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReportsPage() {
  const { fmt } = useCurrency()
  const [gymId, setGymId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pakistan-local months, not the device clock
  const [fromMonth, setFromMonth] = useState(pkAddMonths(pkMonth(), -5))
  const [toMonth, setToMonth] = useState(pkMonth())

  const [summary, setSummary] = useState<ReportSummary>(emptySummary)
  const [newMembersCount, setNewMembersCount] = useState(0)
  const [visitCount, setVisitCount] = useState(0)
  const [expiring, setExpiring] = useState<MemberRow[]>([])

  const requestIdRef = useRef(0)

  const currentMonth = pkMonth()
  const rangeValid =
    fromMonth !== '' && toMonth !== '' && fromMonth <= toMonth && toMonth <= currentMonth

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
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('gym_id')
        .eq('id', user.id)
        .single()

      if (userError || !userData?.gym_id) {
        setError('No gym is linked to your account.')
        return
      }
      setGymId(userData.gym_id as string)
    } catch (err) {
      const message = err instanceof Error ? err.message : JSON.stringify(err)
      console.error('Error loading reports page:', message)
      setError('Could not load the page. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadReport = useCallback(
    async (gid: string, from: string, to: string, silent = false) => {
      const requestId = ++requestIdRef.current
      if (!silent) {
        setDataLoading(true)
        setError(null)
      }

      try {
        // All boundaries are Pakistan time (UTC+5)
        const startDate = `${from}-01`
        const endDate = pkMonthEnd(to)
        const startIso = pkDayStartISO(startDate)
        // First instant of the day AFTER the range (exclusive upper bound)
        const endIso = pkDayStartISO(pkAddDays(endDate, 1))
        const todayStr = pkToday()
        const in7Days = pkAddDays(todayStr, 7)

        const [sumRes, memRes, visitRes, expiredRes, soonRes] = await Promise.all([
          // Totals are calculated inside SQL: no 1000-row limit
          supabase.rpc('report_summary', {
            p_gym_id: gid,
            p_from_ts: startIso,
            p_to_ts: endIso,
            p_from_date: startDate,
            p_to_date: endDate
          }),
          // New members = members who JOINED in the period (same as the desktop app)
          supabase
            .from('members')
            .select('id', { count: 'exact', head: true })
            .eq('gym_id', gid)
            .is('deleted_at', null)
            .gte(JOIN_COLUMN, startDate)
            .lte(JOIN_COLUMN, endDate),
          supabase
            .from('attendance')
            .select('id', { count: 'exact', head: true })
            .eq('gym_id', gid)
            .is('deleted_at', null)
            .gte('check_in', startIso)
            .lt('check_in', endIso),
          // Already expired (most recently expired first)
          supabase
            .from('members')
            .select(MEMBER_COLUMNS)
            .eq('gym_id', gid)
            .is('deleted_at', null)
            .eq('is_active', true)
            .not('expiry_date', 'is', null)
            .lt('expiry_date', todayStr)
            .order('expiry_date', { ascending: false })
            .limit(100),
          // Expiring within the next 7 days (today included)
          supabase
            .from('members')
            .select(MEMBER_COLUMNS)
            .eq('gym_id', gid)
            .is('deleted_at', null)
            .eq('is_active', true)
            .gte('expiry_date', todayStr)
            .lte('expiry_date', in7Days)
            .order('expiry_date', { ascending: true })
            .limit(100)
        ])

        const labeled = [
          ['totals (run phase3-aggregates.sql)', sumRes],
          ['new members', memRes],
          ['attendance', visitRes],
          ['expired members', expiredRes],
          ['expiring members', soonRes]
        ] as const

        for (const [name, res] of labeled) {
          if (res.error) {
            throw new Error(`[${name}] ${res.error.message} (code: ${res.error.code})`)
          }
        }
        if (requestId !== requestIdRef.current) return

        const soon = (soonRes.data as MemberRow[]) || []
        const expired = (expiredRes.data as MemberRow[]) || []

        setSummary({ ...emptySummary, ...((sumRes.data as Partial<ReportSummary>) || {}) })
        setNewMembersCount(memRes.count || 0)
        setVisitCount(visitRes.count || 0)
        // Soonest first: expiring soon, then the expired ones
        setExpiring([...soon, ...expired])
      } catch (err) {
        if (requestId !== requestIdRef.current) return
        const message = err instanceof Error ? err.message : JSON.stringify(err)
        console.error('Error loading report:', message)
        if (!silent) setError(`Could not load the report. ${message}`)
      } finally {
        if (requestId === requestIdRef.current) setDataLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void init()
  }, [init])

  useEffect(() => {
    if (!gymId || !rangeValid) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReport(gymId, fromMonth, toMonth)
  }, [gymId, fromMonth, toMonth, rangeValid, loadReport])

  useLiveRefresh(
    () => {
      if (gymId && rangeValid) void loadReport(gymId, fromMonth, toMonth, true)
    },
    { gymId, tables: ['payments', 'expenses', 'members', 'attendance'], enabled: rangeValid }
  )

  const totals = useMemo(() => {
    const revenue = summary.payments_by_month.reduce((s, b) => s + Number(b.total), 0)
    const spent = summary.expenses_by_month.reduce((s, b) => s + Number(b.total), 0)
    return { revenue, spent, profit: revenue - spent }
  }, [summary])

  const monthly = useMemo(() => {
    if (!rangeValid) return []
    const map = new Map<string, { revenue: number; expenses: number }>()
    monthsBetween(fromMonth, toMonth).forEach(m => map.set(m, { revenue: 0, expenses: 0 }))
    summary.payments_by_month.forEach(b => {
      const row = map.get(b.key)
      if (row) row.revenue += Number(b.total)
    })
    summary.expenses_by_month.forEach(b => {
      const row = map.get(b.key)
      if (row) row.expenses += Number(b.total)
    })
    return Array.from(map.entries()).map(([month, v]) => ({
      month,
      ...v,
      profit: v.revenue - v.expenses
    }))
  }, [summary, fromMonth, toMonth, rangeValid])

  const expenseBreakdown = useMemo(
    () => summary.expenses_by_category.map(b => [b.key, Number(b.total)] as [string, number]),
    [summary]
  )

  const methodBreakdown = useMemo(
    () => summary.payments_by_method.map(b => [b.key, Number(b.total)] as [string, number]),
    [summary]
  )

  const today = pkToday()

  function exportMonthly() {
    downloadCsv(`report-${fromMonth}-to-${toMonth}.csv`, [
      ['Month', 'Revenue', 'Expenses', 'Profit'],
      ...monthly.map(m => [m.month, m.revenue, m.expenses, m.profit]),
      ['Total', totals.revenue, totals.spent, totals.profit]
    ])
  }

  function exportExpiring() {
    downloadCsv(`expiring-members-${today}.csv`, [
      ['Code', 'Name', 'Phone', 'Expiry date', 'Status'],
      ...expiring.map(m => [
        m.code,
        m.name,
        m.phone || '',
        m.expiry_date || '',
        (m.expiry_date || '') < today ? 'Expired' : 'Expiring soon'
      ])
    ])
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 w-24 rounded bg-gray-200"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 w-20 rounded bg-gray-200"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // init failed (not logged in / no gym): show only the error, not empty zero cards
  if (!gymId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error || 'Could not load the page.'}</span>
        </div>
        <Button variant="outline" onClick={() => { setLoading(true); void init() }}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    )
  }

  const statCards = [
    {
      title: 'Revenue',
      value: fmt(totals.revenue),
      subtitle: `${summary.payments_count} payments`,
      icon: Wallet,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: 'Expenses',
      value: fmt(totals.spent),
      subtitle: `${summary.expenses_count} entries`,
      icon: Receipt,
      color: 'text-red-600',
      bgColor: 'bg-red-50'
    },
    {
      title: 'Net Profit',
      value: fmt(totals.profit),
      subtitle: 'Revenue minus expenses',
      icon: TrendingUp,
      color: totals.profit >= 0 ? 'text-blue-600' : 'text-red-600',
      bgColor: totals.profit >= 0 ? 'bg-blue-50' : 'bg-red-50'
    },
    {
      title: 'New Members',
      value: String(newMembersCount),
      subtitle: `${visitCount} visits in this period`,
      icon: UserPlus,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    }
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={fromMonth}
            max={toMonth || undefined}
            onChange={e => setFromMonth(e.target.value)}
            className={`${inputClass} w-40`}
            aria-label="From month"
          />
          <span className="text-sm text-gray-500">to</span>
          <input
            type="month"
            value={toMonth}
            min={fromMonth || undefined}
            max={currentMonth}
            onChange={e => setToMonth(e.target.value)}
            className={`${inputClass} w-40`}
            aria-label="To month"
          />
          <Button
            variant="outline"
            onClick={() => gymId && rangeValid && loadReport(gymId, fromMonth, toMonth)}
            disabled={!gymId || !rangeValid || dataLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${dataLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!rangeValid && (
        <div className="rounded-lg border border-orange-100 bg-orange-50 p-3 text-sm text-orange-800">
          Please choose a valid month range (the start month must not be after the end month, and
          the end month cannot be in the future).
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map(stat => (
          <Card key={stat.title} className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{stat.title}</CardTitle>
              <div className={`rounded-lg p-2 ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`mb-1 text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <p className="text-xs text-gray-500">{stat.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly revenue vs expenses */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              Monthly Revenue vs Expenses
            </CardTitle>
            <Button variant="outline" onClick={exportMonthly} disabled={monthly.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"></span> Revenue
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-400"></span> Expenses
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {monthly.length === 0 ? (
            <p className="py-8 text-center text-gray-500">No data for this period.</p>
          ) : (
            <div className="space-y-6">
              <RevenueChart data={monthly} />

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                      <th className="px-3 py-3 font-medium">Month</th>
                      <th className="px-3 py-3 font-medium">Revenue</th>
                      <th className="px-3 py-3 font-medium">Expenses</th>
                      <th className="px-3 py-3 font-medium">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map(m => (
                      <tr key={m.month} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-3 font-medium text-gray-900">
                          {format(new Date(`${m.month}-01T00:00:00`), 'MMMM yyyy')}
                        </td>
                        <td className="px-3 py-3 text-green-600">{fmt(m.revenue)}</td>
                        <td className="px-3 py-3 text-red-600">{fmt(m.expenses)}</td>
                        <td
                          className={`px-3 py-3 font-semibold ${
                            m.profit >= 0 ? 'text-blue-600' : 'text-red-600'
                          }`}
                        >
                          {fmt(m.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Expense breakdown */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-red-600" />
              Expenses by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expenseBreakdown.length === 0 ? (
              <p className="py-6 text-center text-gray-500">No expenses in this period.</p>
            ) : (
              <div className="space-y-3">
                {expenseBreakdown.map(([category, total]) => (
                  <div key={category}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-gray-900">{category}</span>
                      <span className="text-gray-700">
                        {fmt(total)}{' '}
                        <span className="text-xs text-gray-500">
                          ({totals.spent > 0 ? Math.round((total / totals.spent) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-red-400"
                        style={{ width: `${totals.spent > 0 ? (total / totals.spent) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment methods */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-green-600" />
              Revenue by Payment Method
            </CardTitle>
          </CardHeader>
          <CardContent>
            {methodBreakdown.length === 0 ? (
              <p className="py-6 text-center text-gray-500">No payments in this period.</p>
            ) : (
              <div className="space-y-3">
                {methodBreakdown.map(([method, total]) => (
                  <div key={method}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium capitalize text-gray-900">{method}</span>
                      <span className="text-gray-700">
                        {fmt(total)}{' '}
                        <span className="text-xs text-gray-500">
                          ({totals.revenue > 0 ? Math.round((total / totals.revenue) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-green-500"
                        style={{
                          width: `${totals.revenue > 0 ? (total / totals.revenue) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expiring / expired members */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-600" />
              Expired &amp; Expiring Soon ({expiring.length})
            </CardTitle>
            <Button variant="outline" onClick={exportExpiring} disabled={expiring.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Active members whose membership ends within the next 7 days, plus the 100 most
            recently expired.
          </p>
        </CardHeader>
        <CardContent>
          {expiring.length === 0 ? (
            <p className="py-6 text-center text-gray-500">No memberships need attention.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                    <th className="px-3 py-3 font-medium">Member</th>
                    <th className="px-3 py-3 font-medium">Phone</th>
                    <th className="px-3 py-3 font-medium">Expiry</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {expiring.map(m => {
                    const expired = (m.expiry_date || '') < today
                    return (
                      <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-3">
                          <p className="font-medium text-gray-900">{m.name}</p>
                          <p className="text-xs text-gray-500">{m.code}</p>
                        </td>
                        <td className="px-3 py-3 text-gray-700">{m.phone || '-'}</td>
                        <td className="px-3 py-3 text-gray-700">
                          {m.expiry_date ? formatDate(m.expiry_date) : '-'}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                              expired
                                ? 'border-orange-100 bg-orange-50 text-orange-700'
                                : 'border-blue-100 bg-blue-50 text-blue-700'
                            }`}
                          >
                            {expired ? 'Expired' : 'Expiring soon'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}