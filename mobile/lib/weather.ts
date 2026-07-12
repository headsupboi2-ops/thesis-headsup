// ── Weather grid data layer ─────────────────────────────────────────
// Fetches the 7-day hourly grids that power the map overlays and the
// forecast strip. Both endpoints are cached 30 min server-side.
import { API_BASE } from './config'

export interface WeatherPoint {
  idx: number; lat: number; lon: number
  temp: number[]; heat: number[]; precip: number[]
  wind_speed: number[]; wind_dir: number[]; cloud: number[]
}
export interface WeatherGrid {
  nx: number; ny: number; n_hours: number; step_hours: number
  generated_at_utc: string; points: WeatherPoint[]
}
export interface MarinePoint { idx: number; lat: number; lon: number; wave_height: number[]; wave_dir: number[] }
export interface MarineGrid { nx: number; ny: number; n_hours: number; points: MarinePoint[] }

async function getJson<T>(path: string, timeout = 45000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', signal: controller.signal })
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export const fetchWeatherGrid = () => getJson<WeatherGrid>('/api/weather/fullgrid?region=par')
export const fetchMarineGrid = () => getJson<MarineGrid>('/api/weather/marine/fullgrid?region=par')

// ── 7-day daily forecast (regional aggregation over the PAR grid) ───
export interface DayForecast {
  dayIndex: number
  label: string
  tempHigh: number
  tempLow: number
  rainMm: number
  cloudPct: number
  windKmh: number
  icon: string        // Ionicons name
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function mean(vals: number[]): number {
  const v = vals.filter(n => Number.isFinite(n))
  return v.length ? v.reduce((s, n) => s + n, 0) / v.length : NaN
}

/** Collapse the grid into one regional value per hour for a field. */
function regionalHourly(grid: WeatherGrid, field: keyof WeatherPoint, hours: number): number[] {
  const out: number[] = []
  for (let h = 0; h < hours; h++) {
    const vals: number[] = []
    for (const p of grid.points) {
      const arr = p[field] as number[]
      if (Array.isArray(arr) && Number.isFinite(arr[h])) vals.push(arr[h])
    }
    out.push(mean(vals))
  }
  return out
}

function iconFor(rainMm: number, cloudPct: number): string {
  if (rainMm > 12) return 'thunderstorm'
  if (rainMm > 1.5) return 'rainy'
  if (cloudPct > 70) return 'cloud'
  if (cloudPct > 35) return 'partly-sunny'
  return 'sunny'
}

/** Seven daily summaries from the hourly grid. Day 0 = today. */
export function dailyForecast(grid: WeatherGrid): DayForecast[] {
  const hours = Math.min(grid.n_hours ?? 168, 168)
  const temp = regionalHourly(grid, 'temp', hours)
  const precip = regionalHourly(grid, 'precip', hours)
  const cloud = regionalHourly(grid, 'cloud', hours)
  const wind = regionalHourly(grid, 'wind_speed', hours)

  const days: DayForecast[] = []
  const now = new Date()
  for (let d = 0; d < 7; d++) {
    const s = d * 24, e = Math.min(s + 24, hours)
    if (s >= hours) break
    const dayTemp = temp.slice(s, e).filter(Number.isFinite)
    const dayRain = precip.slice(s, e).filter(Number.isFinite).reduce((a, b) => a + b, 0)
    const dayCloud = mean(cloud.slice(s, e))
    const dayWind = mean(wind.slice(s, e))
    const date = new Date(now.getTime() + d * 86400000)
    days.push({
      dayIndex: d,
      label: d === 0 ? 'Today' : d === 1 ? 'Tmrw' : DOW[date.getDay()],
      tempHigh: dayTemp.length ? Math.round(Math.max(...dayTemp)) : NaN,
      tempLow: dayTemp.length ? Math.round(Math.min(...dayTemp)) : NaN,
      rainMm: Math.round(dayRain * 10) / 10,
      cloudPct: Math.round(dayCloud),
      windKmh: Math.round(dayWind),
      icon: iconFor(dayRain, dayCloud),
    })
  }
  return days
}
