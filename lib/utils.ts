import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

const PK_TZ = 'Asia/Karachi'
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

// A member is "Expiring" when the membership ends today or within this many days.
// 1 = today or tomorrow. (Desktop app must use the same number: '+1 days' in MembersPage.cs.)
export const EXPIRING_DAYS = 1

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pkDateFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: PK_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

// 'YYYY-MM-DD' of the given moment in Pakistan time
function pkDateString(d: Date): string {
  const parts: Record<string, string> = {}
  for (const p of pkDateFmt.formatToParts(d)) parts[p.type] = p.value
  return `${parts.year}-${parts.month}-${parts.day}`
}

// 'YYYY-MM-DD' -> '31 Oct 2026' (pure string maths, no timezone shift)
function friendlyDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d || m < 1 || m > 12) return ymd
  return `${d} ${MONTHS[m - 1]} ${y}`
}

// Today in Pakistan time as 'YYYY-MM-DD' (not the device clock's zone)
export function karachiToday(): string {
  return pkDateString(new Date())
}

// 'YYYY-MM-DD' + days -> 'YYYY-MM-DD' (pure calendar maths, no timezone)
function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// `currency` is the gym's own label (gyms.currency): 'Rs', 'PKR', '$' ... An empty value falls back to 'Rs'.
export function formatCurrency(amount: number, currency: string | null | undefined = 'Rs'): string {
  const label = (currency ?? '').trim() || 'Rs'
  return `${label} ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

// Friendly date for people: '31 Oct 2026'.
// Date-only columns (expiry_date, join_date, spent_on) keep their calendar day as it is.
// Timestamps (paid_at, check_in, created_at) are shown as the Pakistan calendar date.
// Note: for <input type="date"> values keep using the raw 'YYYY-MM-DD' string, not this function.
export function formatDate(date: string | Date): string {
  if (!date) return ''
  if (typeof date === 'string' && DATE_ONLY.test(date)) return friendlyDate(date)
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  return friendlyDate(pkDateString(d))
}

export function formatDateTime(date: string | Date): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    timeZone: PK_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Same rule as the members page and the desktop app:
// the expiry day itself is still valid, the day after is expired.
export function isExpired(expiryDate?: string | null): boolean {
  if (!expiryDate) return true
  return expiryDate.slice(0, 10) < karachiToday()
}

export function isExpiringSoon(expiryDate?: string | null, days: number = EXPIRING_DAYS): boolean {
  if (!expiryDate) return false
  const e = expiryDate.slice(0, 10)
  const today = karachiToday()
  return e >= today && e <= addDaysStr(today, days)
}

// For the "Expiring" badge: says WHEN it ends ('today' / 'tomorrow'), or null if not expiring soon.
export function expiryDayLabel(expiryDate?: string | null): 'today' | 'tomorrow' | null {
  if (!expiryDate) return null
  const e = expiryDate.slice(0, 10)
  const today = karachiToday()
  if (e === today) return 'today'
  if (e === addDaysStr(today, 1)) return 'tomorrow'
  return null
}

// Whole days from today (Pakistan) to the expiry day:
// 0 = ends today, 1 = ends tomorrow, negative = already expired. null = no expiry date.
export function daysUntilExpiry(expiryDate?: string | null): number | null {
  if (!expiryDate) return null
  const [y, m, d] = expiryDate.slice(0, 10).split('-').map(Number)
  const [ty, tm, td] = karachiToday().split('-').map(Number)
  if (!y || !m || !d) return null
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000)
}

// Text for the "date difference". The expiry day itself still counts as a day left:
// membership ends 31 Oct -> 29 Oct '3 days left', 30 Oct '2 days left', 31 Oct '1 day left', 1 Nov 'Expired 1 day ago'.
export function daysLeftText(expiryDate?: string | null): string | null {
  const n = daysUntilExpiry(expiryDate)
  if (n === null) return null
  if (n < 0) return `Expired ${-n} day${-n === 1 ? '' : 's'} ago`
  const left = n + 1
  return left === 1 ? '1 day left' : `${left} days left`
}

export function getMemberStatus(expiryDate?: string | null): 'active' | 'expiring' | 'expired' {
  if (!expiryDate || isExpired(expiryDate)) return 'expired'
  if (isExpiringSoon(expiryDate)) return 'expiring'
  return 'active'
}

// Month-end safe: 31 Jan + 1 month = 28/29 Feb (not 3 Mar)
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  const day = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + months)
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(day, lastDay))
  return result
}

export function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'active':
      return 'text-green-600 bg-green-50 border-green-200'
    case 'expiring':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    case 'expired':
      return 'text-red-600 bg-red-50 border-red-200'
    case 'suspended':
      return 'text-red-600 bg-red-50 border-red-200'
    case 'pending':
      return 'text-blue-600 bg-blue-50 border-blue-200'
    case 'inactive':
      return 'text-gray-600 bg-gray-50 border-gray-200'
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}