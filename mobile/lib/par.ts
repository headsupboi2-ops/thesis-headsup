// ── Philippine Area of Responsibility (PAR) geofence ────────────────
// Official PAGASA boundary — NOT a rectangle (western notch at 15°N/115°E
// → 21°N/120°E). Ported from the web app so behaviour matches exactly.

/** Official PAR boundary as [lat, lon], closed. */
export const PAR_BOUNDARY: [number, number][] = [
  [25.0, 120.0], [25.0, 135.0], [5.0, 135.0],
  [5.0, 115.0], [15.0, 115.0], [21.0, 120.0], [25.0, 120.0],
]

export function isInPar(lat: number, lon: number): boolean {
  let inside = false
  const n = PAR_BOUNDARY.length - 1
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [latI, lonI] = PAR_BOUNDARY[i]
    const [latJ, lonJ] = PAR_BOUNDARY[j]
    if (((latI > lat) !== (latJ > lat)) &&
        lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI) {
      inside = !inside
    }
  }
  return inside
}

const EARTH_R = 6371

/** Approx distance (km) to the nearest PAR edge; 0 when inside. */
export function distanceToParKm(lat: number, lon: number): number {
  if (isInPar(lat, lon)) return 0
  const rad = Math.PI / 180
  let minKm = Infinity
  for (let i = 0; i < PAR_BOUNDARY.length - 1; i++) {
    const [aLat, aLon] = PAR_BOUNDARY[i]
    const [bLat, bLon] = PAR_BOUNDARY[i + 1]
    const cosLat = Math.cos(((aLat + bLat) / 2) * rad)
    const ax = aLon * cosLat, ay = aLat
    const bx = bLon * cosLat, by = bLat
    const px = lon * cosLat, py = lat
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
    const nx = ax + t * dx, ny = ay + t * dy
    const distDeg = Math.hypot(px - nx, py - ny)
    minKm = Math.min(minKm, distDeg * rad * EARTH_R)
  }
  return Math.round(minKm)
}

/** First forecast hour a track enters the PAR, or null. */
export function firstParEntryHour(points: Array<{ lat: number; lon: number; hour: number }>): number | null {
  for (const p of points) if (isInPar(p.lat, p.lon)) return p.hour
  return null
}

export function windToCategory(kt: number): number {
  if (kt < 34) return 0
  if (kt < 64) return 1
  if (kt < 96) return 2
  if (kt < 113) return 3
  if (kt < 137) return 4
  return 5
}
