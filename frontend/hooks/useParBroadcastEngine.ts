'use client'
// ── 3-Hour Interval Alert & Update Engine (inside PAR) ──────────────
// While a storm's PAR status is 'inside', this engine broadcasts a
// systematic update packet at entry (Hour 0) and every 3 operational
// hours after (Hour 3, 6, 9, …). It stops the moment the storm leaves
// the PAR or dissipates, and survives page reloads by persisting entry
// timestamps and the packet log to localStorage.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ModelTrack } from '@/lib/forecastModels'
import type { ParAlert } from '@/components/alerts/ParAlerts'

// ── Packet types ────────────────────────────────────────────────────
export interface ConsensusSnapshot {
  entering: number
  total: number
  /** Mean distance (km) of the 10 model positions from their centroid at +48 h. */
  spreadKm: number
  centroid: { lat: number; lon: number } | null
}

export type ConsensusChange = 'narrowed' | 'widened' | 'shifted' | 'steady'

export interface BroadcastPacket {
  id: string                     // `${storm}:${hoursElapsed}`
  storm: string
  hoursElapsed: number           // 0, 3, 6, 9, …
  issuedAtUtc: string            // ISO timestamp
  localTime: string              // viewer's local clock at issue time
  position: { lat: number; lon: number }
  windKt: number
  category: number
  movement: { speedKmh: number; heading: string } | null
  tcws: { signal: 1 | 2 | 3 | 4 | 5; label: string } | null
  consensus: ConsensusSnapshot | null
  consensusChange: ConsensusChange | null
  headline: string
}

interface StormLike {
  info: {
    name: string
    lat: number
    lon: number
    wind_speed: number
    category: number
    path: Array<{ lat: number; lon: number }>
  }
  forecast: Array<{ lat: number; lon: number; hour: number }>
}

// ── Tunables ────────────────────────────────────────────────────────
// Broadcast cadence: 3 h. Override in minutes via env for local demos,
// e.g. NEXT_PUBLIC_PAR_BROADCAST_MINUTES=1 fires "Hour 3" every minute.
const OVERRIDE_MIN = Number(process.env.NEXT_PUBLIC_PAR_BROADCAST_MINUTES)
export const BROADCAST_INTERVAL_MS =
  Number.isFinite(OVERRIDE_MIN) && OVERRIDE_MIN > 0 ? OVERRIDE_MIN * 60_000 : 3 * 3_600_000
const TICK_MS = 30_000            // how often we check whether a packet is due
const LOG_CAP = 200
const STORAGE_KEY = 'headsup:parBroadcast:v1'
const BEST_TRACK_STEP_H = 6       // agency best-track fixes are 6-hourly

// ── Pure utilities ──────────────────────────────────────────────────
const RAD = Math.PI / 180
const EARTH_R = 6371

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * RAD
  const dLon = (bLon - aLon) * RAD
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.sqrt(s))
}

const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']

/** Speed (km/h) + 16-point compass heading from the last two best-track fixes. */
export function computeMovement(path: Array<{ lat: number; lon: number }>): BroadcastPacket['movement'] {
  if (!path || path.length < 2) return null
  const a = path[path.length - 2]
  const b = path[path.length - 1]
  const distKm = haversineKm(a.lat, a.lon, b.lat, b.lon)
  const speedKmh = Math.round(distKm / BEST_TRACK_STEP_H)
  const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD)
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) -
    Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD)
  const bearing = (Math.atan2(y, x) / RAD + 360) % 360
  const heading = COMPASS[Math.round(bearing / 22.5) % 16]
  return { speedKmh, heading }
}

/** PAGASA Tropical Cyclone Wind Signal from sustained wind (2022 revision, km/h thresholds). */
export function tcwsFromWind(windKt: number): BroadcastPacket['tcws'] {
  const kmh = windKt * 1.852
  if (kmh >= 185) return { signal: 5, label: 'TCWS #5 — extreme, ≥185 km/h winds expected in path' }
  if (kmh >= 118) return { signal: 4, label: 'TCWS #4 — very destructive typhoon-force winds in path' }
  if (kmh >= 89)  return { signal: 3, label: 'TCWS #3 — destructive storm-force winds in path' }
  if (kmh >= 62)  return { signal: 2, label: 'TCWS #2 — damaging gale-force winds in path' }
  if (kmh >= 39)  return { signal: 1, label: 'TCWS #1 — strong winds possible in path' }
  return null
}

