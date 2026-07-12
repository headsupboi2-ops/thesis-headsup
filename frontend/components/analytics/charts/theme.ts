// ── Chart design tokens ─────────────────────────────────────────────
// Charts render inside the app's white glass panels (a light surface), so
// tokens are validated against a light surface. Data marks use the dataviz
// validated categorical hues (CVD-safe, worst adjacent ΔE 21.6); all text
// uses slate ink tokens — never the series color. See dataviz skill.

export const CHART = {
  surface:  '#ffffff',            // panel background — used for surface gaps/rings
  ink:      '#0f172a',            // slate-900 — primary ink (values, titles)
  inkSoft:  '#475569',            // slate-600 — secondary ink (labels)
  inkMuted: '#94a3b8',            // slate-400 — axis ticks
  grid:     '#e2e8f0',            // slate-200 — hairline gridlines
  axis:     '#cbd5e1',            // slate-300 — baseline
} as const

// Validated categorical slots (light mode) — assign in fixed order, never cycle.
export const SERIES = {
  blue:   '#2a78d6',
  aqua:   '#1baf7a',
  yellow: '#eda100',
  violet: '#4a3aa7',
  red:    '#e34948',
} as const

// Brand accent (app primary) — used for single-series meters/gauges, matching
// the surrounding chrome. Track is a light step of the same hue (meter spec).
export const ACCENT = '#0052cc'
export const ACCENT_TRACK = '#dbe7fb'
