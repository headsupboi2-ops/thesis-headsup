'use client'
import { ACCENT, ACCENT_TRACK, CHART } from './theme'

/**
 * Radial arc meter for a single 0..1 value (accuracy, F1). The fill carries
 * the value; the unfilled track is a light step of the same hue (meter spec).
 * The number sits in ink at the center.
 */
export function Gauge({
  value, label, color = ACCENT, size = 132, sublabel,
}: {
  value: number            // 0..1
  label: string
  color?: string
  size?: number
  sublabel?: string
}) {
  const stroke = 11
  const r = (size - stroke) / 2 - 2
  const cx = size / 2, cy = size / 2
  const startAngle = 135, sweep = 270            // 3/4 arc, opening at the bottom
  const clamped = Math.max(0, Math.min(1, value))

  const polar = (angleDeg: number) => {
    const a = (angleDeg * Math.PI) / 180
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }
  const arcPath = (frac: number) => {
    const a0 = startAngle
    const a1 = startAngle + sweep * frac
    const p0 = polar(a0), p1 = polar(a1)
    const large = sweep * frac > 180 ? 1 : 0
    return `M${p0.x.toFixed(1)},${p0.y.toFixed(1)} A${r},${r} 0 ${large} 1 ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`
  }

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <path d={arcPath(1)} fill="none" stroke={ACCENT_TRACK} strokeWidth={stroke} strokeLinecap="round" />
        <path d={arcPath(clamped)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle"
          fontSize={size * 0.24} fontWeight={700} fill={CHART.ink}>
          {(clamped * 100).toFixed(1)}
          <tspan fontSize={size * 0.12} fill={CHART.inkMuted}>%</tspan>
        </text>
        {sublabel && (
          <text x={cx} y={cy + size * 0.16} textAnchor="middle" fontSize={10} fill={CHART.inkMuted}>
            {sublabel}
          </text>
        )}
      </svg>
      <span className="text-[11px] font-bold uppercase tracking-[1px] text-slate-500 -mt-1">{label}</span>
    </div>
  )
}
