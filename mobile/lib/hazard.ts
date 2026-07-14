// ── Philippine flood-hazard geography (curated) ─────────────────────
// `floodSusceptibility` is a 0–1 INDEX. The current values are derived from
// hydrogeographic reasoning (nearness to the Naga/Bicol rivers, low-lying vs
// upland terrain, barangays with documented recurrent flooding) — NOT yet from
// an ingested official raster. This is a RISK INDEX, not a surveyed flood model.
//
// To ground it for the thesis, set each value from an official hazard map
// (Project NOAH / MGB flood-susceptibility / Naga City DRRMO — Low≈0.25,
// Moderate≈0.55, High≈0.85) and record the reference in `source`. No other code
// changes are needed. See docs/flood-surge-methodology.md.
import { haversineKm } from './geo'

export type CoastalExposure = 'none' | 'bay' | 'open'

export interface HazardArea {
  name: string
  lat: number
  lon: number
  floodSusceptibility: number     // 0 (rain runs off) … 1 (floods readily)
  coastalExposure: CoastalExposure
  note?: string
  source?: string                 // official hazard-map citation, once grounded
}

// Naga City barangays. Naga sits inland (~20 km from San Miguel Bay), so its
// coastal-surge exposure is 'none' — its flood story is RIVERINE, driven by the
// Naga River and the wider Bicol River basin. Central/western low-lying and
// riverside barangays flood first; the eastern Mt-Isarog uplands shed water.
export const NAGA_BARANGAYS: HazardArea[] = [
  { name: 'Tabuco',              lat: 13.618, lon: 123.178, floodSusceptibility: 0.90, coastalExposure: 'none', note: 'Naga riverbank — floods first' },
  { name: 'Triangulo',           lat: 13.626, lon: 123.188, floodSusceptibility: 0.90, coastalExposure: 'none', note: 'Low-lying, chronic flooding' },
  { name: 'Mabolo',              lat: 13.615, lon: 123.180, floodSusceptibility: 0.85, coastalExposure: 'none', note: 'Riverside, low-lying' },
  { name: 'Sabang',              lat: 13.617, lon: 123.183, floodSusceptibility: 0.85, coastalExposure: 'none', note: 'Riverside' },
  { name: 'Dinaga',              lat: 13.620, lon: 123.182, floodSusceptibility: 0.85, coastalExposure: 'none', note: 'Riverbank, city core' },
  { name: 'Santa Cruz',          lat: 13.616, lon: 123.185, floodSusceptibility: 0.80, coastalExposure: 'none', note: 'South-central, low-lying' },
  { name: 'Igualdad Interior',   lat: 13.621, lon: 123.184, floodSusceptibility: 0.80, coastalExposure: 'none' },
  { name: 'Lerma',               lat: 13.619, lon: 123.186, floodSusceptibility: 0.80, coastalExposure: 'none' },
  { name: 'Tinago',              lat: 13.620, lon: 123.190, floodSusceptibility: 0.80, coastalExposure: 'none' },
  { name: 'Abella',              lat: 13.622, lon: 123.185, floodSusceptibility: 0.78, coastalExposure: 'none' },
  { name: 'Del Rosario',         lat: 13.640, lon: 123.175, floodSusceptibility: 0.78, coastalExposure: 'none', note: 'Near Bicol River' },
  { name: 'Bagumbayan Sur',      lat: 13.620, lon: 123.188, floodSusceptibility: 0.75, coastalExposure: 'none' },
  { name: 'San Francisco',       lat: 13.622, lon: 123.186, floodSusceptibility: 0.75, coastalExposure: 'none' },
  { name: 'Calauag',             lat: 13.628, lon: 123.175, floodSusceptibility: 0.72, coastalExposure: 'none' },
  { name: 'Bagumbayan Norte',    lat: 13.625, lon: 123.190, floodSusceptibility: 0.70, coastalExposure: 'none' },
  { name: 'Dayangdang',          lat: 13.624, lon: 123.192, floodSusceptibility: 0.70, coastalExposure: 'none' },
  { name: 'Liboton',             lat: 13.623, lon: 123.188, floodSusceptibility: 0.70, coastalExposure: 'none' },
  { name: 'Peñafrancia',         lat: 13.626, lon: 123.195, floodSusceptibility: 0.68, coastalExposure: 'none' },
  { name: 'Concepcion Pequeña',  lat: 13.628, lon: 123.198, floodSusceptibility: 0.55, coastalExposure: 'none' },
  { name: 'Balatas',             lat: 13.635, lon: 123.205, floodSusceptibility: 0.50, coastalExposure: 'none' },
  { name: 'Concepcion Grande',   lat: 13.630, lon: 123.210, floodSusceptibility: 0.45, coastalExposure: 'none' },
  { name: 'San Felipe',          lat: 13.638, lon: 123.220, floodSusceptibility: 0.40, coastalExposure: 'none' },
  { name: 'Cararayan',           lat: 13.650, lon: 123.230, floodSusceptibility: 0.28, coastalExposure: 'none', note: 'Higher ground, east' },
  { name: 'Pacol',               lat: 13.640, lon: 123.245, floodSusceptibility: 0.22, coastalExposure: 'none', note: 'Upland east' },
  { name: 'Carolina',            lat: 13.660, lon: 123.260, floodSusceptibility: 0.15, coastalExposure: 'none', note: 'Mt Isarog foothills' },
  { name: 'Panicuason',          lat: 13.665, lon: 123.280, floodSusceptibility: 0.10, coastalExposure: 'none', note: 'Mt Isarog slopes — sheds water' },
]