/** Snapshot the 10-model spread at +48 h: how tightly the ensemble agrees. */
export function consensusSnapshot(tracks: ModelTrack[] | undefined): ConsensusSnapshot | null {
  if (!tracks?.length) return null
  const at48 = tracks
    .map(t => {
      let best: { lat: number; lon: number } | null = null
      let bestDiff = Infinity
      for (const p of t.points) {
        const diff = Math.abs(p.hour - 48)
        if (diff < bestDiff) { bestDiff = diff; best = { lat: p.lat, lon: p.lon } }
      }
      return best
    })
    .filter((p): p is { lat: number; lon: number } => p !== null)
  if (at48.length < 2) return null
  const centroid = {
    lat: at48.reduce((s, p) => s + p.lat, 0) / at48.length,
    lon: at48.reduce((s, p) => s + p.lon, 0) / at48.length,
  }
  const spreadKm = Math.round(
    at48.reduce((s, p) => s + haversineKm(p.lat, p.lon, centroid.lat, centroid.lon), 0) / at48.length,
  )
  return { entering: 0, total: tracks.length, spreadKm, centroid }
}

/** Compare two consensus snapshots taken 3 h apart. */
export function diffConsensus(prev: ConsensusSnapshot | null, curr: ConsensusSnapshot | null): ConsensusChange | null {
  if (!curr) return null
  if (!prev) return 'steady'
  if (prev.centroid && curr.centroid &&
      haversineKm(prev.centroid.lat, prev.centroid.lon, curr.centroid.lat, curr.centroid.lon) > 150) {
    return 'shifted'
  }
  if (curr.spreadKm < prev.spreadKm * 0.85) return 'narrowed'
  if (curr.spreadKm > prev.spreadKm * 1.15) return 'widened'
  return 'steady'
}

export const CONSENSUS_TEXT: Record<ConsensusChange, string> = {
  narrowed: 'model tracks narrowing toward a specific landfall zone',
  widened:  'model tracks diverging — landfall zone less certain',
  shifted:  'consensus landfall zone has SHIFTED in the last 3 hours',
  steady:   'model consensus steady since last update',
}

/**
 * Compile the unified 3-hour update packet for one storm inside the PAR.
 * Pure: everything it needs is passed in, so it is unit-testable.
 */
export function generateThreeHourUpdate(
  hoursElapsed: number,
  storm: StormLike,
  tracks: ModelTrack[] | undefined,
  alert: ParAlert | undefined,
  prevConsensus: ConsensusSnapshot | null,
  now: Date = new Date(),
): BroadcastPacket {
  const { name, lat, lon, wind_speed, category, path } = storm.info
  const movement = computeMovement(path)
  const tcws = tcwsFromWind(wind_speed)
  const consensus = consensusSnapshot(tracks)
  if (consensus && alert?.consensus) {
    consensus.entering = alert.consensus.entering
    consensus.total = alert.consensus.total
  }
  const consensusChange = diffConsensus(prevConsensus, consensus)

  const utcClock = now.toISOString().slice(11, 16)
  const parts = [
    `🚨 [${utcClock} UTC Update] Hour ${hoursElapsed} inside PAR:`,
    `${name} (Cat ${category}, ${Math.round(wind_speed)} kt) at ${lat.toFixed(1)}°N ${lon.toFixed(1)}°E`,
  ]
  if (movement) parts.push(`moving ${movement.heading} at ${movement.speedKmh} km/h`)
  if (tcws) parts.push(`— ${tcws.label.split(' — ')[0]} warranted for areas in the path`)

  return {
    id: `${name}:${hoursElapsed}`,
    storm: name,
    hoursElapsed,
    issuedAtUtc: now.toISOString(),
    localTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    position: { lat, lon },
    windKt: Math.round(wind_speed),
    category,
    movement,
    tcws,
    consensus,
    consensusChange,
    headline: parts.join(' '),
  }
}

