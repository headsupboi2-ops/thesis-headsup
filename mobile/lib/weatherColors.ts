// ── Weather colour ramps (ported from the web app's lib/colors.ts) ──
// Kept identical so mobile overlays match the web palette exactly. The same
// stop arrays are also handed to the map WebView, which runs its own copy of
// colorRamp — single source of truth for the colours.

export type RGB = [number, number, number]
export type Stop = [number, RGB]

/** Linear interpolation across a colour ramp. */
export function colorRamp(stops: Stop[], t: number): RGB {
  const lo = stops[0][0], hi = stops[stops.length - 1][0]
  const c = Math.max(lo, Math.min(hi, t))
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]
    const [t1, c1] = stops[i + 1]
    if (c >= t0 && c <= t1) {
      const f = (c - t0) / (t1 - t0)
      return c0.map((v, j) => Math.round(v + f * (c1[j] - v))) as RGB
    }
  }
  return stops[stops.length - 1][1]
}

export const rgba = ([r, g, b]: RGB, a = 1) => `rgba(${r},${g},${b},${a})`
export const hex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')

/** Thunderstorm probability derived from cloud cover (%) + rainfall (mm/h). */
export function deriveThunder(cloudPct: number, precipMm: number): number {
  return Math.max(0, Math.min(100, cloudPct * 0.35 + precipMm * 10))
}
