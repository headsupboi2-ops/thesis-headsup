// ── Forecast uncertainty from multi-model ensemble spread ───────────
// How much do the 10 agencies disagree? The mean distance of their
// positions from their own centroid at a given forecast hour IS the
// ensemble spread — the standard measure of track confidence. A tight
// cluster means the landfall zone is well constrained; a wide fan means
// the center line should not be trusted on its own.
//
// Everything here is pure so it can be unit-tested and reused by the
// alert banner, the 3-hour broadcast engine, and the map cone.

import type { ModelTrack } from './forecastModels'
import { isInPar } from './par'

const RAD = Math.PI / 180
const EARTH_R = 6371

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * RAD
  const dLon = (bLon - aLon) * RAD
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.sqrt(s))
}

export interface LatLon { lat: number; lon: number }

/** Initial great-circle bearing (degrees) from a → b. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD)
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) -
    Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD)
  return (Math.atan2(y, x) / RAD + 360) % 360
}

/** Point reached by travelling `distKm` from `from` along `bearing` (degrees). */
export function destinationPoint(from: LatLon, bearing: number, distKm: number): LatLon {
  const d = distKm / EARTH_R
  const br = bearing * RAD
  const lat1 = from.lat * RAD
  const lon1 = from.lon * RAD
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br))
  const lon2 = lon1 + Math.atan2(
    Math.sin(br) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
  )
  return { lat: lat2 / RAD, lon: ((lon2 / RAD + 540) % 360) - 180 }
}

/**
 * Position of one track at an arbitrary forecast hour, linearly
 * interpolated between the two bracketing points. Returns null when the
 * hour falls outside the track's range — extrapolating a forecast would
 * invent confidence we do not have.
 */
export function interpolateTrackAt(
  points: Array<{ lat: number; lon: number; hour: number }>,
  hour: number,
): LatLon | null {
  if (points.length === 0) return null
  const first = points[0]
  const last = points[points.length - 1]
  if (hour < first.hour || hour > last.hour) return null
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (p.hour === hour) return { lat: p.lat, lon: p.lon }
    if (p.hour > hour) {
      const prev = points[i - 1]
      if (!prev) return { lat: p.lat, lon: p.lon }
      const span = p.hour - prev.hour
      const t = span === 0 ? 0 : (hour - prev.hour) / span
      return {
        lat: prev.lat + (p.lat - prev.lat) * t,
        lon: prev.lon + (p.lon - prev.lon) * t,
      }
    }
  }
  return { lat: last.lat, lon: last.lon }
}

export interface SpreadAtHour {
  hour: number
  centroid: LatLon
  /** Mean distance of the model positions from their centroid (km). */
  meanKm: number
  /** Distance of the furthest model from the centroid (km). */
  maxKm: number
  /** How many tracks actually resolved at this hour. */
  n: number
}

/** Ensemble spread at one forecast hour. Needs ≥2 tracks to mean anything. */
export function spreadAtHour(tracks: ModelTrack[], hour: number): SpreadAtHour | null {
  const pts: LatLon[] = []
  for (const t of tracks) {
    const p = interpolateTrackAt(t.points, hour)
    if (p) pts.push(p)
  }
  if (pts.length < 2) return null
  const centroid = {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
  }
  let sum = 0
  let max = 0
  for (const p of pts) {
    const d = haversineKm(p.lat, p.lon, centroid.lat, centroid.lon)
    sum += d
    if (d > max) max = d
  }
  return { hour, centroid, meanKm: sum / pts.length, maxKm: max, n: pts.length }
}

/**
 * Forecast hours to evaluate: every hour present on the densest track,
 * ascending. Individual hours still drop out of the cone when fewer than
 * two tracks reach them.
 */
export function ensembleHours(tracks: ModelTrack[]): number[] {
  let best: ModelTrack | null = null
  for (const t of tracks) {
    if (!best || t.points.length > best.points.length) best = t
  }
  if (!best) return []
  const seen: Record<number, true> = {}
  const hours: number[] = []
  for (const p of best.points) {
    if (!seen[p.hour]) { seen[p.hour] = true; hours.push(p.hour) }
  }
  return hours.sort((a, b) => a - b)
}

// ── Scoring ─────────────────────────────────────────────────────────

export type UncertaintyLevel = 'low' | 'moderate' | 'high'

export interface UncertaintyScore {
  level: UncertaintyLevel
  /** Mean spread (km) at the scored hour — the headline number. */
  spreadKm: number
  /** Furthest model from the centroid (km) — the cone radius at that hour. */
  maxSpreadKm: number
  atHour: number
  /** Tracks whose forecast enters the PAR. */
  agreeing: number
  total: number
  /** Tracks from a genuine agency feed (rather than the mock generator). */
  liveCount: number
  /** True when too few live feeds contribute for the spread to be meaningful. */
  simulated: boolean
}

