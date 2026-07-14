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
export function floodPotential(rainMm: number, susceptibility: number): FloodPotential {
  const rainScore = clamp01(rainMm / 220)                       // ~220 mm/day → max base
  const score = clamp01(rainScore * (0.55 + 0.9 * clamp01(susceptibility)))
  const level: FloodLevel =
    score >= 0.7 ? 'severe'
    : score >= 0.5 ? 'high'
    : score >= 0.3 ? 'moderate'
    : score >= 0.12 ? 'low'
    : 'none'
  return { level, score, rainMm: Math.round(rainMm), susceptibility }
}

const FLOOD_META: Record<FloodLevel, { color: string; word: string; advice: string }> = {
  severe:   { color: '#b026ff', word: 'Severe',   advice: 'Serious flooding expected — evacuate low-lying/riverside areas.' },
  high:     { color: '#ff3b30', word: 'High',     advice: 'Flooding likely in low-lying areas — prepare to move valuables and go.' },
  moderate: { color: '#ff9500', word: 'Moderate', advice: 'Localized flooding possible — watch water levels and advisories.' },
  low:      { color: '#e1e100', word: 'Low',      advice: 'Minor pooling possible — stay aware.' },
  none:     { color: '#39d98a', word: 'Minimal',  advice: 'No significant rainfall flooding expected.' },
}
export const floodMeta = (l: FloodLevel) => FLOOD_META[l]
