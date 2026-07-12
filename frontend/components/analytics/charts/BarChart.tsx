'use client'
import { useState } from 'react'
import { CHART } from './theme'

export interface BarGroup {
  label: string
  values: number[]   // one per series, aligned with `series`
  meta?: string      // optional sublabel (e.g. support count)
}

export interface BarSeriesDef {
  key: string
  label: string
  color: string
}

/**
 * Horizontal grouped bar chart (dependency-free SVG). Values are on a fixed
 * 0..max domain (default 1 for precision/recall/f1). Each group is a class;
 * each bar is a metric. Value labels ride the bar tips (relief rule: the
 * validated aqua/yellow are sub-3:1 as fills, so values are always shown).
 */
export function BarChart({
  groups, series, max = 1, barThickness = 12, groupGap = 22, labelWidth = 88,
  format = (v: number) => v.toFixed(2),
  axisFormat = (v: number) => v.toFixed(max === 1 ? 1 : 0),
}: {
  groups: BarGroup[]
  series: BarSeriesDef[]
  max?: number
  barThickness?: number
  groupGap?: number
  labelWidth?: number
  format?: (v: number) => string
  axisFormat?: (v: number) => string
}) {
  const [hover, setHover] = useState<{ g: number; s: number } | null>(null)
  const W = 640
  const labelW = labelWidth
  const valueW = 44
  const trackLeft = labelW
  const trackW = W - labelW - valueW
  const gap2 = 2                                   // surface gap between adjacent bars
  const groupH = series.length * barThickness + (series.length - 1) * gap2
  const rowH = groupH + groupGap
  const H = groups.length * rowH + 8

  const sx = (v: number) => (v / max) * trackW

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {/* vertical gridlines at 0/.25/.5/.75/1 */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <g key={t}>
          <line x1={trackLeft + sx(t * max)} x2={trackLeft + sx(t * max)} y1={0} y2={H - 8}
            stroke={CHART.grid} strokeWidth={1} />
          <text x={trackLeft + sx(t * max)} y={H - 0} textAnchor="middle" fontSize={9} fill={CHART.inkMuted}>
            {axisFormat(t * max)}
          </text>
        </g>
      ))}

      {groups.map((g, gi) => {
        const gy = gi * rowH
        return (
          <g key={g.label}>
            {/* class label */}
            <text x={labelW - 10} y={gy + groupH / 2} textAnchor="end" dominantBaseline="middle"
              fontSize={10.5} fontWeight={700} fill={CHART.ink}>{g.label}</text>
            {g.meta && (
              <text x={labelW - 10} y={gy + groupH / 2 + 12} textAnchor="end" dominantBaseline="middle"
                fontSize={8.5} fill={CHART.inkMuted}>{g.meta}</text>
            )}
            {series.map((s, si) => {
              const by = gy + si * (barThickness + gap2)
              const v = g.values[si] ?? 0
              const w = Math.max(sx(v), 0)
              const isHover = hover?.g === gi && hover?.s === si
              return (
                <g key={s.key}
                  onMouseEnter={() => setHover({ g: gi, s: si })}
                  onMouseLeave={() => setHover(null)}>
                  {/* track */}
                  <rect x={trackLeft} y={by} width={trackW} height={barThickness}
                    rx={3} fill={CHART.grid} fillOpacity={0.4} />
                  {/* value bar — 4px rounded data-end (approx via rx), square-ish at base */}
                  <rect x={trackLeft} y={by} width={w} height={barThickness} rx={3}
                    fill={s.color} fillOpacity={isHover ? 1 : 0.9} />
                  {/* value at tip */}
                  <text x={trackLeft + w + 6} y={by + barThickness / 2} dominantBaseline="middle"
                    fontSize={10} fontWeight={700} fill={CHART.inkSoft}
                    style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {format(v)}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