/** Hour the spread is scored at — far enough out to be decision-relevant. */
const SCORE_HOUR = 48
/** Mean-spread thresholds (km) separating the three confidence levels. */
const LOW_MAX_KM = 100
const MODERATE_MAX_KM = 250
/**
 * Fewer live agency feeds than this and the spread mostly measures our own
 * mock generator, so it must be labelled simulated rather than reported as
 * a confidence level.
 */
const MIN_LIVE_FOR_CONFIDENCE = 3

export function levelFromSpread(meanKm: number): UncertaintyLevel {
  if (meanKm < LOW_MAX_KM) return 'low'
  if (meanKm < MODERATE_MAX_KM) return 'moderate'
  return 'high'
}

/**
 * Score how uncertain the forecast is.
 *
 * `applySplitRule` bumps a tight-looking ensemble to at least 'moderate'
 * when the models split on the *outcome* — between 30% and 70% of them
 * enter the PAR. A cluster that is tight in kilometres but half-misses the
 * boundary is still a coin flip for anyone deciding whether to evacuate.
 * Pass false once the storm is already inside, where PAR entry is settled.
 */
export function scoreUncertainty(
  tracks: ModelTrack[] | undefined,
  opts: { applySplitRule?: boolean } = {},
): UncertaintyScore | null {
  if (!tracks?.length) return null

  // Prefer +48 h; fall back to the furthest hour where ≥2 tracks resolve.
  let spread = spreadAtHour(tracks, SCORE_HOUR)
  if (!spread) {
    for (const h of [...ensembleHours(tracks)].reverse()) {
      spread = spreadAtHour(tracks, h)
      if (spread) break
    }
  }
  if (!spread) return null

  const agreeing = tracks.filter(t => t.points.some(p => isInPar(p.lat, p.lon))).length
  const liveCount = tracks.filter(t => t.source === 'live').length

  let level = levelFromSpread(spread.meanKm)
  if (opts.applySplitRule !== false && tracks.length >= 3) {
    const ratio = agreeing / tracks.length
    if (ratio >= 0.3 && ratio <= 0.7 && level === 'low') level = 'moderate'
  }

  return {
    level,
    spreadKm: Math.round(spread.meanKm),
    maxSpreadKm: Math.round(spread.maxKm),
    atHour: spread.hour,
    agreeing,
    total: tracks.length,
    liveCount,
    simulated: liveCount < MIN_LIVE_FOR_CONFIDENCE,
  }
}

export const UNCERTAINTY_META: Record<UncertaintyLevel, {
  label: string; short: string; color: string; advice: string
}> = {
  low: {
    label: 'High confidence',
    short: 'TIGHT',
    color: '#34C759',
    advice: 'Agencies agree closely on the track, plan around the forecast path.',
  },
  moderate: {
    label: 'Moderate uncertainty',
    short: 'SPREAD',
    color: '#FF9500',
    advice: 'Agencies differ on where this lands, prepare even if you are off the center line.',
  },
  high: {
    label: 'Low confidence',
    short: 'WIDE SPREAD',
    color: '#FF3B30',
    advice: 'Forecasts disagree strongly, a wide area is at risk. Do not rely on the center line.',
  },
}

/** One-line summary for a banner or notification. */
export function uncertaintyText(s: UncertaintyScore): string {
  const m = UNCERTAINTY_META[s.level]
  const basis = s.simulated ? 'simulated spread' : `${s.liveCount} live feeds`
  return `${m.label}: models spread ${s.spreadKm} km at +${s.atHour}h (${basis})`
}

// ── Cone geometry ───────────────────────────────────────────────────

export interface ConeRing { hour: number; center: LatLon; radiusKm: number }

/**
 * Cone radius per forecast hour: the distance from the ensemble centroid
 * to the furthest model, so every agency's track lies inside the cone.
 *
 * The radius is forced non-decreasing. Raw ensemble spread can contract at
 * a given hour when tracks happen to cross, which renders as a pinched
 * waist that reads as a bug; real forecast cones only widen with lead time.
 *
 * `origin` (the storm's current position) becomes a zero-radius apex.
 */
export function coneRings(tracks: ModelTrack[], origin?: LatLon): ConeRing[] {
  const rings: ConeRing[] = []
  let running = 0
  for (const h of ensembleHours(tracks)) {
    const s = spreadAtHour(tracks, h)
    if (!s) continue
    running = Math.max(running, s.maxKm)
    rings.push({ hour: h, center: s.centroid, radiusKm: running })
  }
  if (!rings.length) return []
  if (origin) rings.unshift({ hour: 0, center: origin, radiusKm: 0 })
  return rings
}

/** Arc resolution for the end caps and the joints between segments. */
const CAP_STEPS = 10
const JOINT_STEPS = 3

/**
 * Points along a circle from `fromBearing`, sweeping `sweepDeg` (signed).
 *
 * The points are pushed out to the CIRCUMSCRIBED radius, so the chords
 * between them lie on or outside the true circle. Sampling the circle
 * exactly would inscribe the polygon, and a model sitting at precisely the
 * cone radius would then fall a few km outside the drawn outline.
 */
