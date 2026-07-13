// ── Personal impact from the 10-model ensemble ──────────────────────
// For a location, turn the ensemble into a strike probability, ETA window,
// closest approach, and expected TCWS. Pure + unit-testable.
import { closestApproach, type TrackPt } from './geo'
import { tcwsFromWind, type Tcws } from './tcws'

export interface ModelLite { model: string; label?: string; color: string; source: 'live' | 'mock'; points: TrackPt[] }
export type RiskLevel = 'high' | 'moderate' | 'watch' | 'clear'

export interface Impact {
  storm: string
  strikeProbability: number    // 0..1 — share of models within STRIKE_KM
  striking: number
  total: number
  closestKm: number            // nearest any model brings it
  etaEarliest: number | null   // hours until closest approach (earliest striking model)
  etaLatest: number | null
  expectedWindKt: number | null
  tcws: Tcws | null
  level: RiskLevel
  perModel: Array<{ model: string; color: string; source: string; distanceKm: number; hour: number }>
}

export const STRIKE_KM = 100
export const WATCH_KM = 300

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/** Impact of one storm's ensemble on a location. `fallbackWindKt` covers
 *  tracks whose points carry no wind (e.g. a live agency track). */
export function computeImpact(
  storm: string, models: ModelLite[], lat: number, lon: number, fallbackWindKt: number,
): Impact | null {
  const cas = models
    .map(m => ({ m, ca: closestApproach(m.points, lat, lon) }))
    .filter((x): x is { m: ModelLite; ca: NonNullable<ReturnType<typeof closestApproach>> } => x.ca !== null)
  if (!cas.length) return null

  const total = cas.length
  const striking = cas.filter(x => x.ca.distanceKm <= STRIKE_KM)
  const closestKm = Math.min(...cas.map(x => x.ca.distanceKm))
  const etas = striking.map(x => x.ca.hour)
  const etaEarliest = etas.length ? Math.min(...etas) : null
  const etaLatest = etas.length ? Math.max(...etas) : null

  const winds = striking.map(x => x.ca.windKt ?? fallbackWindKt).filter((w): w is number => w != null)
  const expectedWindKt = winds.length ? median(winds) : (striking.length ? fallbackWindKt : null)
  const tcws = expectedWindKt != null ? tcwsFromWind(expectedWindKt) : null

  const strikeProbability = striking.length / total
  const level: RiskLevel =
    strikeProbability >= 0.5 ? 'high'
    : strikeProbability > 0 ? 'moderate'
    : closestKm <= WATCH_KM ? 'watch'
    : 'clear'

  return {
    storm, strikeProbability, striking: striking.length, total, closestKm,
    etaEarliest, etaLatest, expectedWindKt, tcws, level,
    perModel: cas.map(x => ({ model: x.m.model, color: x.m.color, source: x.m.source, distanceKm: x.ca.distanceKm, hour: x.ca.hour })),
  }
}

/** Among several storms' impacts, the one that most threatens the location. */
export function mostThreatening(impacts: Impact[]): Impact | null {
  if (!impacts.length) return null
  return [...impacts].sort((a, b) =>
    b.strikeProbability - a.strikeProbability || a.closestKm - b.closestKm)[0]
}

const RISK_META: Record<RiskLevel, { color: string; word: string }> = {
  high:     { color: '#ff3b30', word: 'High risk' },
  moderate: { color: '#ff9500', word: 'Possible' },
  watch:    { color: '#e1e100', word: 'Watch' },
  clear:    { color: '#39d98a', word: 'All clear' },
}
export const riskMeta = (l: RiskLevel) => RISK_META[l]
