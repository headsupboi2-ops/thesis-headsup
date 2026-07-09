// ── Multi-model ensemble forecast tracks (10 agencies) ─────────────
// Ids and colors must match backend/scripts/multi_model_tracks.py.

export type ForecastModelId =
  | 'PAGASA' | 'JTWC' | 'JMA' | 'ECMWF' | 'GFS'
  | 'CWB' | 'HKO' | 'CMA' | 'UKMO' | 'AI_ENSEMBLE'

// Design tokens — high-contrast on dark radar and deep-red heat layers
export const MODEL_COLORS: Record<ForecastModelId, string> = {
  PAGASA:      '#FF3B30', // Vibrant Red — local authority
  JTWC:        '#34C759', // Green
  JMA:         '#007AFF', // Blue
  ECMWF:       '#AF52DE', // Purple
  GFS:         '#FF9500', // Orange
  CWB:         '#5AC8FA', // Cyan
  HKO:         '#FFD60A', // Yellow
  CMA:         '#FF2D55', // Pink
  UKMO:        '#00C7BE', // Teal
  AI_ENSEMBLE: '#FFFFFF', // White — our in-house model
}

export const MODEL_META: Record<ForecastModelId, { label: string; agency: string }> = {
  PAGASA:      { label: 'PAGASA',       agency: 'Philippine Atmospheric, Geophysical and Astronomical Services Administration' },
  JTWC:        { label: 'JTWC',         agency: 'Joint Typhoon Warning Center (US)' },
  JMA:         { label: 'JMA',          agency: 'Japan Meteorological Agency (RSMC Tokyo)' },
  ECMWF:       { label: 'ECMWF',        agency: 'European Centre for Medium-Range Weather Forecasts' },
  GFS:         { label: 'NCEP/GFS',     agency: 'US NCEP Global Forecast System' },
  CWB:         { label: 'CWA (Taiwan)', agency: 'Central Weather Administration, Taiwan' },
  HKO:         { label: 'HKO',          agency: 'Hong Kong Observatory' },
  CMA:         { label: 'CMA',          agency: 'China Meteorological Administration' },
  UKMO:        { label: 'UKMO',         agency: 'UK Met Office Unified Model' },
  AI_ENSEMBLE: { label: 'AI Ensemble',  agency: 'HeadsUp in-house LSTM + physics model' },
}

export const ALL_MODEL_IDS: ForecastModelId[] = [
  'PAGASA', 'JTWC', 'JMA', 'ECMWF', 'GFS', 'CWB', 'HKO', 'CMA', 'UKMO', 'AI_ENSEMBLE',
]

export interface ModelTrackPoint {
  lat: number
  lon: number
  hour: number
  wind_kt: number | null
}

export interface ModelTrack {
  model: ForecastModelId
  label: string
  agency: string
  color: string
  source: 'live' | 'mock'
  points: ModelTrackPoint[]
}

export interface MultiModelResponse {
  storm: string
  base_method: string
  models: ModelTrack[]
}

// ── Unified GeoJSON normalizer ──────────────────────────────────────
export interface ModelTrackFeature {
  type: 'Feature'
  properties: { model: ForecastModelId; color: string; source: 'live' | 'mock' }
  geometry: { type: 'LineString'; coordinates: [number, number][] }  // [lon, lat]
}

export function normalizeModelToGeoJSON(track: ModelTrack): ModelTrackFeature {
  return {
    type: 'Feature',
    properties: { model: track.model, color: track.color, source: track.source },
    geometry: {
      type: 'LineString',
      coordinates: track.points.map(p => [p.lon, p.lat] as [number, number]),
    },
  }
}

// ── Fallback mock injector for local testing ────────────────────────
// Mirrors backend generate_ensemble_spaghetti: when the backend is
// unreachable, generate 10 deterministic, smoothly diverging tracks from
// the base forecast coordinates so the spaghetti UI still works locally.

/** Tiny deterministic PRNG (mulberry32) so mock tracks don't jitter between renders. */
function seededRandom(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateEnsembleSpaghettiPlot(
  baseTrack: ModelTrackPoint[],
  stormName: string,
): ModelTrack[] {
  return ALL_MODEL_IDS.map(model => {
    if (model === 'AI_ENSEMBLE') {
      return {
        model, ...MODEL_META[model], color: MODEL_COLORS[model],
        source: 'mock' as const, points: baseTrack,
      }
    }
    const rnd = seededRandom(`${stormName.toUpperCase()}:${model}`)
    const biasDir = rnd() * 2 * Math.PI
    const biasMag = 0.5 + rnd() * 1.7
    const wobAmp = 0.1 + rnd() * 0.35
    const wobFreq = 0.6 + rnd()
    const wobPhase = rnd() * 2 * Math.PI
    const windFac = 0.85 + rnd() * 0.27

    const points = baseTrack.map(p => {
      const d = p.hour / 24
      const growth = d > 0 ? Math.pow(d / 5, 1.25) * 5 : 0
      const wobble = wobAmp * Math.sin(wobFreq * d + wobPhase) * Math.sqrt(Math.max(d, 0))
      return {
        lat: +(p.lat + (Math.sin(biasDir) * biasMag + Math.cos(biasDir) * 0.3 * wobble) * growth / 5).toFixed(3),
        lon: +(p.lon + (Math.cos(biasDir) * biasMag - Math.sin(biasDir) * 0.3 * wobble) * growth / 5).toFixed(3),
        hour: p.hour,
        wind_kt: p.wind_kt != null ? +(p.wind_kt * windFac).toFixed(1) : null,
      }
    })
    return {
      model, ...MODEL_META[model], color: MODEL_COLORS[model],
      source: 'mock' as const, points,
    }
  })
}
