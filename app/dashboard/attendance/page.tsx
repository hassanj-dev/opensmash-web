'use client'
import { useLiveRefresh, keepIfSame } from '@/lib/auto-refresh'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { differenceInMinutes, format } from 'date-fns'
import {
  Activity,
  Calendar,
  Clock,
  LogIn,
  LogOut,
  Search,
  Trash2,
  UserCheck,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/utils'
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

function getStatus(member: MemberOption): MemberStatus {
  if (!member.is_active || member.deleted_at) return 'Inactive'
  if (!member.expiry_date || member.expiry_date < todayStr()) return 'Expired'
  return 'Active'
}

const statusStyles: Record<MemberStatus, string> = {
  Active: 'bg-green-50 text-green-700 border-green-100',
  Expired: 'bg-orange-50 text-orange-700 border-orange-100',
  Inactive: 'bg-gray-100 text-gray-600 border-gray-200'
}

function formatDuration(checkIn: string, checkOut: string | null) {
  const end = checkOut ? new Date(checkOut) : new Date()
  const minutes = Math.max(0, differenceInMinutes(end, new Date(checkIn)))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
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

  const [dateFilter, setDateFilter] = useState(todayStr())

  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkInError, setCheckInError] = useState<string | null>(null)
  const [checkInMessage, setCheckInMessage] = useState<string | null>(null)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRow | null>(null)
  const [deleting, setDeleting] = useState(false)

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
    setError(null)
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) {
        setError('You are not logged in. Please log in again.')
        return
      }
      setUserId(user.id)

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('gym_id, role')
        .eq('id', user.id)
        .single()

      if (userError || !userData?.gym_id) {
        setError('No gym is linked to your account.')
        return
      }

      const currentGymId = userData.gym_id as string
      const memberRows = await fetchAllMembers(currentGymId)

      setMembers(memberRows)
      setRole((userData.role as string) || null)
      setGymId(currentGymId)
    } catch (err) {
      console.error('Error loading attendance page:', err)
      setError('Could not load the page. Please try again.')
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
    { gymId, tables: ['attendance', 'members'], enabled: !deleteTarget }
  )

  const memberMap = useMemo(() => {
    const map = new Map<string, MemberOption>()
    members.forEach(m => map.set(m.id, m))
    return map
  }, [members])

  // Removed members cannot be picked for check-in
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

  const stats = useMemo(() => {
    const inside = rows.filter(r => !r.check_out).length
    const notActive = rows.filter(r => {
      const m = memberMap.get(r.member_id)
      return m ? getStatus(m) !== 'Active' : false
    }).length
    return { visits: rows.length, inside, notActive }
  }, [rows, memberMap])

  const selectedStatus = selectedMember ? getStatus(selectedMember) : null

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
    if (!gymId || !selectedMember) return

    // Same rule as the desktop app: only an Active membership can check in
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
      // Is this member already inside today (Pakistan day)?
      const startOfToday = pkDayStartISO(todayStr())
      const { data: openRows, error: openError } = await supabase
        .from('attendance')
        .select('id')
        .eq('gym_id', gymId)
        .eq('member_id', selectedMember.id)
        .gte('check_in', startOfToday)
        .is('check_out', null)
        .is('deleted_at', null)
        .limit(1)

      if (openError) throw openError
      if (openRows && openRows.length > 0) {
        setCheckInError(`${selectedMember.name} is already inside. Please check them out first.`)
        return
      }

      const { error: insertError } = await supabase.from('attendance').insert({
        gym_id: gymId,
        member_id: selectedMember.id,
        check_in: new Date().toISOString()
      })
      if (insertError) {
        // Unique index (one open visit per member per day): another device was faster
        if ((insertError as { code?: string }).code === '23505') {
          setCheckInError(`${selectedMember.name} is already inside (checked in on another device).`)
          return
        }
        throw insertError
      }

      setCheckInMessage(`${selectedMember.name} has been checked in.`)
      clearMember()
      if (dateFilter !== todayStr()) {
        setDateFilter(todayStr())
      } else {
        await loadAttendance(gymId, dateFilter)
      }
    } catch (err) {
      console.error('Error checking in:', err)
      setCheckInError('Could not check in. Please try again.')
    } finally {
      setCheckingIn(false)
    }
  }

  async function handleCheckOut(row: AttendanceRow) {
    if (!gymId) return
    setBusyId(row.id)
    setError(null)

    const checkOut = new Date().toISOString()
    const { data, error: updateError } = await supabase
      .from('attendance')
      .update({ check_out: checkOut })
      .eq('id', row.id)
      .eq('gym_id', gymId)
      .is('check_out', null)
      .select('id')

    if (updateError) {
      console.error('Error checking out:', updateError)
      setError('Could not check out. Please try again.')
    } else if (!data || data.length === 0) {
      // Already checked out elsewhere, or blocked by permissions: reload the real state
      setError('Could not check out. The visit may already be closed. The list was refreshed.')
      await loadAttendance(gymId, dateFilter)
    } else {
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, check_out: checkOut } : r)))
    }
    setBusyId(null)
  }

  async function handleDelete() {
    if (!gymId || !userId || !deleteTarget) return
    setDeleting(true)
    setError(null)

    // Soft delete: the desktop app learns about it through deleted_at
    const { data, error: deleteError } = await supabase
      .from('attendance')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteTarget.id)
      .eq('gym_id', gymId)
      .is('deleted_at', null)
      .select('id')

    if (deleteError) {
      console.error('Error deleting attendance:', deleteError)
      setError('Could not delete the record. Please try again.')
    } else if (!data || data.length === 0) {
      setError('The record was not deleted. Only an owner or manager can delete visits.')
    } else {
      setRows(prev => prev.filter(r => r.id !== deleteTarget.id))
      void logAudit(gymId, userId, 'attendance_deleted', {
        attendance_id: deleteTarget.id,
        member_id: deleteTarget.member_id,
        check_in: deleteTarget.check_in
      })
    }
    setDeleting(false)
    setDeleteTarget(null)
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

  const statCards = [
    {
      title: isToday ? 'Visits Today' : 'Visits',
      value: stats.visits,
      subtitle: format(new Date(`${dateFilter}T00:00:00`), 'dd MMM yyyy'),
      icon: Calendar,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: 'Inside Now',
      value: isToday ? stats.inside : '-',
      subtitle: isToday ? 'Not checked out yet' : 'Today only',
      icon: Activity,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

      {/* Check-in panel */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-blue-600" />
            Check In
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
                placeholder="Enter member name, code or phone"
                className={`${inputClass} pl-9`}
              />
              {suggestions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  {suggestions.map(m => {
                    const status = getStatus(m)
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
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyles[status]}`}
                        >
                          {status}
                        </span>
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
              <LogIn className="w-4 h-4 mr-2" />
              {checkingIn ? 'Please wait...' : 'Check In'}
            </Button>
          </div>

          {selectedMember && selectedStatus === 'Expired' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-orange-100 bg-orange-50 p-3 text-sm text-orange-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {selectedMember.name}&apos;s membership has expired
                {selectedMember.expiry_date ? ` (${selectedMember.expiry_date})` : ''}. Check-in is
                blocked. Use the Renew button on the Members page first.
              </span>
            </div>
          )}
          {selectedMember && selectedStatus === 'Inactive' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                This member is Inactive. Activate them from the Members page before checking in.
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
          {listLoading && rows.length === 0 ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg"></div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              {isToday ? 'No check-ins yet today.' : 'No visit records for this day.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                    <th className="px-3 py-3 font-medium">Member</th>
                    <th className="px-3 py-3 font-medium">Check In</th>
                    <th className="px-3 py-3 font-medium">Check Out</th>
                    <th className="px-3 py-3 font-medium">Duration</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const member = memberMap.get(row.member_id)
                    const status = member ? getStatus(member) : null
                    const inside = !row.check_out
                    return (
                      <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
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
                        <td className="px-3 py-3 text-gray-700">
                          {row.check_out ? pkTime(row.check_out) : '-'}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {inside && !isToday ? '-' : formatDuration(row.check_in, row.check_out)}
                        </td>
                        <td className="px-3 py-3">
                          {inside ? (
                            <span
                              className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                                isToday
                                  ? 'bg-blue-50 text-blue-700 border-blue-100'
                                  : 'bg-gray-100 text-gray-600 border-gray-200'
                              }`}
                            >
                              {isToday ? 'Inside' : 'No check-out'}
                            </span>
                          ) : (
                            <span className="inline-block rounded-full border border-green-100 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                              Done
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {inside && isToday && (
                              <button
                                onClick={() => handleCheckOut(row)}
                                disabled={busyId === row.id}
                                title="Check Out"
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                              >
                                <LogOut className="w-4 h-4" />
                                Check Out
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => setDeleteTarget(row)}
                                title="Delete"
                                className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
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

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-bold text-gray-900">Delete visit record?</h2>
            </div>
            <p className="text-sm text-gray-700">
              The record for{' '}
              <span className="font-medium">
                {memberMap.get(deleteTarget.member_id)?.name || 'Unknown'}
              </span>{' '}
              on {formatDateTime(deleteTarget.check_in)} will be deleted and the visit count will
              go down. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteTarget(null)}
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