// ── Dynamic "prepare-by" timeline ───────────────────────────────────
// Time-anchored actions keyed to the expected TCWS signal and the storm's
// ETA. Each action has a lead time before impact, so the "by <time>" shifts
// automatically as the forecast updates. Naga/Bicol-aware (flood + evacuate).

export interface PrepAction { label: string; minSignal: number; leadHours: number; icon: string }
export interface PrepItem { label: string; icon: string; by: Date; overdue: boolean; hoursToGo: number }

const ACTIONS: PrepAction[] = [
  { label: 'Pack a go-bag — papers, meds, cash, water',        minSignal: 1, leadHours: 24, icon: 'briefcase' },
  { label: 'Charge phones & power banks',                      minSignal: 1, leadHours: 18, icon: 'battery-charging' },
  { label: 'Store 3 days of water & food',                     minSignal: 2, leadHours: 24, icon: 'water' },
  { label: 'Fuel up vehicles; withdraw cash',                  minSignal: 2, leadHours: 18, icon: 'car' },
  { label: 'Reinforce windows & secure the roof',             minSignal: 2, leadHours: 12, icon: 'hammer' },
  { label: 'Move valuables above expected flood level',        minSignal: 3, leadHours: 18, icon: 'file-tray-stacked' },
  { label: 'Prepare to evacuate riverside / low-lying areas',  minSignal: 3, leadHours: 12, icon: 'exit' },
  { label: 'Stay indoors — avoid all travel',                  minSignal: 3, leadHours: 6,  icon: 'home' },
  { label: 'EVACUATE NOW if in a flood or storm-surge zone',   minSignal: 4, leadHours: 12, icon: 'warning' },
  { label: 'Final shelter check — stay clear of windows',      minSignal: 4, leadHours: 3,  icon: 'shield-checkmark' },
]

/** Build the timeline for an expected signal + ETA (hours from `now`). */
export function prepTimeline(signal: number, etaHours: number | null, now: Date = new Date()): PrepItem[] {
  if (etaHours == null || signal < 1) return []
  const eta = now.getTime() + etaHours * 3_600_000
  return ACTIONS
    .filter(a => a.minSignal <= signal)
    .map(a => {
      const by = new Date(eta - a.leadHours * 3_600_000)
      return {
        label: a.label, icon: a.icon, by,
        overdue: by.getTime() < now.getTime(),
        hoursToGo: Math.round((by.getTime() - now.getTime()) / 3_600_000),
      }
    })
    .sort((x, y) => x.by.getTime() - y.by.getTime())
}
