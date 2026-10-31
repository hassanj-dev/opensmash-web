'use client'
import { useLiveRefresh, keepIfSame } from '@/lib/auto-refresh'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import {
  Calendar,
  Clock,
  Search,
  Trash2,
  UserCheck,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { formatDate, formatDateTime, isExpiringSoon, daysLeftText } from '@/lib/utils'
import { pkToday, pkAddDays, pkDayStartISO } from '@/lib/pk-date'
import { logAudit } from '@/lib/audit'

interface MemberOption {
  id: string
  code: string
  name: string
  phone: string | null
  expiry_date: string | null
  is_active: boolean
  deleted_at: string | null
}

interface AttendanceRow {
  id: string
  member_id: string
  check_in: string
  check_out: string | null
}

type MemberStatus = 'Active' | 'Expired' | 'Inactive'

const PAGE_SIZE = 1000 // Supabase "Max rows" is 1000, so everything is read in pages
const MESSAGE_TIMEOUT_MS = 3000 // success / error notices disappear after 3 seconds
const DELETE_CHUNK = 100 // ids per delete request, keeps the URL short

// Pakistan-local date, not the device clock
const todayStr = () => pkToday()

// Clock time in Pakistan, whatever the device timezone is
const pkTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Karachi',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
})
const pkTime = (iso: string) => pkTimeFmt.format(new Date(iso))

// `asOf` = the day the status is judged on (today by default).
// For an old day in the visits table, a membership that ended AFTER that day was still valid then.
function getStatus(member: MemberOption, asOf: string = todayStr()): MemberStatus {
  if (!member.is_active || member.deleted_at) return 'Inactive'
  if (!member.expiry_date || member.expiry_date < asOf) return 'Expired'
  return 'Active'
}

const statusStyles: Record<MemberStatus, string> = {
  Active: 'bg-green-50 text-green-700 border-green-100',
  Expired: 'bg-orange-50 text-orange-700 border-orange-100',
  Inactive: 'bg-gray-100 text-gray-600 border-gray-200'
}

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'

// Includes removed members too: old visits must still show the member's name
async function fetchAllMembers(gymId: string): Promise<MemberOption[]> {
  const all: MemberOption[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('members')
      .select('id, code, name, phone, expiry_date, is_active, deleted_at')
      .eq('gym_id', gymId)
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data as MemberOption[]) || []
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  return all
}

async function fetchDayVisits(gymId: string, date: string): Promise<AttendanceRow[]> {
  // Pakistan-day boundaries (00:00 to 00:00 UTC+5)
  const startIso = pkDayStartISO(date)
  const endIso = pkDayStartISO(pkAddDays(date, 1))
  const all: AttendanceRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('attendance')
      .select('id, member_id, check_in, check_out')
      .eq('gym_id', gymId)
      .is('deleted_at', null)
      .gte('check_in', startIso)
      .lt('check_in', endIso)
      .order('check_in', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data as AttendanceRow[]) || []
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  return all
}

