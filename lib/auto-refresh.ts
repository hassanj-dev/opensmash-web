'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

// Runs `callback` every 30 s while the tab is visible, and once when the tab becomes visible again.
export function useAutoRefresh(callback: () => void, enabled = true, intervalMs = 30_000) {
  const cbRef = useRef(callback)
  useEffect(() => {
    cbRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      if (!document.hidden) cbRef.current()
    }
    const id = window.setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [enabled, intervalMs])
}

// Keeps the old array reference when nothing changed, so a refresh does not re-trigger effects.
export function keepIfSame<T>(prev: T[], next: T[]): T[] {
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
}

export type LiveTable = 'members' | 'payments' | 'attendance' | 'expenses' | 'plans'

interface LiveRefreshOptions {
  gymId: string | null
  tables: LiveTable[]
  // false while a dialog is open: a change that arrives meanwhile is remembered and applied afterwards
  enabled?: boolean
  debounceMs?: number // wait this long after the last change (default 700 ms)
  maxWaitMs?: number // but never wait longer than this during a burst of changes (default 4 s)
  pollMs?: number // fallback refresh while Realtime is not connected (default 30 s)
  livePollMs?: number // slow safety-net refresh while Realtime is connected (default 60 s)
}

// Supabase Realtime for one gym: when a row of one of `tables` changes (web or desktop sync),
// `callback` runs once after a short debounce. The signal carries no data: the page re-reads
// through its own queries, so RLS and the page's filters stay the only source of truth.
// If Realtime is not connected, it polls every 30 s exactly like useAutoRefresh did before.
// Pass `callback` that reads the latest state (it is kept in a ref, so it never re-subscribes).
export function useLiveRefresh(callback: () => void, opts: LiveRefreshOptions) {
  const {
    gymId,
    tables,
    enabled = true,
    debounceMs = 700,
    maxWaitMs = 4000,
    pollMs = 30_000,
    livePollMs = 60_000,
  } = opts

  const [live, setLive] = useState(false)
  const cbRef = useRef(callback)
  const enabledRef = useRef(enabled)
  const pendingRef = useRef(false)

  useEffect(() => {
    cbRef.current = callback
  }, [callback])

  // A change that arrived while paused (dialog open) is applied as soon as the page is enabled again.
  useEffect(() => {
    enabledRef.current = enabled
    if (enabled && pendingRef.current && !document.hidden) {
      pendingRef.current = false
      cbRef.current()
    }
  }, [enabled])

  const tableKey = [...new Set(tables)].sort().join(',')

  useEffect(() => {
    if (!gymId || !tableKey) return

    let timer: ReturnType<typeof setTimeout> | null = null
    let burstStart = 0
    let hadProblem = false

    const run = () => {
      if (!enabledRef.current || document.hidden) {
        pendingRef.current = true
        return
      }
      pendingRef.current = false
      cbRef.current()
    }

    // trailing debounce with a maximum wait, so a long desktop sync still updates the screen
    const schedule = () => {
      const now = Date.now()
      if (timer) clearTimeout(timer)
      else burstStart = now
      const wait = Math.max(0, Math.min(debounceMs, burstStart + maxWaitMs - now))
      timer = setTimeout(() => {
        timer = null
        run()
      }, wait)
    }

    const channel = supabase.channel(
      `live:${tableKey}:${gymId}:${Math.random().toString(36).slice(2, 8)}`
    )
    for (const table of tableKey.split(',')) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `gym_id=eq.${gymId}` },
        () => schedule()
      )
    }

    channel.subscribe(status => {
      const s = String(status)
      if (s === 'SUBSCRIBED') {
        setLive(true)
        // after a drop, changes may have been missed: catch up once
        if (hadProblem) {
          hadProblem = false
          schedule()
        }
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
        hadProblem = true
        setLive(false)
      }
    })

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
      setLive(false)
    }
  }, [gymId, tableKey, debounceMs, maxWaitMs])

  // Safety net: slow poll while Realtime works, normal 30 s poll while it does not.
  // useAutoRefresh also refreshes once whenever the tab becomes visible again.
  useAutoRefresh(
    () => {
      pendingRef.current = false
      cbRef.current()
    },
    enabled && !!gymId,
    live ? livePollMs : pollMs
  )
}