/** Bounding box + centre for the Naga barangay set, used to decide when a
 *  location is "in Naga" and should resolve to barangay-level detail. */
export const NAGA_CENTER = { lat: 13.626, lon: 123.195 }
export const NAGA_RADIUS_KM = 14

// Broader PH flood-hazard zones so other cities and the national map layer
// still get a susceptibility value. Each is a centre + influence radius,
// sampled by inverse-distance weighting.
export interface HazardZone {
  name: string
  lat: number
  lon: number
  radiusKm: number
  floodSusceptibility: number
  coastalExposure: CoastalExposure
}
export const HAZARD_ZONES: HazardZone[] = [
  { name: 'Bicol River basin (Naga–Libmanan)', lat: 13.60, lon: 123.10, radiusKm: 45, floodSusceptibility: 0.80, coastalExposure: 'none' },
  { name: 'Metro Manila / Marikina',            lat: 14.62, lon: 121.05, radiusKm: 35, floodSusceptibility: 0.82, coastalExposure: 'bay' },
  { name: 'Central Luzon plain (Pampanga)',     lat: 15.05, lon: 120.68, radiusKm: 60, floodSusceptibility: 0.78, coastalExposure: 'bay' },
  { name: 'Cagayan River valley',               lat: 17.60, lon: 121.72, radiusKm: 55, floodSusceptibility: 0.75, coastalExposure: 'none' },
  { name: 'Albay / Legazpi coast',              lat: 13.14, lon: 123.74, radiusKm: 25, floodSusceptibility: 0.60, coastalExposure: 'open' },
  { name: 'Eastern Visayas (Leyte–Tacloban)',   lat: 11.24, lon: 125.00, radiusKm: 40, floodSusceptibility: 0.65, coastalExposure: 'open' },
  { name: 'Panay / Iloilo–Capiz',               lat: 11.10, lon: 122.60, radiusKm: 45, floodSusceptibility: 0.58, coastalExposure: 'open' },
  { name: 'Agusan marsh (Mindanao NE)',         lat: 8.20,  lon: 125.90, radiusKm: 55, floodSusceptibility: 0.72, coastalExposure: 'none' },
  { name: 'Davao / SE Mindanao coast',          lat: 7.07,  lon: 125.61, radiusKm: 35, floodSusceptibility: 0.45, coastalExposure: 'open' },
  { name: 'Cotabato basin (Mindanao S)',        lat: 6.90,  lon: 124.70, radiusKm: 55, floodSusceptibility: 0.68, coastalExposure: 'bay' },
  { name: 'Cordillera uplands (Baguio)',        lat: 16.41, lon: 120.60, radiusKm: 30, floodSusceptibility: 0.25, coastalExposure: 'none' },
  { name: 'Palawan (Puerto Princesa)',          lat: 9.74,  lon: 118.74, radiusKm: 40, floodSusceptibility: 0.40, coastalExposure: 'open' },
]

const BASELINE_SUSCEPTIBILITY = 0.35

/** True when a location is close enough to Naga to use barangay-level data. */
export function isInNaga(lat: number, lon: number): boolean {
  return haversineKm(lat, lon, NAGA_CENTER.lat, NAGA_CENTER.lon) <= NAGA_RADIUS_KM
}

/** Nearest Naga barangay to a point (only meaningful inside Naga). */
export function nearestBarangay(lat: number, lon: number): HazardArea {
  let best = NAGA_BARANGAYS[0], bestD = Infinity
  for (const b of NAGA_BARANGAYS) {
    const d = haversineKm(lat, lon, b.lat, b.lon)
    if (d < bestD) { bestD = d; best = b }
  }
  return best
}

/** Flood susceptibility (0–1) at any location. Barangay-resolved inside Naga
 *  (inverse-distance blend so the map field is smooth), else zone-weighted. */
export function susceptibilityAt(lat: number, lon: number): number {
  if (isInNaga(lat, lon)) {
    let num = 0, den = 0
    for (const b of NAGA_BARANGAYS) {
      const d = haversineKm(lat, lon, b.lat, b.lon)
      if (d < 0.25) return b.floodSusceptibility
      const w = 1 / (d * d)
      num += w * b.floodSusceptibility; den += w
    }
    return den > 0 ? num / den : BASELINE_SUSCEPTIBILITY
  }
  let num = 0, den = 0
  for (const z of HAZARD_ZONES) {
    const d = haversineKm(lat, lon, z.lat, z.lon)
    if (d > z.radiusKm) continue
    const w = (1 - d / z.radiusKm) ** 2
    num += w * z.floodSusceptibility; den += w
  }
  return den > 0 ? num / den : BASELINE_SUSCEPTIBILITY
}

/** Coastal exposure at a location — nearest zone within range, else 'none'. */
export function coastalExposureAt(lat: number, lon: number): CoastalExposure {
  if (isInNaga(lat, lon)) return 'none'
  let best: CoastalExposure = 'none', bestD = Infinity
  for (const z of HAZARD_ZONES) {
    const d = haversineKm(lat, lon, z.lat, z.lon)
    if (d <= z.radiusKm && d < bestD) { bestD = d; best = z.coastalExposure }
  }
  return best
}
