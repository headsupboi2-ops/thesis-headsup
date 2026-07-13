// ── Storm-track geometry vs a point ─────────────────────────────────
// closestApproach finds how near a forecast track comes to a location, and
// the hour + wind at that closest point. Uses the same local-equirectangular
// point-to-segment math as par.ts (accurate at PAR latitudes).

export interface TrackPt { lat: number; lon: number; hour: number; wind_kt: number | null }
export interface ClosestApproach { distanceKm: number; hour: number; windKt: number | null }

const EARTH_R = 6371
const RAD = Math.PI / 180

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * RAD
  const dLon = (bLon - aLon) * RAD
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.sqrt(s))
}

/** Nearest the track passes to (lat0,lon0): distance km + interpolated hour/wind. */
export function closestApproach(track: TrackPt[], lat0: number, lon0: number): ClosestApproach | null {
  if (!track || track.length === 0) return null
  if (track.length === 1) {
    return {
      distanceKm: Math.round(haversineKm(lat0, lon0, track[0].lat, track[0].lon)),
      hour: track[0].hour,
      windKt: track[0].wind_kt,
    }
  }
  let best: ClosestApproach | null = null
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i], b = track[i + 1]
    const cosLat = Math.cos(((a.lat + b.lat) / 2) * RAD)
    const ax = a.lon * cosLat, ay = a.lat
    const bx = b.lon * cosLat, by = b.lat
    const px = lon0 * cosLat, py = lat0
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
    const nx = ax + t * dx, ny = ay + t * dy
    const distKm = Math.hypot(px - nx, py - ny) * RAD * EARTH_R
    if (!best || distKm < best.distanceKm) {
      const windKt = a.wind_kt != null && b.wind_kt != null
        ? Math.round(a.wind_kt + t * (b.wind_kt - a.wind_kt))
        : (a.wind_kt ?? b.wind_kt)
      best = {
        distanceKm: Math.round(distKm),
        hour: Math.round(a.hour + t * (b.hour - a.hour)),
        windKt,
      }
    }
  }
  return best
}
