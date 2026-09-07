// ── Tide series for the Naga flood model ────────────────────────────
// Sea level at San Miguel Bay, the tidal boundary of the Bicol River system
// that drains Naga. Naga is ~20 km inland and has no tide of its own; what
// matters there is that a high tide holds the river up and stops the city
// draining, so rain falling on a high tide floods worse than the same rain on
// a low one. See lib/flood.ts for how this is applied.
import { API_BASE } from './config'

export type TideKind = 'high' | 'low'

export interface TideExtreme {
  hour_index: number    // nearest hourly sample
  hour_exact: number    // parabola-refined, so 21:12 does not become 21:00
  time_utc: string
  height_m: number
  type: TideKind
}

export interface TideSeries {
  station: { name: string; lat: number; lon: number }
  n_hours: number
  start_utc: string     // instant of heights[0]
  min_m: number
  max_m: number
  heights: (number | null)[]
  extremes: TideExtreme[]
}

export async function fetchTides(signal?: AbortSignal): Promise<TideSeries> {
  const res = await fetch(`${API_BASE}/api/weather/tides`, { cache: 'no-store', signal })
  if (!res.ok) throw new Error(`Tide request failed (${res.status})`)
  const json = await res.json()
  if (!Array.isArray(json.heights) || !json.heights.length) throw new Error('Tide response had no heights')
  return json as TideSeries
}

/** Milliseconds for an ISO instant, tolerating a missing trailing Z (the API
 *  returns UTC either way, but `new Date('...T00:00')` would be read as local). */
export function utcMs(iso: string): number {
  return Date.parse(/[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
}

/** Index into `series` for a given instant. The rain grid and the tide series
 *  come from two different providers and are NOT guaranteed to start at the
 *  same hour, so every cross-reference goes through wall-clock time rather than
 *  assuming the two index axes line up. */
export function indexAt(startUtc: string, ms: number): number {
  return Math.round((ms - utcMs(startUtc)) / 3_600_000)
}

/** The instant that index `i` of a series represents. */
export function msAtIndex(startUtc: string, i: number): number {
  return utcMs(startUtc) + i * 3_600_000
}

/** Tide height at an arbitrary instant, linearly interpolated between the two
 *  surrounding hourly samples. Returns null when the instant is outside the
 *  series or the samples are missing. */
export function tideHeightAt(tide: TideSeries, ms: number): number | null {
  const exact = (ms - utcMs(tide.start_utc)) / 3_600_000
  if (exact < 0 || exact > tide.heights.length - 1) return null
  const i = Math.floor(exact)
  const a = tide.heights[i]
  const b = tide.heights[Math.min(i + 1, tide.heights.length - 1)]
  if (a == null) return null
  if (b == null) return a
  return a + (b - a) * (exact - i)
}

/** Where a height sits in this station's own range, 0 (lowest low) → 1 (highest
 *  high). Normalising against the station's actual range keeps the model honest
 *  for any station, rather than hard-coding Philippine tide amplitudes. */
export function tideNormalised(tide: TideSeries, heightM: number): number {
  const span = tide.max_m - tide.min_m
  if (!(span > 0.05)) return 0.5          // no meaningful tide — treat as neutral
  return Math.max(0, Math.min(1, (heightM - tide.min_m) / span))
}

/** Tide turning points falling inside [fromMs, toMs). */
export function extremesBetween(tide: TideSeries, fromMs: number, toMs: number): TideExtreme[] {
  return tide.extremes.filter(e => {
    const t = utcMs(e.time_utc)
    return t >= fromMs && t < toMs
  })
}

/** The next high and next low tide after `fromMs`, for the summary row. */
export function nextTides(tide: TideSeries, fromMs: number): { high: TideExtreme | null; low: TideExtreme | null } {
  let high: TideExtreme | null = null, low: TideExtreme | null = null
  for (const e of tide.extremes) {
    if (utcMs(e.time_utc) < fromMs) continue
    if (e.type === 'high' && !high) high = e
    if (e.type === 'low' && !low) low = e
    if (high && low) break
  }
  return { high, low }
}
