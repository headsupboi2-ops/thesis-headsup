'use client'
// ── Forecast drift hook — "is the storm still tracking as predicted?" ──
// Runs for every tracked storm, not gated by PAR status (unlike
// useParBroadcastEngine): drift matters most days before PAR entry, the
// entire point is an early signal.
//
// Unlike useParBroadcastEngine, this hook does NOT run its own setInterval
// tick. Its snapshot-capture and drift-check windows (6h / 24h) only need
// to be re-evaluated at the same cadence the underlying data already
// refreshes at (storms/modelTracks are replaced wholesale on every ~10-min
// poll upstream) — so a plain effect keyed on those props is sufficient
// and avoids a redundant timer.

import { useEffect, useRef, useState } from 'react'
import type { ModelTrack } from '@/lib/forecastModels'
import {
  computeDrift, pickSnapshotForCheck, pruneSnapshots, shouldCaptureSnapshot,
  shouldNotifyTransition, driftNotificationTitle,
  type DriftCheck, type DriftLevel, type DriftSnapshotInput,
} from '@/lib/forecastDrift'

const STORAGE_KEY = 'headsup:forecastDrift:v1'

interface StormLike {
  info: { name: string; lat: number; lon: number }
}

interface PersistedState {
  snapshots: Record<string, DriftSnapshotInput[]>
  lastNotifiedLevel: Record<string, DriftLevel>
}

function loadPersisted(): PersistedState {
  if (typeof window === 'undefined') return { snapshots: {}, lastNotifiedLevel: {} }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState
      return { snapshots: parsed.snapshots ?? {}, lastNotifiedLevel: parsed.lastNotifiedLevel ?? {} }
    }
  } catch { /* corrupt storage — start fresh */ }
  return { snapshots: {}, lastNotifiedLevel: {} }
}

function savePersisted(state: PersistedState) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* quota */ }
}

function fireNotification(check: DriftCheck) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    new Notification(driftNotificationTitle(check), {
      body: check.headline,
      tag: `drift:${check.storm}:${check.level}`,
    })
  } catch { /* notification constructor can throw on some browsers */ }
}

/**
 * Drift-by-storm, recomputed whenever `storms`/`modelTracks` change (i.e.
 * on every live poll upstream). Persists forecast snapshots and the last
 * notified level to localStorage so history and notification dedup both
 * survive a reload.
 */
export function useForecastDrift(
  storms: StormLike[],
  modelTracks: Record<string, ModelTrack[]>,
): Record<string, DriftCheck> {
  const [driftByStorm, setDriftByStorm] = useState<Record<string, DriftCheck>>({})
  const stateRef = useRef<PersistedState>(loadPersisted())

  useEffect(() => {
    const now = new Date()
    const state = stateRef.current
    let dirty = false
    const drifts: Record<string, DriftCheck> = {}
    const activeNames = new Set(storms.map(s => s.info.name))

    for (const storm of storms) {
      const name = storm.info.name
      const aiTrack = modelTracks[name]?.find(t => t.model === 'AI_ENSEMBLE')
      let existing = state.snapshots[name] ?? []

      if (aiTrack?.points.length && shouldCaptureSnapshot(existing, now)) {
        existing = [...existing, { issuedAtUtc: now.toISOString(), points: aiTrack.points }]
        dirty = true
      }
      // Pruning is age-based and unconditional — it runs every cycle
      // regardless of whether a fresh forecast arrived, so a poll with no
      // forecast for this storm never loses history, it just skips adding
      // to it (see the spec's error-handling section).
      const pruned = pruneSnapshots(existing, now)
      if (pruned.length !== existing.length) dirty = true
      state.snapshots[name] = pruned

      const chosen = pickSnapshotForCheck(pruned, now)
      if (!chosen) continue
      const check = computeDrift(name, chosen, { lat: storm.info.lat, lon: storm.info.lon }, now)
      if (!check) continue
      drifts[name] = check

      if (shouldNotifyTransition(state.lastNotifiedLevel[name], check.level)) {
        state.lastNotifiedLevel[name] = check.level
        dirty = true
        fireNotification(check)
      }
    }

    // Storms no longer in `storms` (dissipated, or dropped from the live
    // feed) get no new captures or checks above — but their old snapshots
    // still need to age out via the same 36h prune, or a dissipated
    // storm's history would sit in localStorage forever.
    for (const name of Object.keys(state.snapshots)) {
      if (activeNames.has(name)) continue
      const pruned = pruneSnapshots(state.snapshots[name], now)
      if (pruned.length !== state.snapshots[name].length) dirty = true
      if (pruned.length === 0) {
        delete state.snapshots[name]
        delete state.lastNotifiedLevel[name]
        dirty = true
      } else {
        state.snapshots[name] = pruned
      }
    }

    if (dirty) savePersisted(state)
    setDriftByStorm(drifts)
  }, [storms, modelTracks])

  return driftByStorm
}