function arcPoints(
  center: LatLon, radiusKm: number, fromBearing: number, sweepDeg: number, steps: number,
): LatLon[] {
  const halfStep = Math.abs(sweepDeg) / steps / 2
  const r = radiusKm / Math.cos(halfStep * RAD)
  const out: LatLon[] = []
  for (let k = 0; k <= steps; k++) {
    const b = (fromBearing + (sweepDeg * k) / steps + 720) % 360
    out.push(destinationPoint(center, b, r))
  }
  return out
}

/** Signed difference between two bearings, in (-180, 180]. */
function bearingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

/**
 * Drop rings wholly swallowed by a neighbour. The union of the circles is
 * unchanged by removing them, and leaving them in breaks the external
 * tangent construction below (which needs the centers further apart than
 * the difference of the radii).
 */
function pruneContainedRings(rings: ConeRing[]): ConeRing[] {
  const out: ConeRing[] = []
  for (const r of rings) {
    const prev = out[out.length - 1]
    if (prev) {
      const d = haversineKm(prev.center.lat, prev.center.lon, r.center.lat, r.center.lon)
      if (d + prev.radiusKm <= r.radiusKm) { out.pop() }        // prev inside r
      else if (d + r.radiusKm <= prev.radiusKm) { continue }    // r inside prev
    }
    out.push(r)
  }
  return out
}

/**
 * Cone outline as a closed ring of [lat, lon] pairs.
 *
 * The cone is the UNION of the per-hour uncertainty circles, not a
 * constant-width ribbon around the center line. A ribbon looks similar but
 * leaks: a model displaced along-track rather than across-track falls
 * outside it, which would break the one claim the cone makes — that every
 * agency's forecast lies inside.
 *
 * The boundary is traced with external tangent lines between consecutive
 * circles (offset by asin(Δr/d) to account for the cone widening), joined
 * by short arcs, and closed with a cap at each end.
 */
export function buildConePolygon(rings: ConeRing[]): Array<[number, number]> | null {
  const r = pruneContainedRings(rings.filter(x => x.radiusKm >= 0))
  if (r.length === 0) return null

  // Degenerate case: one meaningful circle — return the circle itself.
  if (r.length === 1) {
    if (r[0].radiusKm <= 0) return null
    return arcPoints(r[0].center, r[0].radiusKm, 0, 360, CAP_STEPS * 3)
      .map(p => [p.lat, p.lon] as [number, number])
  }

  // Tangent bearings per segment: left = θ−90−α, right = θ+90+α.
  const leftB: number[] = []
  const rightB: number[] = []
  for (let i = 0; i < r.length - 1; i++) {
    const a = r[i], b = r[i + 1]
    const d = haversineKm(a.center.lat, a.center.lon, b.center.lat, b.center.lon)
    const th = bearingDeg(a.center, b.center)
    const dr = b.radiusKm - a.radiusKm
    const alpha = d > Math.abs(dr) ? Math.asin(dr / d) / RAD : 0
    leftB.push((th - 90 - alpha + 360) % 360)
    rightB.push((th + 90 + alpha + 360) % 360)
  }

  const left: LatLon[] = []
  const right: LatLon[] = []
  for (let i = 0; i < r.length - 1; i++) {
    // Arc across the joint on circle i, so the outline never cuts a chord
    // through a circle when the track bends.
    if (i > 0 && r[i].radiusKm > 0) {
      left.push(...arcPoints(r[i].center, r[i].radiusKm, leftB[i - 1],
        bearingDelta(leftB[i - 1], leftB[i]), JOINT_STEPS))
      right.push(...arcPoints(r[i].center, r[i].radiusKm, rightB[i - 1],
        bearingDelta(rightB[i - 1], rightB[i]), JOINT_STEPS))
    }
    left.push(destinationPoint(r[i].center, leftB[i], r[i].radiusKm))
    left.push(destinationPoint(r[i + 1].center, leftB[i], r[i + 1].radiusKm))
    right.push(destinationPoint(r[i].center, rightB[i], r[i].radiusKm))
    right.push(destinationPoint(r[i + 1].center, rightB[i], r[i + 1].radiusKm))
  }

  const lastSeg = r.length - 2
  const last = r[r.length - 1]
  const first = r[0]

  // Front cap: left tangent → around the nose → right tangent.
  const endCap = last.radiusKm > 0
    ? arcPoints(last.center, last.radiusKm, leftB[lastSeg],
        ((bearingDelta(leftB[lastSeg], rightB[lastSeg]) + 360) % 360) || 180, CAP_STEPS)
    : []

  // Back cap: right tangent → around the tail → left tangent.
  const startCap = first.radiusKm > 0
    ? arcPoints(first.center, first.radiusKm, rightB[0],
        ((bearingDelta(rightB[0], leftB[0]) + 360) % 360) || 180, CAP_STEPS)
    : []

  return [...left, ...endCap, ...right.reverse(), ...startCap]
    .map(p => [p.lat, p.lon] as [number, number])
}
