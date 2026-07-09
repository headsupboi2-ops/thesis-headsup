'use client'
import { useEffect, useRef, useState } from 'react'
import { distanceToParKm, firstParEntryHour, isInPar } from '@/lib/par'
import type { ModelTrack } from '@/lib/forecastModels'

// ── Alert model ─────────────────────────────────────────────────────
export type ParAlertStatus = 'inside' | 'approaching' | 'watch'

export interface ParAlert {
  storm: string
  status: ParAlertStatus
  category: number
  windKt: number
  etaHours: number | null                              // earliest model entry
  consensus: { entering: number; total: number } | null
  distanceKm: number
  /** Optional override — the 3-hour broadcast engine swaps in the latest snapshot text. */
  headline?: string
}

/** How far outside the boundary a storm can be and still raise a 'watch'. */
const WATCH_DISTANCE_KM = 300

interface StormLike {
  info: { name: string; lat: number; lon: number; wind_speed: number; category: number }
  forecast: Array<{ lat: number; lon: number; hour: number }>
}

/**
 * Geo-fence every storm's current position and all its model forecast
 * trajectories against the official PAR polygon.
 *
 * inside      — current position is within the PAR
 * approaching — ≥1 of the 10 model tracks crosses into the PAR;
 *               ETA is the EARLIEST model entry (safety-first), with
 *               the model consensus count attached
 * watch       — no modeled entry, but within WATCH_DISTANCE_KM of the boundary
 */
export function computeParAlerts(
  storms: StormLike[],
  modelTracks: Record<string, ModelTrack[]>,
): ParAlert[] {
  const alerts: ParAlert[] = []
  for (const storm of storms) {
    const { name, lat, lon, wind_speed, category } = storm.info
    const base = { storm: name, category, windKt: Math.round(wind_speed) }

    if (isInPar(lat, lon)) {
      alerts.push({ ...base, status: 'inside', etaHours: null, consensus: null, distanceKm: 0 })
      continue
    }

    // Check every model trajectory; fall back to the AI forecast alone
    // when the multi-model tracks haven't arrived yet.
    const tracks = modelTracks[name]?.length
      ? modelTracks[name].map(t => t.points)
      : storm.forecast.length ? [storm.forecast] : []
    const entries = tracks
      .map(points => firstParEntryHour(points))
      .filter((h): h is number => h !== null)

    const distanceKm = distanceToParKm(lat, lon)
    if (entries.length > 0) {
      alerts.push({
        ...base,
        status: 'approaching',
        etaHours: Math.min(...entries),
        consensus: { entering: entries.length, total: tracks.length },
        distanceKm,
      })
    } else if (distanceKm <= WATCH_DISTANCE_KM) {
      alerts.push({ ...base, status: 'watch', etaHours: null, consensus: null, distanceKm })
    }
  }
  const rank: Record<ParAlertStatus, number> = { inside: 0, approaching: 1, watch: 2 }
  return alerts.sort((a, b) => rank[a.status] - rank[b.status])
}

// ── Presentation ────────────────────────────────────────────────────
const STYLE: Record<ParAlertStatus, { bg: string; icon: string; shadow: string }> = {
  inside:      { bg: 'linear-gradient(90deg,#a80000,#e11900)', icon: '🌀', shadow: '0 4px 18px rgba(220,0,0,0.55)' },
  approaching: { bg: 'linear-gradient(90deg,#cc4400,#ff7a00)', icon: '⚠️', shadow: '0 4px 16px rgba(230,110,0,0.45)' },
  watch:       { bg: 'linear-gradient(90deg,#9a7b00,#c9a400)', icon: '👁', shadow: '0 4px 14px rgba(190,150,0,0.4)' },
}

function fmtEta(h: number) {
  const d = Math.floor(h / 24), r = h % 24
  return d > 0 ? `~${d}d ${r}h` : `~${r}h`
}

function alertHeadline(a: ParAlert): string {
  if (a.headline) return a.headline
  if (a.status === 'inside')
    return `${a.storm} HAS ENTERED PAR — Cat ${a.category} · ${a.windKt} kt`
  if (a.status === 'approaching')
    return `${a.storm} may enter PAR in ${fmtEta(a.etaHours ?? 0)} — ${a.consensus!.entering}/${a.consensus!.total} models agree`
  return `${a.storm} near PAR boundary — ${a.distanceKm} km away`
}

/**
 * Stacked severity banners (top-center) + browser push notifications.
 * Each storm+status fires one browser notification per session; a storm
 * escalating (watch → approaching → inside) both re-shows a dismissed
 * banner and fires a fresh notification.
 */
export function ParAlerts({ alerts, top = 92 }: { alerts: ParAlert[]; top?: number }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const notifiedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission)
    }
  }, [])

  // Fire a browser notification once per storm+status transition
  useEffect(() => {
    if (notifPermission !== 'granted') return
    for (const a of alerts) {
      const key = `${a.storm}:${a.status}`
      if (notifiedRef.current.has(key)) continue
      notifiedRef.current.add(key)
      try {
        new Notification(`PAR Alert — ${a.storm}`, {
          body: alertHeadline(a),
          tag: key,           // replaces older notification for the same transition
          icon: '/favicon.ico',
        })
      } catch { /* notification constructor can throw on some mobile browsers */ }
    }
  }, [alerts, notifPermission])

  const visible = alerts.filter(a => !dismissed.has(`${a.storm}:${a.status}`))
  if (!alerts.length) return null

  return (
    <div className="fixed z-[860] flex flex-col items-center gap-1.5"
      style={{ top, left: '50%', transform: 'translateX(-50%)', maxWidth: 560, width: 'max-content' }}>
      {visible.map(a => {
        const s = STYLE[a.status]
        const key = `${a.storm}:${a.status}`
        return (
          <div key={key}
            className={`flex items-center gap-2.5 px-4 py-2 text-white text-sm font-semibold${a.status === 'inside' ? ' animate-pulse' : ''}`}
            style={{ background: s.bg, borderRadius: 8, boxShadow: s.shadow }}
            role="alert">
            <span style={{ fontSize: 16 }}>{s.icon}</span>
            <span>{alertHeadline(a)}</span>
            <button onClick={() => setDismissed(prev => new Set(prev).add(key))}
              aria-label={`Dismiss ${a.storm} alert`}
              style={{
                background: 'rgba(255,255,255,0.18)', border: 'none', color: 'white',
                borderRadius: 5, width: 20, height: 20, lineHeight: 1, fontSize: 12,
                cursor: 'pointer', flexShrink: 0,
              }}>
              ✕
            </button>
          </div>
        )
      })}

      {/* One-time opt-in for browser push notifications */}
      {notifPermission === 'default' && (
        <button
          onClick={() => Notification.requestPermission().then(setNotifPermission)}
          className="text-xs font-bold text-white px-3 py-1"
          style={{
            background: 'rgba(0,40,120,0.85)', border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 14, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          }}>
          🔔 Enable typhoon PAR notifications
        </button>
      )}
    </div>
  )
}
