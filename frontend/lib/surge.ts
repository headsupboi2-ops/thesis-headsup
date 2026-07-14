// ── Storm-Surge Risk ────────────────────────────────────────────────
// Approximate PAGASA-style storm-surge guidance from a storm's peak wind,
// how close it comes, and the coastline's exposure. Coastal locations only —
// inland places (e.g. Naga) correctly return 'none'. A RISK INDEX, not a
// hydrodynamic surge model.
import type { CoastalExposure } from './hazard'

export type SurgeLevel = 'high' | 'moderate' | 'low' | 'none'

export interface Surge {
  level: SurgeLevel
  band: string          // approximate surge-height band, e.g. "2–3 m"
  etaH: number | null   // hours to the storm's closest approach
}

function band(m: number): string {
  if (m < 0.5) return '< 0.5 m'
  if (m < 1.5) return '0.5–1.5 m'
  if (m < 3) return '1.5–3 m'
  if (m < 4) return '3–4 m'
  return '4 m+'
}

/** Surge risk for a coastal location from the threatening storm.
 *  `peakWindKt` = storm's peak wind near closest approach, `closestKm` = how
 *  near it comes, `exposure` = coastline type at the location. */
export function surgeRisk(
  peakWindKt: number, closestKm: number, etaH: number | null, exposure: CoastalExposure,
): Surge {
  if (exposure === 'none') return { level: 'none', band: '—', etaH: null }        // inland
  if (peakWindKt < 34 || closestKm > 300) return { level: 'none', band: band(0), etaH }

  // Rough surge height (m) from intensity — TS ~1 m, Cat1 ~2, Cat2 ~3, Cat3 ~4,
  // Cat4 ~5, Cat5 ~6 — then scaled by exposure and how close the storm comes.
  const baseM =
    peakWindKt < 64 ? 1 : peakWindKt < 83 ? 2 : peakWindKt < 96 ? 3
    : peakWindKt < 113 ? 4 : peakWindKt < 137 ? 5 : 6
  const expF = exposure === 'open' ? 1 : 0.6                                       // open coast worst
  const distF = closestKm <= 50 ? 1 : closestKm <= 120 ? 0.7 : 0.4
  const m = baseM * expF * distF

  const level: SurgeLevel = m >= 3 ? 'high' : m >= 1.5 ? 'moderate' : m >= 0.5 ? 'low' : 'none'
  return { level, band: band(m), etaH }
}

const SURGE_META: Record<SurgeLevel, { color: string; word: string }> = {
  high:     { color: '#ff3b30', word: 'High' },
  moderate: { color: '#ff9500', word: 'Moderate' },
  low:      { color: '#e1e100', word: 'Low' },
  none:     { color: '#39d98a', word: 'None' },
}
export const surgeMeta = (l: SurgeLevel) => SURGE_META[l]
