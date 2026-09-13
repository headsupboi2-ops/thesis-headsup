# Forecast Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell users when a storm's actual position has drifted from what
the app's own AI Ensemble forecast said it would be ~24h ago — and notify
them on the transition, in either direction (shifting away from the
forecast, or confirming it's back on track).

**Architecture:** A pure computation module (`lib/forecastDrift.ts`,
mirrored on both platforms) plus a dedicated hook (`useForecastDrift`,
platform-specific storage and notification delivery) that persists
6-hourly forecast snapshots client-side and recomputes drift live against
whichever snapshot is closest to 24h old. Wired into the existing
`ParAlert` banner as one more line, next to the spread-advice line already
there.

**Tech Stack:** TypeScript, React (web) / React Native + Expo (mobile),
localStorage (web) / AsyncStorage (mobile, newly added dependency), browser
`Notification` API (web) / `expo-notifications` via the existing
`scheduleLocalNotification` wrapper (mobile).

**Spec:** `docs/superpowers/specs/2026-09-14-forecast-drift-design.md`

## Global Constraints

- Anchor forecast is **AI Ensemble only** — never score drift against a
  `mock`-sourced track.
- Snapshot storage is **client-side only** (no backend changes at all in
  this plan).
- Lookback target is **24 hours**, valid within an **18–30 hour tolerance**
  window; when multiple stored snapshots qualify, pick whichever is closest
  to exactly 24h.
- Snapshots are captured at most once per **6 hours** per storm, and pruned
  past **36 hours** old.
- Thresholds: **< 40km = on-track**, **40–100km = minor**, **> 100km =
  significant**.
- The drift line is **always shown** once a check exists for a storm
  (unlike the spread-advice line, which stays silent when there's nothing
  to report).
- Notifications fire **once per storm per level transition**, in either
  direction, including the first-ever check — never on every poll.
- No test runner exists in this repo (`frontend/package.json` has no
  vitest/jest, confirmed). Every pure-module task is verified the same way
  `lib/uncertainty.ts` was: a throwaway `.ts` script compiled with `npx tsc`
  (`--module commonjs --target es2022 --moduleResolution node
  --skipLibCheck --esModuleInterop`) and run with `node`, then deleted.

---

## Task 1: `frontend/lib/forecastDrift.ts` — pure drift computation

**Files:**
- Create: `frontend/lib/forecastDrift.ts`
- Test (temporary, deleted at the end of this task): `frontend/__check_forecastDrift.ts`

**Interfaces:**
- Consumes: `interpolateTrackAt`, `haversineKm`, `bearingDeg`, `LatLon` from
  `frontend/lib/uncertainty.ts` (all already exist — see
  `frontend/lib/uncertainty.ts:17`, `:28`, `:55`, `:25`).
- Produces (used by Task 2's hook and Task 3's UI): `DriftLevel`,
  `DriftCheck`, `DriftSnapshotInput`, `levelFromDriftKm(km: number):
  DriftLevel`, `headingFromBearing(bearing: number): string`,
  `shouldCaptureSnapshot(existing: DriftSnapshotInput[], now: Date):
  boolean`, `pruneSnapshots(existing: DriftSnapshotInput[], now: Date):
  DriftSnapshotInput[]`, `pickSnapshotForCheck(snapshots:
  DriftSnapshotInput[], now: Date): DriftSnapshotInput | null`,
  `computeDrift(storm: string, snapshot: DriftSnapshotInput, actual:
  LatLon, now?: Date): DriftCheck | null`, `shouldNotifyTransition(lastLevel:
  DriftLevel | undefined, newLevel: DriftLevel): boolean`,
  `driftNotificationTitle(check: DriftCheck): string`,
  `SNAPSHOT_INTERVAL_H`, `SNAPSHOT_MAX_AGE_H` (exported constants — the
  hook needs `SNAPSHOT_INTERVAL_H`/`SNAPSHOT_MAX_AGE_H` nowhere directly,
  they're internal to this module's own functions, but are exported for
  the test script to reference rather than hardcoding duplicate numbers).

- [ ] **Step 1: Write the failing test script**

Create `frontend/__check_forecastDrift.ts`:

```ts
// Throwaway verification for lib/forecastDrift.ts — not part of the app.
import {
  levelFromDriftKm, headingFromBearing, shouldCaptureSnapshot, pruneSnapshots,
  pickSnapshotForCheck, computeDrift, shouldNotifyTransition, driftNotificationTitle,
  type DriftSnapshotInput,
} from './lib/forecastDrift'

let failures = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { console.log(`  PASS  ${name}`) }
  else { failures++; console.log(`  FAIL  ${name}`, extra ?? '') }
}

// ── 1. Level thresholds ──────────────────────────────────────────────
check('39.9km is on-track', levelFromDriftKm(39.9) === 'on-track')
check('40km is minor (boundary)', levelFromDriftKm(40) === 'minor')
check('99.9km is minor', levelFromDriftKm(99.9) === 'minor')
check('100km is significant (boundary)', levelFromDriftKm(100) === 'significant')
check('0km is on-track', levelFromDriftKm(0) === 'on-track')

// ── 2. Compass heading ───────────────────────────────────────────────
check('bearing 0 -> N', headingFromBearing(0) === 'N')
check('bearing 90 -> E', headingFromBearing(90) === 'E')
check('bearing 180 -> S', headingFromBearing(180) === 'S')
check('bearing 270 -> W', headingFromBearing(270) === 'W')
check('bearing 100 -> ESE', headingFromBearing(100) === 'ESE')

// ── 3. Snapshot capture eligibility ──────────────────────────────────
const now = new Date('2026-09-14T12:00:00Z')
function snapAgeH(h: number): DriftSnapshotInput {
  return { issuedAtUtc: new Date(now.getTime() - h * 3_600_000).toISOString(), points: [] }
}
check('no snapshots -> should capture', shouldCaptureSnapshot([], now) === true)
check('snapshot 2h old -> should NOT capture', shouldCaptureSnapshot([snapAgeH(2)], now) === false)
check('snapshot 7h old -> should capture', shouldCaptureSnapshot([snapAgeH(7)], now) === true)

// ── 4. Pruning ────────────────────────────────────────────────────────
const pruned = pruneSnapshots([snapAgeH(20), snapAgeH(40)], now)
check('pruning drops the 40h-old snapshot', pruned.length === 1, pruned)
check('pruning keeps the 20h-old snapshot',
  pruned.length === 1 && pruned[0].issuedAtUtc === snapAgeH(20).issuedAtUtc, pruned)

// ── 5. Snapshot selection for the check ──────────────────────────────
check('single 10h-old snapshot is outside the window -> null',
  pickSnapshotForCheck([snapAgeH(10)], now) === null)
const chosen = pickSnapshotForCheck([snapAgeH(21), snapAgeH(26), snapAgeH(10)], now)
check('picks the snapshot closest to 24h (26h beats 21h)',
  chosen !== null && chosen.issuedAtUtc === snapAgeH(26).issuedAtUtc, chosen)

// ── 6. computeDrift ───────────────────────────────────────────────────
// A forecast issued 24h ago, predicting hourly positions moving steadily
// NW. "Actual" position sits almost exactly where hour=24 predicted.
function trackPoints(): Array<{ lat: number; lon: number; hour: number }> {
  const pts = []
  for (let h = 0; h <= 48; h += 6) pts.push({ lat: 13 + h * 0.05, lon: 128 - h * 0.08, hour: h })
  return pts
}
const snap24 = { issuedAtUtc: snapAgeH(24).issuedAtUtc, points: trackPoints() }
// hour=24 predicted: lat=13+24*0.05=14.2, lon=128-24*0.08=126.08
const onTrackActual = { lat: 14.22, lon: 126.06 }   // a couple km off
const onTrack = computeDrift('TESTSTORM', snap24, onTrackActual, now)
check('on-track case resolves', onTrack !== null, onTrack)
check('on-track driftKm is small', !!onTrack && onTrack.driftKm < 10, onTrack?.driftKm)
check('on-track level is on-track', onTrack?.level === 'on-track', onTrack?.level)
check('on-track headline says "Tracking within"',
  !!onTrack && onTrack.headline.startsWith('Tracking within'), onTrack?.headline)

const farActual = { lat: 16.5, lon: 123.5 }   // well off the predicted point
const significant = computeDrift('TESTSTORM', snap24, farActual, now)
check('significant case resolves', significant !== null, significant)
check('significant driftKm exceeds 100', !!significant && significant.driftKm > 100, significant?.driftKm)
check('significant level is significant', significant?.level === 'significant')
check('significant headline mentions "track has shifted"',
  !!significant && significant.headline.includes('track has shifted'), significant?.headline)
const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
check('significant heading is a real compass point',
  !!significant && COMPASS.includes(significant.heading), significant?.heading)

// Snapshot whose own forecast doesn't reach this far out.
const shortSnap = { issuedAtUtc: snapAgeH(24).issuedAtUtc, points: trackPoints().filter(p => p.hour <= 12) }
check('snapshot not covering the elapsed lead time returns null',
  computeDrift('TESTSTORM', shortSnap, onTrackActual, now) === null)

// ── 7. Notification transition logic ─────────────────────────────────
check('first-ever check notifies (undefined -> on-track)', shouldNotifyTransition(undefined, 'on-track') === true)
check('same level twice does not notify', shouldNotifyTransition('on-track', 'on-track') === false)
check('escalation notifies', shouldNotifyTransition('on-track', 'minor') === true)
check('recovery notifies', shouldNotifyTransition('significant', 'on-track') === true)

check('notification title includes storm name',
  driftNotificationTitle(significant!).includes('TESTSTORM'), driftNotificationTitle(significant!))
check('significant notification title has the shifted-track wording',
  driftNotificationTitle(significant!).includes('Track has shifted'), driftNotificationTitle(significant!))

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it to confirm it fails (the module doesn't exist yet)**

From `frontend/`:
```
npx tsc __check_forecastDrift.ts --outDir /tmp/fd-build --module commonjs --target es2022 --moduleResolution node --skipLibCheck --esModuleInterop
```
Expected: compile error — `Cannot find module './lib/forecastDrift'`.

- [ ] **Step 3: Write `frontend/lib/forecastDrift.ts`**

```ts
// ── Forecast drift: is the storm still tracking as predicted? ───────
// Every other forecast feature here compares agencies against each other
// (spread score, uncertainty cone). This compares the storm's ACTUAL
// current position against what our OWN AI Ensemble forecast said it
// would be, checked back ~24h later — a live check on the model this
// project owns, not on third-party agencies.
//
// Pure: no React, no storage. The hook (useForecastDrift.ts) owns
// snapshot persistence and calls into this module.

import { interpolateTrackAt, haversineKm, bearingDeg, type LatLon } from './uncertainty'

export type DriftLevel = 'on-track' | 'minor' | 'significant'

export interface DriftCheck {
  storm: string
  checkedAtUtc: string
  issuedAtUtc: string          // which snapshot this compared against
  leadHours: number            // rounded actual gap between issuedAtUtc and now
  predictedPosition: LatLon
  actualPosition: LatLon
  driftKm: number
  heading: string               // 16-point compass, e.g. "N", "ESE"
  level: DriftLevel
  headline: string
}

/** The forecast snapshot shape the hook persists; this module only reads it. */
export interface DriftSnapshotInput {
  issuedAtUtc: string           // ISO
  points: Array<{ lat: number; lon: number; hour: number }>
}

// ── Tunables ────────────────────────────────────────────────────────
const ON_TRACK_MAX_KM = 40      // below typical short-term positional noise
const MINOR_MAX_KM = 100        // typical 24h agency track error in this region is ~60-100km
const TARGET_LOOKBACK_H = 24    // "yesterday's forecast for right now"
const MIN_LOOKBACK_H = 18       // tolerance window around the 24h target
const MAX_LOOKBACK_H = 30
export const SNAPSHOT_INTERVAL_H = 6   // matches BEST_TRACK_STEP_H elsewhere
export const SNAPSHOT_MAX_AGE_H = 36   // 24h check + slack for the tolerance window

const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']

export function levelFromDriftKm(km: number): DriftLevel {
  if (km < ON_TRACK_MAX_KM) return 'on-track'
  if (km < MINOR_MAX_KM) return 'minor'
  return 'significant'
}

/** 16-point compass heading from a great-circle bearing in degrees. */
export function headingFromBearing(bearing: number): string {
  return COMPASS[Math.round(bearing / 22.5) % 16]
}

/**
 * Should a new snapshot of the current forecast be captured, given the
 * snapshots already stored for this storm? True when none exists within
 * the last SNAPSHOT_INTERVAL_H hours.
 */
export function shouldCaptureSnapshot(existing: DriftSnapshotInput[], now: Date): boolean {
  const cutoff = now.getTime() - SNAPSHOT_INTERVAL_H * 3_600_000
  return !existing.some(s => new Date(s.issuedAtUtc).getTime() > cutoff)
}

/** Drop snapshots older than SNAPSHOT_MAX_AGE_H — nothing needs to look back further. */
export function pruneSnapshots(existing: DriftSnapshotInput[], now: Date): DriftSnapshotInput[] {
  const cutoff = now.getTime() - SNAPSHOT_MAX_AGE_H * 3_600_000
  return existing.filter(s => new Date(s.issuedAtUtc).getTime() >= cutoff)
}

/**
 * Pick, from a storm's stored snapshots, the one whose age is closest to
 * the 24h target, among those within the 18-30h tolerance window. Returns
 * null when none qualify (storm just started being tracked, or the
 * 6-hourly cadence hasn't produced one old enough yet).
 */
export function pickSnapshotForCheck(
  snapshots: DriftSnapshotInput[],
  now: Date,
): DriftSnapshotInput | null {
  let best: DriftSnapshotInput | null = null
  let bestDelta = Infinity
  for (const snap of snapshots) {
    const ageH = (now.getTime() - new Date(snap.issuedAtUtc).getTime()) / 3_600_000
    if (ageH < MIN_LOOKBACK_H || ageH > MAX_LOOKBACK_H) continue
    const delta = Math.abs(ageH - TARGET_LOOKBACK_H)
    if (delta < bestDelta) { bestDelta = delta; best = snap }
  }
  return best
}

/**
 * Compare the storm's actual current position against where `snapshot`
 * (issued some hours ago) forecast it would be right now. Returns null
 * when the snapshot's own forecast doesn't cover this many hours out
 * (interpolateTrackAt refuses to extrapolate past a track's own range).
 */
export function computeDrift(
  storm: string,
  snapshot: DriftSnapshotInput,
  actual: LatLon,
  now: Date = new Date(),
): DriftCheck | null {
  const issuedAtMs = new Date(snapshot.issuedAtUtc).getTime()
  const leadHoursExact = (now.getTime() - issuedAtMs) / 3_600_000
  const predicted = interpolateTrackAt(snapshot.points, leadHoursExact)
  if (!predicted) return null

  const driftKm = haversineKm(predicted.lat, predicted.lon, actual.lat, actual.lon)
  const heading = headingFromBearing(bearingDeg(predicted, actual))
  const level = levelFromDriftKm(driftKm)
  const leadHours = Math.round(leadHoursExact)
  const driftKmRounded = Math.round(driftKm)

  const headline = level === 'on-track'
    ? `Tracking within ${driftKmRounded}km of the +${leadHours}h forecast.`
    : `Now ${driftKmRounded}km ${heading} of where the +${leadHours}h forecast placed it — ` +
      (level === 'minor' ? 'minor drift.' : 'track has shifted.')

  return {
    storm,
    checkedAtUtc: now.toISOString(),
    issuedAtUtc: snapshot.issuedAtUtc,
    leadHours,
    predictedPosition: predicted,
    actualPosition: actual,
    driftKm: driftKmRounded,
    heading,
    level,
    headline,
  }
}

/** True when a drift check should trigger a notification: the level differs
 *  from the last one notified for this storm (undefined counts as differing,
 *  so the first-ever check for a storm always notifies once). */
export function shouldNotifyTransition(lastLevel: DriftLevel | undefined, newLevel: DriftLevel): boolean {
  return lastLevel !== newLevel
}

const DRIFT_NOTIFICATION_TITLE: Record<DriftLevel, string> = {
  'on-track':    '✅ Forecast holding',
  'minor':       '📈 Track drift',
  'significant': '⚠️ Track has shifted',
}

/** Notification title for a drift check, e.g. "⚠️ Track has shifted — GONI". */
export function driftNotificationTitle(check: DriftCheck): string {
  return `${DRIFT_NOTIFICATION_TITLE[check.level]} — ${check.storm}`
}
```

- [ ] **Step 4: Run the test script and verify it passes**

```
npx tsc __check_forecastDrift.ts --outDir /tmp/fd-build --module commonjs --target es2022 --moduleResolution node --skipLibCheck --esModuleInterop
node /tmp/fd-build/__check_forecastDrift.js
```
Expected: `ALL CHECKS PASSED` and every line reads `PASS`. If any `FAIL`
lines appear, fix `lib/forecastDrift.ts` (not the test) and rerun — the
test's expected values were hand-derived from the design's thresholds in
Step 1's comments, not from the implementation.

- [ ] **Step 5: Delete the temporary test file**

```
rm frontend/__check_forecastDrift.ts
```
(The build output at `/tmp/fd-build` is scratch and does not need cleanup
tracking — it is outside the repo.)

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/forecastDrift.ts
git commit -m "Add forecast drift computation (lib/forecastDrift.ts)

Pure module: snapshot capture eligibility, drift computation against a
stored forecast snapshot, and notification-transition logic. Reuses
interpolateTrackAt/haversineKm/bearingDeg from lib/uncertainty.ts rather
than duplicating them.

Verified with a throwaway script (deleted): 27 assertions covering
threshold boundaries, compass headings, snapshot capture/prune/selection,
on-track and significant drift cases, a snapshot too short to cover the
elapsed lead time, and the notification transition rule in both
directions.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `frontend/hooks/useForecastDrift.ts` — the web hook

**Files:**
- Create: `frontend/hooks/useForecastDrift.ts`

**Interfaces:**
- Consumes: everything Task 1 produces, from `@/lib/forecastDrift`. Also
  `ModelTrack` from `@/lib/forecastModels` (existing type, already used by
  `useParBroadcastEngine.ts:10`).
- Produces (used by Task 3): `useForecastDrift(storms: Array<{ info: {
  name: string; lat: number; lon: number } }>, modelTracks: Record<string,
  ModelTrack[]>): Record<string, DriftCheck>` — a plain object keyed by
  storm name, only containing entries for storms with a resolvable drift
  check right now.

- [ ] **Step 1: Write `frontend/hooks/useForecastDrift.ts`**

```ts
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
```

- [ ] **Step 2: Verify it type-checks**

From `frontend/`:
```
npx tsc --noEmit
```
Expected: no errors. (This hook is not yet imported anywhere, so this step
only proves the file itself is well-typed in isolation — Task 3 wires it
in and re-checks the whole app.)

- [ ] **Step 3: Commit**

```bash
git add frontend/hooks/useForecastDrift.ts
git commit -m "Add useForecastDrift hook (web)

Owns persisted snapshot history and notification dedup in localStorage
(key headsup:forecastDrift:v1, namespaced separately from
useParBroadcastEngine's headsup:parBroadcast:v1). Fires a browser
Notification on every level transition, gated on Notification.permission
directly (matches useParBroadcastEngine's self-contained pattern rather
than depending on ParAlerts' opt-in UI). Snapshots for a storm that drops
out of the live feed keep aging out via the same 36h prune even after it
stops appearing in `storms`, so a dissipated storm's history doesn't sit
in localStorage forever.

Not yet wired into any component — Task 3 does that.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Wire the drift line into the web banner

**Files:**
- Modify: `frontend/components/alerts/ParAlerts.tsx`
- Modify: `frontend/components/map/HurricaneTracker.tsx`

**Interfaces:**
- Consumes: `useForecastDrift` from Task 2; `DriftCheck`, `DriftLevel` types
  from Task 1.
- Produces: `ParAlert.drift?: DriftCheck | null` — read by any future
  consumer of `ParAlert`, same optional-field convention as the existing
  `ParAlert.headline?: string`.

- [ ] **Step 1: Add the `drift` field and rendering to `ParAlerts.tsx`**

In `frontend/components/alerts/ParAlerts.tsx`, add the import (near the
existing `@/lib/uncertainty` import at line 6):

```ts
import type { DriftCheck, DriftLevel } from '@/lib/forecastDrift'
```

Add the field to the `ParAlert` interface (after the existing `headline?:
string` line):

```ts
  /** Optional override — the 3-hour broadcast engine swaps in the latest snapshot text. */
  headline?: string
  /** How the storm's actual position compares to the forecast issued ~24h
   *  ago — absent until useForecastDrift has a check ready, merged in by
   *  the caller exactly like `headline` is. */
  drift?: DriftCheck | null
}
```

Add a small color map next to `STYLE` (after the existing `STYLE` const):

```ts
const DRIFT_COLOR: Record<DriftLevel, string> = {
  'on-track':    '#34C759',
  'minor':       '#FF9500',
  'significant': '#FF3B30',
}
const DRIFT_ICON: Record<DriftLevel, string> = {
  'on-track':    '📍',
  'minor':       '📈',
  'significant': '⚠️',
}
```

Add the rendering block right after the existing spread-advice block
(after the `{a.uncertainty && !a.uncertainty.simulated && ...}` block, still
inside the same banner `<div>`):

```tsx
            {/* Forecast drift: how the actual position compares to what our
                own AI Ensemble forecast ~24h ago. Always shown once a check
                exists — unlike the spread-advice line, on-track is itself
                useful information, not silence. */}
            {a.drift && (
              <div className="flex items-center gap-1.5 mt-1 text-[11px]"
                style={{ color: DRIFT_COLOR[a.drift.level] }}>
                <span>{DRIFT_ICON[a.drift.level]}</span><span>{a.drift.headline}</span>
              </div>
            )}
```

- [ ] **Step 2: Wire the hook into `HurricaneTracker.tsx`**

In `frontend/components/map/HurricaneTracker.tsx`, add the import (next to
the existing `useParBroadcastEngine` import at line 10):

```ts
import { useForecastDrift } from '@/hooks/useForecastDrift'
```

Call the hook and merge its output, replacing the existing
`alertsWithHeadlines` block (around line 552–566) with:

```tsx
  // ── PAR geo-fence alerts — current positions + all 10 model trajectories ──
  const parAlerts = useMemo(() => computeParAlerts(storms, modelTracks), [storms, modelTracks])

  // ── 3-hour broadcast loop for storms inside the PAR ──
  const { log: broadcastLog, toast: broadcastToast, dismissToast, clearLog, latestHeadlines } =
    useParBroadcastEngine(storms, modelTracks, parAlerts)

  // ── Forecast drift — every tracked storm, not gated by PAR status ──
  const driftByStorm = useForecastDrift(storms, modelTracks)

  // The crimson banner text follows the newest 3-hour snapshot; the drift
  // line is merged in the same way, independently of PAR status.
  const alertsWithHeadlines = useMemo(
    () => parAlerts.map(a => {
      let next = a
      if (a.status === 'inside' && latestHeadlines[a.storm]) next = { ...next, headline: latestHeadlines[a.storm] }
      if (driftByStorm[a.storm]) next = { ...next, drift: driftByStorm[a.storm] }
      return next
    }),
    [parAlerts, latestHeadlines, driftByStorm],
  )
```

- [ ] **Step 3: Verify it type-checks and builds**

From `frontend/`:
```
npx tsc --noEmit
```
Expected: no errors.

```
npx next build
```
Expected: build succeeds (matches the check already run for the
uncertainty-cone feature earlier in this project).

- [ ] **Step 4: Manual smoke test with a seeded snapshot**

A real 24h-old snapshot can't be produced by waiting — instead seed one
directly via the browser console, which exercises the exact same
`computeDrift`/`pickSnapshotForCheck` path the hook uses.

1. Start the backend (`python app.py` from `backend/`) and the frontend
   (`npm run dev` from `frontend/`, on a port with live storm data — or use
   the Demo Scenario to get a storm on screen).
2. With the app open and Hurricane Tracker active, open the browser
   console and run:
   ```js
   const KEY = 'headsup:forecastDrift:v1'
   const now = Date.now()
   // Use whatever storm name is currently on screen, e.g. from the banner.
   const stormName = 'KROVANH'
   const state = {
     snapshots: {
       [stormName]: [{
         issuedAtUtc: new Date(now - 24 * 3_600_000).toISOString(),
         points: [
           { lat: 13.0, lon: 128.0, hour: 0 },
           { lat: 14.2, lon: 126.08, hour: 24 },
           { lat: 15.0, lon: 124.5, hour: 48 },
         ],
       }],
     },
     lastNotifiedLevel: {},
   }
   localStorage.setItem(KEY, JSON.stringify(state))
   location.reload()
   ```
3. After reload, confirm the banner for that storm shows a new line
   starting with either "Tracking within", "Now …km … minor drift.", or
   "Now …km … track has shifted." — whichever applies given the storm's
   actual current position vs. the seeded `{14.2, 126.08}` prediction.
4. If browser notifications are enabled (the existing "🔔 Enable typhoon
   PAR notifications" opt-in), confirm exactly one notification fired for
   this transition, titled with the matching emoji/level from
   `driftNotificationTitle`.
5. Reload again without touching localStorage — confirm the banner line
   still shows (same check recomputes) but **no second notification**
   fires (same level, no transition).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/alerts/ParAlerts.tsx frontend/components/map/HurricaneTracker.tsx
git commit -m "Wire forecast drift into the web PAR banner

ParAlert gains an optional drift field, merged in by HurricaneTracker the
same way the 3-hour broadcast engine's headline override already is —
computeParAlerts itself is untouched. The line is always shown once a
check exists, in a level-colored row alongside the existing spread-advice
line.

Verified: tsc clean, next build passes, and a seeded 24h-old snapshot
(browser console, since a real one takes 24 real hours to age in) shows
the correct banner line and fires exactly one notification per level
transition, none on a repeat poll at the same level.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `mobile/lib/forecastDrift.ts` — mirror the pure module

**Files:**
- Create: `mobile/lib/forecastDrift.ts` (byte-for-byte copy of
  `frontend/lib/forecastDrift.ts` — it only imports from `./uncertainty`,
  which mobile already has with identical exports, confirmed: both
  `frontend/lib/uncertainty.ts` and `mobile/lib/uncertainty.ts` export
  `interpolateTrackAt`, `haversineKm`, `bearingDeg`, `LatLon` under the same
  names. No import path or content changes are needed.)
- Test (temporary, deleted at the end of this task): `mobile/__check_forecastDrift.ts`

**Interfaces:**
- Produces: identical exports to Task 1, from `mobile/lib/forecastDrift.ts`
  — consumed by Task 6's mobile hook.

- [ ] **Step 1: Copy the file**

```bash
cp frontend/lib/forecastDrift.ts mobile/lib/forecastDrift.ts
```

- [ ] **Step 2: Write the test script**

Create `mobile/__check_forecastDrift.ts`:

```ts
// Throwaway verification for lib/forecastDrift.ts — not part of the app.
import {
  levelFromDriftKm, headingFromBearing, shouldCaptureSnapshot, pruneSnapshots,
  pickSnapshotForCheck, computeDrift, shouldNotifyTransition, driftNotificationTitle,
  type DriftSnapshotInput,
} from './lib/forecastDrift'

let failures = 0
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { console.log(`  PASS  ${name}`) }
  else { failures++; console.log(`  FAIL  ${name}`, extra ?? '') }
}

// ── 1. Level thresholds ──────────────────────────────────────────────
check('39.9km is on-track', levelFromDriftKm(39.9) === 'on-track')
check('40km is minor (boundary)', levelFromDriftKm(40) === 'minor')
check('99.9km is minor', levelFromDriftKm(99.9) === 'minor')
check('100km is significant (boundary)', levelFromDriftKm(100) === 'significant')
check('0km is on-track', levelFromDriftKm(0) === 'on-track')

// ── 2. Compass heading ───────────────────────────────────────────────
check('bearing 0 -> N', headingFromBearing(0) === 'N')
check('bearing 90 -> E', headingFromBearing(90) === 'E')
check('bearing 180 -> S', headingFromBearing(180) === 'S')
check('bearing 270 -> W', headingFromBearing(270) === 'W')
check('bearing 100 -> ESE', headingFromBearing(100) === 'ESE')

// ── 3. Snapshot capture eligibility ──────────────────────────────────
const now = new Date('2026-09-14T12:00:00Z')
function snapAgeH(h: number): DriftSnapshotInput {
  return { issuedAtUtc: new Date(now.getTime() - h * 3_600_000).toISOString(), points: [] }
}
check('no snapshots -> should capture', shouldCaptureSnapshot([], now) === true)
check('snapshot 2h old -> should NOT capture', shouldCaptureSnapshot([snapAgeH(2)], now) === false)
check('snapshot 7h old -> should capture', shouldCaptureSnapshot([snapAgeH(7)], now) === true)

// ── 4. Pruning ────────────────────────────────────────────────────────
const pruned = pruneSnapshots([snapAgeH(20), snapAgeH(40)], now)
check('pruning drops the 40h-old snapshot', pruned.length === 1, pruned)
check('pruning keeps the 20h-old snapshot',
  pruned.length === 1 && pruned[0].issuedAtUtc === snapAgeH(20).issuedAtUtc, pruned)

// ── 5. Snapshot selection for the check ──────────────────────────────
check('single 10h-old snapshot is outside the window -> null',
  pickSnapshotForCheck([snapAgeH(10)], now) === null)
const chosen = pickSnapshotForCheck([snapAgeH(21), snapAgeH(26), snapAgeH(10)], now)
check('picks the snapshot closest to 24h (26h beats 21h)',
  chosen !== null && chosen.issuedAtUtc === snapAgeH(26).issuedAtUtc, chosen)

// ── 6. computeDrift ───────────────────────────────────────────────────
// A forecast issued 24h ago, predicting hourly positions moving steadily
// NW. "Actual" position sits almost exactly where hour=24 predicted.
function trackPoints(): Array<{ lat: number; lon: number; hour: number }> {
  const pts = []
  for (let h = 0; h <= 48; h += 6) pts.push({ lat: 13 + h * 0.05, lon: 128 - h * 0.08, hour: h })
  return pts
}
const snap24 = { issuedAtUtc: snapAgeH(24).issuedAtUtc, points: trackPoints() }
// hour=24 predicted: lat=13+24*0.05=14.2, lon=128-24*0.08=126.08
const onTrackActual = { lat: 14.22, lon: 126.06 }   // a couple km off
const onTrack = computeDrift('TESTSTORM', snap24, onTrackActual, now)
check('on-track case resolves', onTrack !== null, onTrack)
check('on-track driftKm is small', !!onTrack && onTrack.driftKm < 10, onTrack?.driftKm)
check('on-track level is on-track', onTrack?.level === 'on-track', onTrack?.level)
check('on-track headline says "Tracking within"',
  !!onTrack && onTrack.headline.startsWith('Tracking within'), onTrack?.headline)

const farActual = { lat: 16.5, lon: 123.5 }   // well off the predicted point
const significant = computeDrift('TESTSTORM', snap24, farActual, now)
check('significant case resolves', significant !== null, significant)
check('significant driftKm exceeds 100', !!significant && significant.driftKm > 100, significant?.driftKm)
check('significant level is significant', significant?.level === 'significant')
check('significant headline mentions "track has shifted"',
  !!significant && significant.headline.includes('track has shifted'), significant?.headline)
const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
check('significant heading is a real compass point',
  !!significant && COMPASS.includes(significant.heading), significant?.heading)

// Snapshot whose own forecast doesn't reach this far out.
const shortSnap = { issuedAtUtc: snapAgeH(24).issuedAtUtc, points: trackPoints().filter(p => p.hour <= 12) }
check('snapshot not covering the elapsed lead time returns null',
  computeDrift('TESTSTORM', shortSnap, onTrackActual, now) === null)

// ── 7. Notification transition logic ─────────────────────────────────
check('first-ever check notifies (undefined -> on-track)', shouldNotifyTransition(undefined, 'on-track') === true)
check('same level twice does not notify', shouldNotifyTransition('on-track', 'on-track') === false)
check('escalation notifies', shouldNotifyTransition('on-track', 'minor') === true)
check('recovery notifies', shouldNotifyTransition('significant', 'on-track') === true)

check('notification title includes storm name',
  driftNotificationTitle(significant!).includes('TESTSTORM'), driftNotificationTitle(significant!))
check('significant notification title has the shifted-track wording',
  driftNotificationTitle(significant!).includes('Track has shifted'), driftNotificationTitle(significant!))

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
```

This is identical in content to `frontend/__check_forecastDrift.ts` from
Task 1 — the point of this task is proving the copied module behaves
identically, so the test asserting the same things is intentional, not
duplication to avoid.

- [ ] **Step 3: Compile and run it**

From `mobile/`:
```
npx tsc __check_forecastDrift.ts --outDir /tmp/fd-build-mobile --module commonjs --target es2022 --moduleResolution node --skipLibCheck --esModuleInterop
node /tmp/fd-build-mobile/__check_forecastDrift.js
```
Expected: `ALL CHECKS PASSED`, identical to Task 1's result — this proves
the copy is faithful, not a new implementation to debug.

- [ ] **Step 4: Delete the temporary test file**

```bash
rm mobile/__check_forecastDrift.ts
```

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/forecastDrift.ts
git commit -m "Mirror lib/forecastDrift.ts into mobile

Exact copy of frontend/lib/forecastDrift.ts — same pattern already used
for par.ts, tcws.ts, and uncertainty.ts. Verified with the identical
throwaway check script (deleted): all 27 assertions pass, confirming the
copy is faithful.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Add AsyncStorage to the mobile app

**Files:**
- Modify: `mobile/package.json` (via `expo install`, not a hand-edit)

**Interfaces:**
- Produces: the `@react-native-async-storage/async-storage` package,
  importable as `import AsyncStorage from
  '@react-native-async-storage/async-storage'` — consumed by Task 6.

This is genuinely new: confirmed no AsyncStorage usage or dependency
anywhere in `mobile/` today (`hooks/useLocation.tsx:3` even has a comment
noting persistence would be "an easy later addition" — this is that
addition, for a different hook).

- [ ] **Step 1: Install via Expo's version-matching installer**

From `mobile/`:
```bash
npx expo install @react-native-async-storage/async-storage
```
This picks the exact version compatible with the project's Expo SDK 54,
rather than whatever `npm install` would resolve to.

- [ ] **Step 2: Verify the import resolves**

From `mobile/`:
```bash
npx tsc --noEmit
```
Expected: no errors (nothing imports the package yet, so this only proves
the install didn't break anything existing).

- [ ] **Step 3: Commit**

```bash
git add mobile/package.json mobile/package-lock.json
git commit -m "Add AsyncStorage dependency for mobile drift persistence

Installed via 'npx expo install' so the version matches Expo SDK 54
exactly, rather than an npm-resolved version that might not. Not yet
imported anywhere — Task 6 uses it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `mobile/hooks/useForecastDrift.ts` — the mobile hook

**Files:**
- Create: `mobile/hooks/useForecastDrift.ts`

**Interfaces:**
- Consumes: everything Task 4 produces from `../lib/forecastDrift`;
  `scheduleLocalNotification` from `../lib/notifications.ts` (existing,
  signature `(title: string, body: string) => Promise<void>`, confirmed at
  `mobile/lib/notifications.ts:32`); `ModelTrack`, `LiveStorm` from
  `../lib/types.ts` (existing).
- Produces (used by Task 7): `useForecastDrift(storms: LiveStorm[],
  modelTracks: Record<string, ModelTrack[]>): Record<string, DriftCheck>`
  — same shape as the web hook's return value.

**Why this differs from the web hook:** AsyncStorage reads are
asynchronous (unlike web's synchronous `localStorage`), so persisted state
has to hydrate in its own effect before the main check effect is allowed to
run — otherwise a check running before storage has loaded would see empty
history and treat an existing storm as brand new every time the app opens.

- [ ] **Step 1: Write `mobile/hooks/useForecastDrift.ts`**

```ts
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
```

- [ ] **Step 2: Verify it type-checks**

From `mobile/`:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/hooks/useForecastDrift.ts
git commit -m "Add useForecastDrift hook (mobile)

Ported from the web hook. AsyncStorage reads are async, so state hydrates
in its own effect before the main check effect runs — otherwise a check
running before storage loads would see empty history and treat an
existing storm as brand new on every app open. Same storage key
(headsup:forecastDrift:v1), same level-transition notification rule as
web delivered via the existing scheduleLocalNotification wrapper, and the
same dissipated-storm prune sweep so AsyncStorage doesn't grow forever
for storms no longer in the live feed.

Not yet wired into any screen — Task 7 does that.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Wire the drift line into the mobile Alerts tab

**Files:**
- Modify: `mobile/lib/alerts.ts`
- Modify: `mobile/hooks/useStormData.tsx`
- Modify: `mobile/app/(tabs)/alerts.tsx`

**Interfaces:**
- Consumes: `useForecastDrift` from Task 6; `DriftCheck`, `DriftLevel`
  types from Task 4.
- Produces: `ParAlert.drift?: DriftCheck | null` (mobile's `ParAlert`,
  mirroring web's Task 3 addition).

- [ ] **Step 1: Add the `drift` field to mobile's `ParAlert`**

In `mobile/lib/alerts.ts`, add the import (next to the existing
`./uncertainty` import at line 8):

```ts
import type { DriftCheck } from './forecastDrift'
```

Add the field to the `ParAlert` interface (after the existing `uncertainty:
UncertaintyScore | null` line):

```ts
  /** How far apart the agency forecasts are — null when too few tracks to judge. */
  uncertainty: UncertaintyScore | null
  /** How the storm's actual position compares to the forecast issued ~24h
   *  ago — absent until useForecastDrift has a check ready, merged in by
   *  the caller. */
  drift?: DriftCheck | null
}
```

`computeParAlerts` itself needs no change — same convention as web, where
this field is merged in externally, never set inside the pure alert
builder.

- [ ] **Step 2: Wire the hook into `useStormData.tsx`**

In `mobile/hooks/useStormData.tsx`, add `useMemo` to the existing React
import (line 10) and the hook import:

```ts
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
```
```ts
import { useForecastDrift } from './useForecastDrift'
```

Inside `StormDataProvider`, call the hook and merge its output into the
alerts exposed via context. Add this right before the `const value:
StormData = {` block (after the `demoStatus` computation, around line 281):

```tsx
  // ── Forecast drift — every tracked storm, not gated by PAR status ──
  const driftByStorm = useForecastDrift(storms, modelTracks)
  const alertsWithDrift = useMemo(
    () => alerts.map(a => driftByStorm[a.storm] ? { ...a, drift: driftByStorm[a.storm] } : a),
    [alerts, driftByStorm],
  )
```

Then change the `value` object to expose `alertsWithDrift` instead of the
raw `alerts` state:

```tsx
  const value: StormData = {
    storms, forecasts, modelTracks, alerts: alertsWithDrift, source, loading, refreshing, error, lastUpdated,
```

- [ ] **Step 3: Render the line in the Alerts tab**

In `mobile/app/(tabs)/alerts.tsx`, add the import (next to the existing
`../../lib/uncertainty` import at line 12):

```ts
import type { DriftLevel } from '../../lib/forecastDrift'
```

Add a color/icon map near `STATUS_META` (after it, before `AlertsScreen`):

```ts
const DRIFT_META: Record<DriftLevel, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  'on-track':    { color: colors.success, icon: 'checkmark-circle' },
  'minor':       { color: colors.warn,    icon: 'trending-up' },
  'significant': { color: colors.danger,  icon: 'warning' },
}
```

In `AlertBanner`, add the rendering block right after the existing
spread-advice block (after the `{spreadAdvice && u && (...)}` block, still
inside the same `<View style={{ flex: 1 }}>`):

```tsx
        {/* Forecast drift: how the actual position compares to what our
            own AI Ensemble forecast ~24h ago. Always shown once a check
            exists — unlike the spread-advice line above, on-track is
            itself useful information, not silence. */}
        {alert.drift && (
          <View style={[styles.actionRow, { borderLeftColor: DRIFT_META[alert.drift.level].color }]}>
            <Ionicons name={DRIFT_META[alert.drift.level].icon} size={13} color={DRIFT_META[alert.drift.level].color} />
            <Text style={styles.actionText}>{alert.drift.headline}</Text>
          </View>
        )}
```

- [ ] **Step 4: Verify it type-checks**

From `mobile/`:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/alerts.ts mobile/hooks/useStormData.tsx "mobile/app/(tabs)/alerts.tsx"
git commit -m "Wire forecast drift into the mobile Alerts tab

ParAlert gains an optional drift field, merged into the alerts exposed by
StormDataProvider the same way computeParAlerts' own fields are —
computeParAlerts itself is untouched. Rendered as a new row in
AlertBanner, colored and iconed by level, always shown once a check
exists.

Verified: tsc clean. Not run on a device — this feature, like the
uncertainty cone before it, is type-checked but unseen on Expo Go.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Cross-platform verification pass

**Files:** none created or modified — this task only verifies Tasks 1–7
together.

- [ ] **Step 1: Full web verification**

From `frontend/`:
```bash
npx tsc --noEmit
npx next build
```
Expected: both succeed with no errors — this is the same pair of checks
already used to verify the uncertainty-cone feature earlier in this
project.

- [ ] **Step 2: Full mobile verification**

From `mobile/`:
```bash
npx tsc --noEmit
```
Expected: succeeds with no errors.

- [ ] **Step 3: Re-run both platforms' pure-module checks together**

Confirm Task 1 and Task 4's throwaway scripts still both pass when run
back-to-back against the final state of both files (catches any drift
between the two copies introduced by later edits):

```bash
cd frontend
cp lib/forecastDrift.ts /tmp/fd-web-final.ts
cd ../mobile
cp lib/forecastDrift.ts /tmp/fd-mobile-final.ts
diff /tmp/fd-web-final.ts /tmp/fd-mobile-final.ts
```
Expected: no output from `diff` — the two files are still byte-identical.
If they've diverged, that's a real bug to fix before proceeding (the two
copies are supposed to stay in lockstep, same as `par.ts`/`tcws.ts`).

- [ ] **Step 4: Document the mobile device-testing gap**

This feature has not been run on an actual device or in Expo Go — only
type-checked, exactly as the uncertainty-cone feature (spread chip, cone
toggle) was left in the prior session. No action to take here beyond
recording it: if/when a device walkthrough happens for that earlier
feature, do this one in the same pass, using Task 3 Step 4's seeded-
snapshot technique adapted to AsyncStorage (set the key via a temporary
debug button or Expo's dev menu, rather than a browser console).

- [ ] **Step 5: Confirm the Demo Scenario is unaffected**

Start the Demo Scenario (web: the "Demo Scenario" button in the model
legend; mobile: the Demo Scenario controls on the Map tab) and confirm:
- No crash, no console error mentioning `forecastDrift` or
  `useForecastDrift`.
- No drift line appears during the replay (expected and correct — the
  spec's "Interaction with the Demo Scenario" section: a demo replaying in
  minutes never produces a real 24h-old snapshot, and this plan does not
  fake one).

- [ ] **Step 6: Final commit (if Step 3 required any fix)**

Only commit here if Step 3 found and required fixing a divergence between
the two `lib/forecastDrift.ts` copies. If everything already matched,
skip this step — Task 8 is verification-only and produces no new commit
by default.