// ── Persistence ─────────────────────────────────────────────────────
interface PersistedState {
  entryTimes: Record<string, number>   // storm → epoch ms of PAR entry
  log: BroadcastPacket[]
}

function loadPersisted(): PersistedState {
  if (typeof window === 'undefined') return { entryTimes: {}, log: [] }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState
      return { entryTimes: parsed.entryTimes ?? {}, log: parsed.log ?? [] }
    }
  } catch { /* corrupt storage — start fresh */ }
  return { entryTimes: {}, log: [] }
}

function savePersisted(state: PersistedState) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* quota */ }
}

// ── The engine hook ─────────────────────────────────────────────────
export function useParBroadcastEngine(
  storms: StormLike[],
  modelTracks: Record<string, ModelTrack[]>,
  alerts: ParAlert[],
) {
  const [log, setLog] = useState<BroadcastPacket[]>(() => loadPersisted().log)
  const [toast, setToast] = useState<BroadcastPacket | null>(null)

  // Mutable snapshots read by the single interval — keeps the interval
  // stable (registered once, cleaned up once: no leaks, no timer churn).
  const stateRef = useRef({ storms, modelTracks, alerts })
  stateRef.current = { storms, modelTracks, alerts }
  const entryTimesRef = useRef<Record<string, number>>(loadPersisted().entryTimes)
  const logRef = useRef(log)
  logRef.current = log

  useEffect(() => {
    const tick = () => {
      const { storms, modelTracks, alerts } = stateRef.current
      const now = Date.now()
      const entryTimes = entryTimesRef.current
      const insideStorms: Record<string, ParAlert> = {}
      for (const a of alerts) {
        if (a.status === 'inside') insideStorms[a.storm] = a
      }

      // Stop timers instantly for storms that left the PAR or dissipated.
      // (History log is kept — only the live loop stops.)
      let dirty = false
      for (const name of Object.keys(entryTimes)) {
        if (!insideStorms[name]) { delete entryTimes[name]; dirty = true }
      }

      const fresh: BroadcastPacket[] = []
      for (const name of Object.keys(insideStorms)) {
        const alert = insideStorms[name]
        const storm = storms.find(s => s.info.name === name)
        if (!storm) continue

        // Status just shifted to ENTERED_PAR → cache entryTime, fire Hour 0
        if (!entryTimes[name]) { entryTimes[name] = now; dirty = true }

        const dueHours = Math.floor((now - entryTimes[name]) / BROADCAST_INTERVAL_MS) * 3
        const lastEmitted = logRef.current
          .filter(p => p.storm === name)
          .reduce((max, p) => Math.max(max, p.hoursElapsed), -1)
        if (dueHours <= lastEmitted) continue

        const prevConsensus = logRef.current.find(p => p.storm === name)?.consensus ?? null
        fresh.push(generateThreeHourUpdate(dueHours, storm, modelTracks[name], alert, prevConsensus))
      }

      if (fresh.length) {
        setLog(prev => {
          const next = [...fresh, ...prev].slice(0, LOG_CAP)
          savePersisted({ entryTimes: entryTimesRef.current, log: next })
          return next
        })
        setToast(fresh[0])
        // Browser push notification per packet (permission handled by ParAlerts opt-in)
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          for (const p of fresh) {
            try { new Notification(`PAR Hour ${p.hoursElapsed} — ${p.storm}`, { body: p.headline, tag: p.id }) } catch {}
          }
        }
      } else if (dirty) {
        savePersisted({ entryTimes: entryTimesRef.current, log: logRef.current })
      }
    }

    tick()                                    // evaluate immediately on mount
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)            // single cleanup — leak-free
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])
  const clearLog = useCallback(() => {
    setLog([])
    savePersisted({ entryTimes: entryTimesRef.current, log: [] })
  }, [])

  /** Latest packet headline per storm — drives the crimson banner text. */
  const latestHeadlines: Record<string, string> = {}
  for (const p of log) {
    if (!(p.storm in latestHeadlines)) latestHeadlines[p.storm] = p.headline
  }

  return { log, toast, dismissToast, clearLog, latestHeadlines }
}
