// ── Forecast drift hook — "is the storm still tracking as predicted?" ──
// Ported from the web app (frontend/hooks/useForecastDrift.ts). Runs for
// every tracked storm, not gated by PAR status. Does not run its own
// timer: storms/modelTracks are only replaced on the ~10-min poll
// upstream (useStormData's load()), so re-evaluating on that same cadence
// is enough.
//
// AsyncStorage reads are async, unlike web's synchronous localStorage, so
// state hydrates in an effect on mount and the main check effect is gated
// on that hydration completing — otherwise a check running before the
// stored snapshots have loaded would see an empty history and could
// wrongly treat an existing storm as brand new.
import { useEffect, useRef, useState } from 'react'
import {
  computeDrift, pickSnapshotForCheck, pruneSnapshots, shouldCaptureSnapshot,
  shouldNotifyTransition, driftNotificationTitle,
  type DriftCheck, type DriftLevel, type DriftSnapshotInput,
} from '../lib/forecastDrift'
import { scheduleLocalNotification } from '../lib/notifications'
import type { ModelTrack, LiveStorm } from '../lib/types'

const STORAGE_KEY = 'headsup:forecastDrift:v1'

interface PersistedState {
  snapshots: Record<string, DriftSnapshotInput[]>
  lastNotifiedLevel: Record<string, DriftLevel>
}

async function loadPersisted(): Promise<PersistedState> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState
      return { snapshots: parsed.snapshots ?? {}, lastNotifiedLevel: parsed.lastNotifiedLevel ?? {} }
    }
  } catch { /* corrupt or unavailable storage — start fresh */ }
  return { snapshots: {}, lastNotifiedLevel: {} }
}

async function savePersisted(state: PersistedState): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* storage unavailable — drop silently, matches web's quota catch */ }
}

function fireNotification(check: DriftCheck) {
  void scheduleLocalNotification(driftNotificationTitle(check), check.headline)
}

/**
 * Drift-by-storm, recomputed whenever `storms`/`modelTracks` change (i.e.
 * on every live poll from useStormData). Persists forecast snapshots and
 * the last notified level to AsyncStorage so history and notification
 * dedup both survive an app restart.
 */
export function useForecastDrift(
  storms: LiveStorm[],
  modelTracks: Record<string, ModelTrack[]>,
): Record<string, DriftCheck> {
  const [driftByStorm, setDriftByStorm] = useState<Record<string, DriftCheck>>({})
  const stateRef = useRef<PersistedState>({ snapshots: {}, lastNotifiedLevel: {} })
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadPersisted().then(loaded => {
      if (cancelled) return
      stateRef.current = loaded
      setHydrated(true)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const now = new Date()
    const state = stateRef.current
    let dirty = false
    const drifts: Record<string, DriftCheck> = {}
    const activeNames = new Set(storms.map(s => s.name))

    for (const storm of storms) {
      const name = storm.name
      const aiTrack = modelTracks[name]?.find(t => t.model === 'AI_ENSEMBLE' && t.source === 'live')
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
      const check = computeDrift(name, chosen, { lat: storm.lat, lon: storm.lon }, now)
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
    // storm's history would sit in AsyncStorage forever.
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

    if (dirty) void savePersisted(state)
    setDriftByStorm(drifts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storms, modelTracks, hydrated])

  return driftByStorm
}
