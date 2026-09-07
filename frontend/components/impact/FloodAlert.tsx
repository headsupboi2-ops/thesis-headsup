'use client'
// ── Rising flood-risk alert ─────────────────────────────────────────
// Fires when the 24 h peak level for the selected area climbs to Moderate or
// above. Watches the same `peak` the timeline draws, so the banner and the
// chart can never disagree.
//
// Browser notifications here use the plain Notification constructor, matching
// components/alerts/ParAlerts.tsx. There is no service worker, so they only
// fire while this page is open — a background tab counts, a closed one does not.
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, BellRing, X } from 'lucide-react'
import { floodMeta, shouldAlert, type FloodHour, type FloodLevel } from '@/lib/flood'

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function FloodAlert({ peak, areaLabel, tidalInfluence }: {
  peak: FloodHour | null
  areaLabel: string
  tidalInfluence: number
}) {
  // Last level seen PER AREA — switching barangay must not read as a rise.
  const lastLevelRef = useRef<Map<string, FloodLevel>>(new Map())
  // Areas+levels already notified this session, so one rise notifies once.
  const notifiedRef = useRef<Set<string>>(new Set())

  const [alert, setAlert] = useState<{ key: string; level: FloodLevel; ms: number; rainMm: number; tideM: number | null } | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) setNotifPermission(Notification.permission)
  }, [])

  useEffect(() => {
    if (!peak) return
    const prev = lastLevelRef.current.get(areaLabel) ?? null
    lastLevelRef.current.set(areaLabel, peak.level)
    if (!shouldAlert(prev, peak.level)) return

    const key = `${areaLabel}:${peak.level}`
    setAlert({ key, level: peak.level, ms: peak.ms, rainMm: peak.rainMm, tideM: peak.tideM })
    setDismissed(d => { const n = new Set(d); n.delete(key); return n })

    if (notifiedRef.current.has(key)) return
    notifiedRef.current.add(key)
    if (notifPermission === 'granted') {
      try {
        new Notification(`Flood risk rising — ${areaLabel}`, {
          body: `${floodMeta(peak.level).word} by ${hhmm(peak.ms)} · ${peak.rainMm} mm/24h. ${floodMeta(peak.level).advice}`,
          tag: key,           // a later alert for the same area+level replaces this one
          icon: '/favicon.ico',
        })
      } catch { /* constructor throws on some mobile browsers */ }
    }
  }, [peak, areaLabel, notifPermission])

  // Offer the opt-in as soon as the area is one the tide can affect, so
  // permission is already granted before the weather turns.
  const showOptIn = notifPermission === 'default' && typeof window !== 'undefined' && 'Notification' in window

  if (!alert && !showOptIn) return null
  const hidden = alert ? dismissed.has(alert.key) : true

  return (
    <div className="flex flex-col gap-2">
      {alert && !hidden && (() => {
        const meta = floodMeta(alert.level)
        return (
          <div role="alert" className="rounded-xl px-4 py-3 text-white flex items-start gap-3"
            style={{ background: meta.color, boxShadow: `0 6px 22px ${meta.color}55` }}>
            <AlertTriangle size={20} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-extrabold text-sm">
                Flood risk rising in {areaLabel} — {meta.word} by {hhmm(alert.ms)}
              </div>
              <div className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.93)' }}>
                {alert.rainMm} mm/24h forecast
                {alert.tideM != null && tidalInfluence > 0.05 && ` on a ${alert.tideM.toFixed(2)} m tide`}. {meta.advice}
              </div>
            </div>
            <button onClick={() => setDismissed(d => new Set(d).add(alert.key))}
              aria-label="Dismiss flood alert"
              className="shrink-0 rounded-md w-6 h-6 flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer' }}>
              <X size={13} />
            </button>
          </div>
        )
      })()}

      {showOptIn && (
        <button
          onClick={() => Notification.requestPermission().then(setNotifPermission)}
          className="self-start flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,82,204,0.25)', color: '#0052cc', cursor: 'pointer' }}>
          <BellRing size={13} /> Enable flood alerts
        </button>
      )}
    </div>
  )
}
