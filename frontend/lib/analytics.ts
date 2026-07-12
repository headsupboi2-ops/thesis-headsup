// ── Predictive Analytics data layer ─────────────────────────────────
// Types + fetch helpers for the model-performance report page. Everything
// is fetched live from the backend — no metrics are hardcoded here.
import { API_BASE } from './constants'

// ── /api/analytics/model-performance ────────────────────────────────
export interface TrackMetricRow {
  n: number
  rmse: number
  mae: number
  std: number
  p50: number
  p90: number
}

export interface PerClassMetric {
  label: string
  precision: number
  recall: number
  f1: number
  support: number
}

export interface ModelPerformance {
  mode: string
  train_years: number[]
  test_years: number[]
  n_test_storms: number
  track_metrics: Record<string, TrackMetricRow>   // key = lead hour ("6".."168")
  skill_scores: Record<string, number>
  classification: { accuracy: number; macro_f1: number }
  per_class: PerClassMetric[]
  plots: Partial<Record<'confusion_matrix' | 'track_error_plot', string>>
  generated_at: string
}

/** Lead-hour keys sorted numerically, as a convenience for charts. */
export function sortedLeadHours(m: ModelPerformance): number[] {
  return Object.keys(m.track_metrics).map(Number).sort((a, b) => a - b)
}

/** Split the parsed classification table into real classes vs the avg rows. */
export function splitPerClass(rows: PerClassMetric[]): {
  classes: PerClassMetric[]
  averages: PerClassMetric[]
} {
  const isAvg = (l: string) => /avg|average/i.test(l)
  return {
    classes: rows.filter(r => !isAvg(r.label)),
    averages: rows.filter(r => isAvg(r.label)),
  }
}

// ── /api/realtime-storms ────────────────────────────────────────────
export interface LiveStormSummary {
  name: string
  lat: number
  lon: number
  wind_speed: number
  pressure?: number
  category: number
  source?: string
  path?: Array<{ lat: number; lon: number; pressure?: number; wind_speed?: number }>
}

export interface RealtimeStormsResponse {
  status: string
  source: string
  count: number
  storms: LiveStormSummary[]
  generated_at?: string
}

// ── /api/climate/outlook ────────────────────────────────────────────
export interface ClimateOutlook {
  status: string
  month: number
  month_name: string
  target_year: number
  n_years: number
  avg_storms: number
  max_storms: number
  max_year: number
  activity_level: string
  per_year_counts: Record<string, number>
  analogs: Array<{ year: number; storms: number }>
  forecast_text: string
}

// ── Fetch helpers (relative URLs → next.config proxy → Flask) ────────
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try { msg = (await res.json())?.error ?? msg } catch { /* non-JSON body */ }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

export const fetchModelPerformance = () =>
  getJson<ModelPerformance>('/api/analytics/model-performance')

export const fetchRealtimeStorms = () =>
  getJson<RealtimeStormsResponse>('/api/realtime-storms')

export const fetchClimateOutlook = () =>
  getJson<ClimateOutlook>('/api/climate/outlook')
