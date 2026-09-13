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