export default function AttendancePage() {
  const [gymId, setGymId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Page could not start at all (not logged in / no gym). Stays on screen, does NOT vanish after 3 seconds.
  const [initError, setInitError] = useState<string | null>(null)

  const [dateFilter, setDateFilter] = useState(todayStr())

  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkInError, setCheckInError] = useState<string | null>(null)
  const [checkInMessage, setCheckInMessage] = useState<string | null>(null)

  // Delete (single or many): ids waiting for confirmation
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Bulk selection + pagination of the visits table
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Used to ignore results from outdated attendance requests
  const requestIdRef = useRef(0)

  const isToday = dateFilter === todayStr()
  // RLS: only owner / manager can delete visit records
  const canDelete = role === 'gym_owner' || role === 'manager'

  const loadAttendance = useCallback(async (gid: string, date: string, silent = false) => {
    const requestId = ++requestIdRef.current
    if (!silent) {
      setListLoading(true)
      setError(null)
    }
    try {
      const data = await fetchDayVisits(gid, date)
      if (requestId !== requestIdRef.current) return // a newer request is in flight
      setRows(prev => keepIfSame(prev, data))
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      console.error('Error loading attendance:', err)
      if (!silent) setError('Could not load attendance. Please try again.')
    } finally {
      if (requestId === requestIdRef.current) setListLoading(false)
    }
  }, [])

  const init = useCallback(async () => {
    setInitError(null)
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) {
        setInitError('You are not logged in. Please log in again.')
        return
      }
      setUserId(user.id)

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('gym_id, role')
        .eq('id', user.id)
        .single()

      if (userError || !userData?.gym_id) {
        setInitError('No gym is linked to your account.')
        return
      }

      const currentGymId = userData.gym_id as string
      const memberRows = await fetchAllMembers(currentGymId)

      setMembers(memberRows)
      setRole((userData.role as string) || null)
      setGymId(currentGymId)
    } catch (err) {
      console.error('Error loading attendance page:', err)
      setInitError('Could not load the page. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void init()
  }, [init])

  useEffect(() => {
    if (!gymId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAttendance(gymId, dateFilter)
  }, [gymId, dateFilter, loadAttendance])

  // New day selected: back to page 1 and clear any selection
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
    setSelectedIds(new Set())
  }, [dateFilter])

  // Success / error notices vanish after 3 seconds
  useEffect(() => {
    if (!checkInMessage) return
    const t = setTimeout(() => setCheckInMessage(null), MESSAGE_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [checkInMessage])

  useEffect(() => {
    if (!checkInError) return
    const t = setTimeout(() => setCheckInError(null), MESSAGE_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [checkInError])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), MESSAGE_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [error])

  // Quiet refresh: desktop check-ins and new members appear without a reload
  const refreshMembers = useCallback(async () => {
    if (!gymId) return
    try {
      const next = await fetchAllMembers(gymId)
      setMembers(prev => keepIfSame(prev, next))
    } catch (err) {
      console.error('Error refreshing members:', err)
    }
  }, [gymId])

  useLiveRefresh(
    () => {
      if (gymId) void loadAttendance(gymId, dateFilter, true)
      void refreshMembers()
    },
    { gymId, tables: ['attendance', 'members'], enabled: !deleteIds }
  )

  const memberMap = useMemo(() => {
    const map = new Map<string, MemberOption>()
    members.forEach(m => map.set(m.id, m))
    return map
  }, [members])

  // Removed members cannot be picked for attendance
  const suggestions = useMemo(() => {
    const q = memberSearch.trim().toLowerCase()
    if (!q || selectedMember) return []
    return members
      .filter(
        m =>
          !m.deleted_at &&
          (m.name.toLowerCase().includes(q) ||
            m.code.toLowerCase().includes(q) ||
            (m.phone || '').toLowerCase().includes(q))
      )
      .slice(0, 6)
  }, [members, memberSearch, selectedMember])

  // Judged on the selected day, so an old day does not count members who expired later
  const stats = useMemo(() => {
    const notActive = rows.filter(r => {
      const m = memberMap.get(r.member_id)
      return m ? getStatus(m, dateFilter) !== 'Active' : false
    }).length
    return { visits: rows.length, notActive }
  }, [rows, memberMap, dateFilter])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pagedRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize]
  )
  const allPageSelected = pagedRows.length > 0 && pagedRows.every(r => selectedIds.has(r.id))
  const selectedCount = useMemo(
    () => rows.reduce((n, r) => (selectedIds.has(r.id) ? n + 1 : n), 0),
    [rows, selectedIds]
  )

  function togglePageSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allPageSelected) pagedRows.forEach(r => next.delete(r.id))
      else pagedRows.forEach(r => next.add(r.id))
      return next
    })
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedStatus = selectedMember ? getStatus(selectedMember) : null
  // Active, but ends today or tomorrow: allowed in, but staff should ask for a renewal
  const selectedExpiring =
    selectedMember && selectedStatus === 'Active' && isExpiringSoon(selectedMember.expiry_date)

  function pickMember(member: MemberOption) {
    setSelectedMember(member)
    setMemberSearch(`${member.name} (${member.code})`)
    setCheckInError(null)
    setCheckInMessage(null)
  }

  function clearMember() {
    setSelectedMember(null)
    setMemberSearch('')
    setCheckInError(null)
  }

  async function handleCheckIn() {
    if (!gymId || !selectedMember || checkingIn) return

    // Same rule as the desktop app: only an Active membership can be marked present
    if (selectedStatus === 'Inactive') {
      setCheckInError('This member is Inactive. Activate them from the Members page first.')
      return
    }
    if (selectedStatus === 'Expired') {
      setCheckInError(
        `${selectedMember.name}'s membership has expired. Renew it from the Members page first.`
      )
      return
    }

    setCheckingIn(true)
    setCheckInError(null)
    setCheckInMessage(null)

    try {
      // Is this member already present today (Pakistan day)? One record per member per day.
      const startOfToday = pkDayStartISO(todayStr())
      const startOfTomorrow = pkDayStartISO(pkAddDays(todayStr(), 1))
      const { data: todayRows, error: todayError } = await supabase
        .from('attendance')
        .select('id')
        .eq('gym_id', gymId)
        .eq('member_id', selectedMember.id)
        .gte('check_in', startOfToday)
        .lt('check_in', startOfTomorrow)
        .is('deleted_at', null)
        .limit(1)

      if (todayError) throw todayError
      if (todayRows && todayRows.length > 0) {
        setCheckInError(`${selectedMember.name} is already marked present today.`)
        return
      }

      const { error: insertError } = await supabase.from('attendance').insert({
        gym_id: gymId,
        member_id: selectedMember.id,
        check_in: new Date().toISOString()
      })
      if (insertError) {
        // Unique index (one record per member per day): another device was faster
        if ((insertError as { code?: string }).code === '23505') {
          setCheckInError(`${selectedMember.name} is already marked present today (on another device).`)
          return
        }
        throw insertError
      }

      setCheckInMessage(`${selectedMember.name} has been marked present for today.`)
      clearMember()
      if (dateFilter !== todayStr()) {
        setDateFilter(todayStr())
      } else {
        await loadAttendance(gymId, dateFilter)
      }
    } catch (err) {
      console.error('Error marking present:', err)
      setCheckInError('Could not mark present. Please try again.')
    } finally {
      setCheckingIn(false)
    }
  }

  // Enter key (like the desktop app): pick the first suggestion, then mark present
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (selectedMember) {
      if (selectedStatus === 'Active') void handleCheckIn()
    } else if (suggestions.length > 0) {
      pickMember(suggestions[0])
    }
  }

  async function handleDelete() {
    if (!gymId || !userId || !deleteIds || deleteIds.length === 0) return
    setDeleting(true)
    setError(null)

    // Soft delete: the desktop app learns about it through deleted_at
    const deleted: string[] = []
    let failed = false
    for (let i = 0; i < deleteIds.length; i += DELETE_CHUNK) {
      const chunk = deleteIds.slice(i, i + DELETE_CHUNK)
      const { data, error: deleteError } = await supabase
        .from('attendance')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', chunk)
        .eq('gym_id', gymId)
        .is('deleted_at', null)
        .select('id')
      if (deleteError) {
        console.error('Error deleting attendance:', deleteError)
        failed = true
        break
      }
      deleted.push(...((data || []) as { id: string }[]).map(d => d.id))
    }

    if (deleted.length > 0) {
      const gone = new Set(deleted)
      setRows(prev => prev.filter(r => !gone.has(r.id)))
      setSelectedIds(prev => {
        const next = new Set(prev)
        gone.forEach(id => next.delete(id))
        return next
      })
      void logAudit(gymId, userId, 'attendance_deleted', {
        count: deleted.length,
        attendance_ids: deleted
      })
    }

    if (failed) {
      setError('Some records could not be deleted. Please try again.')
    } else if (deleted.length === 0) {
      setError('The record was not deleted. Only an owner or manager can delete visits.')
    }

    setDeleting(false)
    setDeleteIds(null)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Attendance</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-24"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-16"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (initError) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Attendance</h1>
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{initError}</span>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setLoading(true)
            void init()
          }}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Try again
        </Button>
      </div>
    )
  }

  const statCards = [
    {
      title: isToday ? 'Present Today' : 'Present',
      value: stats.visits,
      subtitle: format(new Date(`${dateFilter}T00:00:00`), 'dd MMM yyyy'),
      icon: Calendar,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: 'Expired / Inactive',
      value: stats.notActive,
      subtitle: 'Members whose membership is not active',
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Attendance</h1>
        <Button
          variant="outline"
          onClick={() => gymId && loadAttendance(gymId, dateFilter)}
          disabled={!gymId || listLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${listLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {statCards.map(stat => (
          <Card key={stat.title} className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{stat.title}</CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${stat.color} mb-1`}>{stat.value}</div>
              <p className="text-xs text-gray-500">{stat.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Mark-present panel */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-blue-600" />
            Mark Present
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={memberSearch}
                onChange={e => {
                  setMemberSearch(e.target.value)
                  setSelectedMember(null)
                  setCheckInError(null)
                  setCheckInMessage(null)
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Enter member name, code or phone"
                className={`${inputClass} pl-9`}
              />
              {suggestions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  {suggestions.map(m => {
                    const status = getStatus(m)
                    const soon = status === 'Active' && isExpiringSoon(m.expiry_date)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => pickMember(m)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <span>
                          <span className="font-medium text-gray-900">{m.name}</span>{' '}
                          <span className="text-xs text-gray-500">
                            {m.code}
                            {m.phone ? ` · ${m.phone}` : ''}
                          </span>
                        </span>
                        {soon ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {daysLeftText(m.expiry_date)}
                          </span>
                        ) : (
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyles[status]}`}
                          >
                            {status}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
              {memberSearch.trim() && !selectedMember && suggestions.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">No member found.</p>
              )}
            </div>
            <Button
              onClick={handleCheckIn}
              disabled={!selectedMember || checkingIn || selectedStatus !== 'Active'}
            >
              <UserCheck className="w-4 h-4 mr-2" />
              {checkingIn ? 'Please wait...' : 'Mark Present'}
            </Button>
          </div>

          {selectedMember && selectedExpiring && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <Clock className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {selectedMember.name}: {daysLeftText(selectedMember.expiry_date)}. The membership ends on{' '}
                {formatDate(selectedMember.expiry_date!)}. You can mark present, but remind them to renew.
              </span>
            </div>
          )}
          {selectedMember && selectedStatus === 'Expired' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-orange-100 bg-orange-50 p-3 text-sm text-orange-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {selectedMember.name}&apos;s membership has expired
                {selectedMember.expiry_date ? ` (${formatDate(selectedMember.expiry_date)})` : ''}. Marking
                present is blocked. Use the Renew button on the Members page first.
              </span>
            </div>
          )}
          {selectedMember && selectedStatus === 'Inactive' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                This member is Inactive. Activate them from the Members page before marking them present.
              </span>
            </div>
          )}
          {checkInError && (
            <div className="mt-3 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              {checkInError}
            </div>
          )}
          {checkInMessage && (
            <div className="mt-3 rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-700">
              {checkInMessage}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visits table */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-green-600" />
              Visits ({rows.length})
            </CardTitle>
            <div className="flex gap-2 sm:w-64">
              <input
                type="date"
                value={dateFilter}
                max={todayStr()}
                onChange={e => e.target.value && setDateFilter(e.target.value)}
                className={inputClass}
                aria-label="Date filter"
              />
              {!isToday && (
                <button
                  type="button"
                  onClick={() => setDateFilter(todayStr())}
                  className="rounded-lg border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Today
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Bulk action bar */}
          {canDelete && selectedCount > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm">
              <span className="text-blue-800">
                {selectedCount} selected
                {allPageSelected && selectedCount < rows.length && (
                  <button
                    type="button"
                    className="ml-3 underline"
                    onClick={() => setSelectedIds(new Set(rows.map(r => r.id)))}
                  >
                    Select all {rows.length} records
                  </button>
                )}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-gray-600 hover:bg-gray-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteIds(rows.filter(r => selectedIds.has(r.id)).map(r => r.id))}
                  className="rounded-lg bg-red-600 px-3 py-1 font-medium text-white hover:bg-red-700"
                >
                  Delete selected ({selectedCount})
                </button>
              </div>
            </div>
          )}

          {listLoading && rows.length === 0 ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg"></div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              {isToday ? 'Nobody has been marked present yet today.' : 'No attendance records for this day.'}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                      {canDelete && (
                        <th className="w-10 px-3 py-3">
                          <input
                            type="checkbox"
                            checked={allPageSelected}
                            onChange={togglePageSelectAll}
                            aria-label="Select all on this page"
                          />
                        </th>
                      )}
                      <th className="px-3 py-3 font-medium">Member</th>
                      <th className="px-3 py-3 font-medium">Time</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      {canDelete && <th className="px-3 py-3 font-medium text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map(row => {
                      const member = memberMap.get(row.member_id)
                      const status = member ? getStatus(member, dateFilter) : null
                      return (
                        <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                          {canDelete && (
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(row.id)}
                                onChange={() => toggleOne(row.id)}
                                aria-label="Select row"
                              />
                            </td>
                          )}
                          <td className="px-3 py-3">
                            <p className="font-medium text-gray-900">{member?.name || 'Unknown'}</p>
                            <p className="text-xs text-gray-500">
                              {member?.code || '-'}
                              {member?.deleted_at
                                ? ' · removed'
                                : status && status !== 'Active'
                                  ? ` · ${status}`
                                  : ''}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-gray-700">{pkTime(row.check_in)}</td>
                          <td className="px-3 py-3">
                            <span className="inline-block rounded-full border border-green-100 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                              Present
                            </span>
                          </td>
                          {canDelete && (
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setDeleteIds([row.id])}
                                  title="Delete"
                                  aria-label="Delete visit"
                                  className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-4 flex flex-col gap-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, rows.length)} of{' '}
                  {rows.length}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value))
                      setPage(1)
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1.5"
                    aria-label="Rows per page"
                  >
                    {[10, 20, 50, 100].map(n => (
                      <option key={n} value={n}>
                        {n} / page
                      </option>
                    ))}
                  </select>
                  <Button variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                    Prev
                  </Button>
                  <span>
                    Page {safePage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete confirm modal */}
      {deleteIds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-bold text-gray-900">
                {deleteIds.length > 1 ? `Delete ${deleteIds.length} visit records?` : 'Delete visit record?'}
              </h2>
            </div>
            <p className="text-sm text-gray-700">
              {deleteIds.length === 1 ? (
                (() => {
                  const target = rows.find(r => r.id === deleteIds[0])
                  return (
                    <>
                      The record for{' '}
                      <span className="font-medium">
                        {(target && memberMap.get(target.member_id)?.name) || 'Unknown'}
                      </span>
                      {target ? <> on {formatDateTime(target.check_in)}</> : null} will be deleted and the
                      attendance count will go down. This cannot be undone.
                    </>
                  )
                })()
              ) : (
                <>
                  These {deleteIds.length} records will be deleted and the attendance count will go down.
                  This cannot be undone.
                </>
              )}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteIds(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}