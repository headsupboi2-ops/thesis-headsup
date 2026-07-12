// ── Shared live-storm data provider ─────────────────────────────────
// One source of truth for active storms, their forecast tracks, and the
// derived PAR alerts — consumed by the Storms, Map and Alerts tabs. Polls
// every 10 min (matching the backend cache) and fires a local notification
// when a storm newly escalates toward the PAR.
import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { fetchStorms, fetchForecast } from '../lib/api'
import { getNotificationPermission, scheduleLocalNotification } from '../lib/notifications'
import { computeParAlerts, alertHeadline, type ParAlert } from '../lib/alerts'
import type { LiveStorm, ForecastStep, TrackPoint } from '../lib/types'

const POLL_MS = 10 * 60 * 1000

interface StormData {
  storms: LiveStorm[]
  forecasts: Record<string, ForecastStep[]>
  alerts: ParAlert[]
  source: string | null
  loading: boolean
  refreshing: boolean
  error: string | null
  lastUpdated: Date | null
  refresh: () => Promise<void>
}

const Ctx = createContext<StormData | null>(null)

export function StormDataProvider({ children }: { children: ReactNode }) {
  const [storms, setStorms] = useState<LiveStorm[]>([])
  const [forecasts, setForecasts] = useState<Record<string, ForecastStep[]>>({})
  const [alerts, setAlerts] = useState<ParAlert[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const notifiedRef = useRef<Set<string>>(new Set())

  const load = useCallback(async (isManual: boolean) => {
    isManual ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const res = await fetchStorms()
      const list = res.storms ?? []
      setStorms(list)
      setSource(res.source ?? null)

      // Forecast per storm (best-effort) so we can detect PAR entry.
      const fcEntries = await Promise.all(list.map(async (s): Promise<[string, ForecastStep[]]> => {
        try {
          const history: TrackPoint[] = s.path?.length ? s.path.slice(-16) : [{ lat: s.lat, lon: s.lon }]
          if (history.length < 2) return [s.name, []]
          const fc = await fetchForecast(s.name, history)
          return [s.name, fc.forecast_steps ?? []]
        } catch {
          return [s.name, []]
        }
      }))
      const fcMap = Object.fromEntries(fcEntries)
      setForecasts(fcMap)

      const nextAlerts = computeParAlerts(list, fcMap)
      setAlerts(nextAlerts)
      setLastUpdated(new Date())
      void fireNotifications(nextAlerts, notifiedRef.current)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load(false)
    const id = setInterval(() => load(false), POLL_MS)
    return () => clearInterval(id)
  }, [load])

  const value: StormData = {
    storms, forecasts, alerts, source, loading, refreshing, error, lastUpdated,
    refresh: () => load(true),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStormData(): StormData {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStormData must be used within StormDataProvider')
  return v
}

/** Fire one local notification per new storm+status escalation (if permitted). */
async function fireNotifications(alerts: ParAlert[], fired: Set<string>) {
  const actionable = alerts.filter(a => a.status === 'inside' || a.status === 'approaching')
  if (!actionable.length) return
  const perm = await getNotificationPermission()
  if (!perm.granted) return
  for (const a of actionable) {
    const key = `${a.storm}:${a.status}`
    if (fired.has(key)) continue
    fired.add(key)
    await scheduleLocalNotification(
      a.status === 'inside' ? '🌀 Typhoon inside PAR' : '⚠️ Typhoon approaching PAR',
      alertHeadline(a),
    )
  }
}
