// ── PAGASA Tropical Cyclone Wind Signal from sustained wind ─────────
// 2022 revision (km/h thresholds). Input is knots (ensemble wind_kt).

export interface Tcws { signal: 1 | 2 | 3 | 4 | 5; short: string; label: string; color: string }

export function tcwsFromWind(windKt: number): Tcws | null {
  const kmh = windKt * 1.852
  if (kmh >= 185) return { signal: 5, short: 'TCWS #5', label: 'Extreme — ≥185 km/h winds', color: '#ff2d92' }
  if (kmh >= 118) return { signal: 4, short: 'TCWS #4', label: 'Very destructive typhoon-force winds', color: '#ff3b30' }
  if (kmh >= 89)  return { signal: 3, short: 'TCWS #3', label: 'Destructive storm-force winds', color: '#ff9500' }
  if (kmh >= 62)  return { signal: 2, short: 'TCWS #2', label: 'Damaging gale-force winds', color: '#e1e100' }
  if (kmh >= 39)  return { signal: 1, short: 'TCWS #1', label: 'Strong winds possible', color: '#64ee64' }
  return null
}
