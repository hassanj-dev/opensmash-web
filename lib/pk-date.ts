const PK_TZ = 'Asia/Karachi'

// en-CA formats as yyyy-MM-dd
const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: PK_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's date in Pakistan, e.g. "2026-10-23" */
export const pkToday = (now: Date = new Date()) => dayFmt.format(now)

/** First day of the current Pakistan month, e.g. "2026-10-01" */
export const pkMonthStart = (now: Date = new Date()) => pkToday(now).slice(0, 7) + '-01'

/** Add days to a yyyy-MM-dd string (pure calendar math, no timezone drift) */
export function pkAddDays(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** UTC ISO instant for 00:00 Pakistan time on that date. Use for timestamptz columns. */
export const pkDayStartISO = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00+05:00`).toISOString()

/** Current month in Pakistan, e.g. "2026-10" */
export const pkMonth = (now: Date = new Date()) => pkToday(now).slice(0, 7)

/** Add months to a yyyy-MM string (pure calendar math) */
export function pkAddMonths(month: string, n: number) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}

/** Last calendar day of a yyyy-MM month, as yyyy-MM-dd */
export const pkMonthEnd = (month: string) => pkAddDays(`${pkAddMonths(month, 1)}-01`, -1)