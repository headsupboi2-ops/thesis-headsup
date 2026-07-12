// ── HeadsUp mobile design tokens ────────────────────────────────────
// A single dark, weather-forward system shared across every screen.

export const colors = {
  // surfaces
  bg:          '#0a1a3a',   // app background (deep navy)
  bgElevated:  '#0e2148',   // header / nav bar
  card:        '#12275a',   // primary card
  cardAlt:     '#0f2350',   // nested / secondary card
  cardMuted:   '#122a5f',

  // strokes
  border:      'rgba(255,255,255,0.08)',
  borderStrong:'rgba(255,255,255,0.16)',
  hairline:    'rgba(255,255,255,0.06)',

  // brand
  primary:     '#4d9bff',   // interactive blue (bright for dark surfaces)
  primaryDeep: '#0052cc',
  primarySoft: 'rgba(77,155,255,0.14)',

  // text
  text:        '#f2f6ff',
  textSoft:    '#aebbd8',
  textMuted:   '#6f80a8',

  // status
  danger:      '#ff5a5a',
  warn:        '#ffab40',
  watch:       '#ffd54f',
  success:     '#39d98a',
} as const

// Storm category → colour / short label / friendly name (matches backend)
export const CAT_COLOR: Record<number, string> = {
  0: '#87ceeb', 1: '#64ee64', 2: '#e1e100', 3: '#ff9500', 4: '#ff3b30', 5: '#ff2d92',
}
export const CAT_LABEL: Record<number, string> = {
  0: 'TD', 1: 'TS', 2: 'TY', 3: 'STY3', 4: 'STY4', 5: 'STY5',
}
export const CAT_NAME: Record<number, string> = {
  0: 'Tropical Depression', 1: 'Tropical Storm', 2: 'Typhoon',
  3: 'Severe Typhoon', 4: 'Super Typhoon (Cat 4)', 5: 'Super Typhoon (Cat 5)',
}

// Honest freshness badge — never claim "LIVE" for lagged best-track data.
export function freshnessBadge(
  freshness: string | undefined,
  ageHours?: number | null,
): { label: string; color: string } {
  const age = ageHours != null ? ` · ${Math.round(ageHours)}h old` : ''
  switch (freshness) {
    case 'live':    return { label: 'LIVE', color: colors.success }
    case 'delayed': return { label: `BEST TRACK${age}`, color: colors.warn }
    case 'archive': return { label: 'ARCHIVE', color: colors.textMuted }
    default:        return { label: 'LIVE', color: colors.success }
  }
}

export const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28,
} as const

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 22, pill: 999,
} as const

export const font = {
  // Native system stacks — crisp and platform-appropriate, no custom fonts.
  hero: 34, h1: 24, h2: 18, h3: 15, body: 14, small: 12, tiny: 10.5,
} as const

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
} as const
