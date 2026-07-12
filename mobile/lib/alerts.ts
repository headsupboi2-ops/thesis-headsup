// ── PAR geo-fence alert computation ─────────────────────────────────
// Ported from the web app. Given active storms (and, when available, their
// forecast tracks) it classifies each against the PAR polygon.
import { distanceToParKm, firstParEntryHour, isInPar } from './par'
import type { LiveStorm, ForecastStep } from './types'

export type ParAlertStatus = 'inside' | 'approaching' | 'watch'

export interface ParAlert {
  storm: string
  status: ParAlertStatus
  category: number
  windKt: number
  etaHours: number | null
  distanceKm: number
}

const WATCH_DISTANCE_KM = 300

export function computeParAlerts(
  storms: LiveStorm[],
  forecasts: Record<string, ForecastStep[]>,
): ParAlert[] {
  const alerts: ParAlert[] = []
  for (const s of storms) {
    const base = { storm: s.name, category: s.category, windKt: Math.round(s.wind_speed) }
    if (isInPar(s.lat, s.lon)) {
      alerts.push({ ...base, status: 'inside', etaHours: null, distanceKm: 0 })
      continue
    }
    const fc = forecasts[s.name] ?? []
    const entry = fc.length ? firstParEntryHour(fc) : null
    const distanceKm = distanceToParKm(s.lat, s.lon)
    if (entry !== null) {
      alerts.push({ ...base, status: 'approaching', etaHours: entry, distanceKm })
    } else if (distanceKm <= WATCH_DISTANCE_KM) {
      alerts.push({ ...base, status: 'watch', etaHours: null, distanceKm })
    }
  }
  const rank: Record<ParAlertStatus, number> = { inside: 0, approaching: 1, watch: 2 }
  return alerts.sort((a, b) => rank[a.status] - rank[b.status])
}

export function etaLabel(h: number): string {
  const d = Math.floor(h / 24), r = h % 24
  return d > 0 ? `~${d}d ${r}h` : `~${r}h`
}

export function alertHeadline(a: ParAlert): string {
  if (a.status === 'inside') return `${a.storm} has entered the PAR`
  if (a.status === 'approaching') return `${a.storm} may enter the PAR in ${etaLabel(a.etaHours ?? 0)}`
  return `${a.storm} is near the PAR boundary (${a.distanceKm} km)`
}
