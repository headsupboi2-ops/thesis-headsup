// ── Philippine Area of Responsibility (PAR) geofence ────────────────
// Official PAGASA boundary. Note this is NOT a rectangle: the western
// edge steps in at 15°N 115°E → 21°N 120°E. All geospatial checks must
// use point-in-polygon against this shape, not min/max bounds.

/** Official PAR boundary vertices as [lat, lon], closed (first == last). */
export const PAR_BOUNDARY: [number, number][] = [
  [25.0, 120.0], // Point 1: 25°N 120°E
  [25.0, 135.0], // Point 2: 25°N 135°E
  [5.0, 135.0],  // Point 3: 5°N 135°E
  [5.0, 115.0],  // Point 4: 5°N 115°E
  [15.0, 115.0], // Point 5: 15°N 115°E
  [21.0, 120.0], // Point 6: 21°N 120°E
  [25.0, 120.0], // Close the polygon back at Point 1
]

/** Ray-casting point-in-polygon test against the PAR boundary. */
export function isInPar(lat: number, lon: number): boolean {
  let inside = false
  // Skip the duplicated closing vertex; pair each vertex with the previous one
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

const EARTH_R = 6371 // km

/**
 * Approximate distance (km) from a point to the nearest PAR boundary edge.
 * Uses a local equirectangular projection per segment — accurate to well
 * under 1% at PAR latitudes, plenty for alert thresholds. Returns 0 when
 * the point is inside the PAR.
 */
export function distanceToParKm(lat: number, lon: number): number {
  if (isInPar(lat, lon)) return 0
  const rad = Math.PI / 180
  let minKm = Infinity
  for (let i = 0; i < PAR_BOUNDARY.length - 1; i++) {
    const [aLat, aLon] = PAR_BOUNDARY[i]
    const [bLat, bLon] = PAR_BOUNDARY[i + 1]
    const cosLat = Math.cos(((aLat + bLat) / 2) * rad)
    // project to a flat plane centered on the segment (x: east km, y: north km)
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

/**
 * First forecast hour at which a track enters the PAR, or null.
 * Points must be sorted by hour ascending.
 */
export function firstParEntryHour(points: Array<{ lat: number; lon: number; hour: number }>): number | null {
  for (const p of points) {
    if (isInPar(p.lat, p.lon)) return p.hour
  }
  return null
}
