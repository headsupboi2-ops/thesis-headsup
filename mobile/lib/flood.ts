// ── Flood Potential Index ───────────────────────────────────────────
// Forecast rainfall accumulation × local flood susceptibility → a 0–1 score
// and a categorical level. Rainfall thresholds follow PAGASA's 24-hour
// heavy-rainfall guidance (yellow ≈ 50 mm, orange ≈ 100 mm, red ≈ 200 mm).
// A RISK INDEX from forecast data — not a surveyed flood depth.

/** Minimal grid point — both the mobile and web weather grids satisfy this. */
export interface RainPoint { lat: number; lon: number; precip: (number | null)[] }

export type FloodLevel = 'severe' | 'high' | 'moderate' | 'low' | 'none'

export interface FloodPotential {
  level: FloodLevel
  score: number      // 0–1, for the colour ramp
  rainMm: number     // accumulated rainfall driving it (whole mm)
  susceptibility: number
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** Inverse-distance sample of cumulative rainfall (mm) at a location over the
 *  half-open hour window [fromH, toH). */
export function rainAccum(points: RainPoint[], lat: number, lon: number, fromH: number, toH: number): number {
  let num = 0, den = 0
  for (const p of points) {
    let sum = 0
    const upper = Math.min(toH, p.precip.length)
    for (let h = Math.max(0, fromH); h < upper; h++) {
      const v = p.precip[h]
      if (v != null && Number.isFinite(v)) sum += v
    }
    const dlat = lat - p.lat, dlon = lon - p.lon, d2 = dlat * dlat + dlon * dlon
    if (d2 < 1e-6) return sum
    const w = 1 / d2
    num += w * sum; den += w
  }
  return den > 0 ? num / den : 0
}

/** Combine accumulated rainfall (mm) with a 0–1 susceptibility into a flood
 *  score + level. Susceptibility scales the rainfall response: a floodplain
 *  (~0.85) amplifies a given rain, uplands (~0.15) shed it. */
/** Score → level. Shared so the 24 h timeline and the summary card can never
 *  disagree about where 'high' starts. */
export function levelForScore(score: number): FloodLevel {
  return score >= 0.7 ? 'severe'
    : score >= 0.5 ? 'high'
    : score >= 0.3 ? 'moderate'
    : score >= 0.12 ? 'low'
    : 'none'
}

export function floodPotential(rainMm: number, susceptibility: number): FloodPotential {
  const rainScore = clamp01(rainMm / 220)                       // ~220 mm/day → max base
  const score = clamp01(rainScore * (0.55 + 0.9 * clamp01(susceptibility)))
  return { level: levelForScore(score), score, rainMm: Math.round(rainMm), susceptibility }
}

// ── Tide-modulated 24-hour timeline ─────────────────────────────────
// Built from the SAME rainfall the Rain Radar layer draws, accumulated and then
// scaled by the tide, hour by hour:
//
//   Rain Radar mm/h  →  rolling 24 h accumulation  →  × susceptibility
//                                                  →  × tide factor  =  risk
//
// Rain drives it. The tide only makes a given rainfall better or worse — it can
// never manufacture a flood out of dry weather.

/** How far the tide may move the score at full tidal influence: ±25 % between
 *  the station's lowest low and highest high. A judgement value, not a measured
 *  coefficient — small enough that rain always dominates, large enough to tell
 *  a high-tide hour from a low-tide one. */
export const TIDE_SWING = 0.25

/**
 * Multiplier applied to a rainfall-driven flood score.
 *
 * @param tideNorm       0 = lowest low water, 1 = highest high water
 * @param tidalInfluence 0 = beyond the tide's reach (upland), 1 = tide-locked
 * @returns exactly 1 when the barangay has no tidal influence, else 1 ± TIDE_SWING·influence
 */
export function tideFactor(tideNorm: number, tidalInfluence: number): number {
  const n = clamp01(tideNorm), infl = clamp01(tidalInfluence)
  return 1 + TIDE_SWING * infl * (2 * n - 1)
}

export interface FloodHour {
  hourIndex: number    // index into the rain grid — the Rain Radar's own hour
  ms: number           // wall-clock instant this hour represents
  rain1h: number       // mm/h — the exact value the Rain Radar paints here
  rainMm: number       // rolling trailing-24 h accumulation (drives the level)
  tideM: number | null
  tideNorm: number
  factor: number       // tide multiplier applied to the score
  baseScore: number    // score before the tide
  score: number        // after the tide
  level: FloodLevel
}

/**
 * 24 hourly flood-risk entries starting at rain-grid index `fromH`.
 *
 * Each hour is scored from the trailing 24 h of rainfall, so `floodPotential`'s
 * PAGASA calibration applies unchanged — and risk keeps climbing for a while
 * after a downpour ends, which is how a catchment actually behaves.
 *
 * `tideAt` maps an instant to that hour's tide, or null when tide data is
 * unavailable — in which case the factor is exactly 1 and the timeline degrades
 * to pure rainfall rather than guessing.
 */
export function floodTimeline(
  points: RainPoint[],
  lat: number,
  lon: number,
  susceptibility: number,
  tidalInfluence: number,
  fromH: number,
  msAt: (hourIndex: number) => number,
  tideAt: (ms: number) => { heightM: number; norm: number } | null,
  count = 24,
): FloodHour[] {
  const out: FloodHour[] = []
  for (let k = 0; k < count; k++) {
    const h = fromH + k
    const rainMm = rainAccum(points, lat, lon, h - 23, h + 1)   // trailing 24 h, including h
    const rain1h = rainAccum(points, lat, lon, h, h + 1)
    const base = floodPotential(rainMm, susceptibility)

    const ms = msAt(h)
    const tide = tideAt(ms)
    const factor = tide ? tideFactor(tide.norm, tidalInfluence) : 1
    const score = clamp01(base.score * factor)

    out.push({
      hourIndex: h, ms, rain1h, rainMm: base.rainMm,
      tideM: tide ? tide.heightM : null,
      tideNorm: tide ? tide.norm : 0.5,
      factor, baseScore: base.score, score,
      level: levelForScore(score),
    })
  }
  return out
}

// ── Rising-risk alerting ────────────────────────────────────────────

const LEVEL_RANK: Record<FloodLevel, number> = { none: 0, low: 1, moderate: 2, high: 3, severe: 4 }

/** Ordinal for a level, so levels can be compared rather than string-matched. */
export const floodLevelRank = (l: FloodLevel): number => LEVEL_RANK[l]

/** Lowest level worth interrupting someone for. Below this the card still shows
 *  the risk; we just do not push it at them. */
export const ALERT_MIN_LEVEL: FloodLevel = 'moderate'

/**
 * Should a rise from `prev` to `next` raise an alert?
 *
 * @param prev the last level seen FOR THIS AREA, or null if this area has not
 *             been observed yet — switching barangay must not read as a rise,
 *             and a first look at an already-dangerous area is still news.
 *
 * Falling risk is deliberately silent: the card and timeline still show it.
 */
export function shouldAlert(prev: FloodLevel | null, next: FloodLevel): boolean {
  if (floodLevelRank(next) < floodLevelRank(ALERT_MIN_LEVEL)) return false
  return prev === null || floodLevelRank(next) > floodLevelRank(prev)
}

/** The hour a warning should be pinned to: highest score, earliest on a tie. */
export function peakHour(hours: FloodHour[]): FloodHour | null {
  let best: FloodHour | null = null
  for (const h of hours) if (!best || h.score > best.score) best = h
  return best
}

const FLOOD_META: Record<FloodLevel, { color: string; word: string; advice: string }> = {
  severe:   { color: '#b026ff', word: 'Severe',   advice: 'Serious flooding expected: evacuate low-lying/riverside areas.' },
  high:     { color: '#ff3b30', word: 'High',     advice: 'Flooding likely in low-lying areas: prepare to move valuables and go.' },
  moderate: { color: '#ff9500', word: 'Moderate', advice: 'Localized flooding possible, watch water levels and advisories.' },
  low:      { color: '#e1e100', word: 'Low',      advice: 'Minor pooling possible, stay aware.' },
  none:     { color: '#39d98a', word: 'Minimal',  advice: 'No significant rainfall flooding expected.' },
}
export const floodMeta = (l: FloodLevel) => FLOOD_META[l]
