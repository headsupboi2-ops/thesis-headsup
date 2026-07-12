'use client'
import { useState } from 'react'
import { CHART } from './theme'

export interface LineSeries {
  key: string
  label: string
  color: string
  points: Array<{ x: number; y: number }>   // x = domain value (e.g. lead hour)
}

export interface LineBand {
  color: string
  points: Array<{ x: number; lo: number; hi: number }>
}

/**
 * Dependency-free SVG multi-series line chart with an optional shaded band
 * (e.g. P50–P90 uncertainty) and a crosshair + tooltip hover layer.
 * One y-axis only. Text uses ink tokens; marks carry the series color.
 */
export function LineChart({
  series, band, xTicks, xLabel, yLabel, yUnit = '', height = 260, formatX = String,
}: {
  series: LineSeries[]
  band?: LineBand
  xTicks: number[]
  xLabel?: string
  yLabel?: string
  yUnit?: string
  height?: number
  formatX?: (x: number) => string
}) {
  const [hoverX, setHoverX] = useState<number | null>(null)
  const W = 640, H = height
  const m = { top: 16, right: 20, bottom: 40, left: 52 }
  const iw = W - m.left - m.right
  const ih = H - m.top - m.bottom

  const xs = xTicks
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const allY = [
    ...series.flatMap(s => s.points.map(p => p.y)),
    ...(band?.points.flatMap(p => [p.lo, p.hi]) ?? []),
  ]
  const yMax = niceMax(Math.max(...allY, 0))
  const sx = (x: number) => m.left + ((x - xMin) / (xMax - xMin || 1)) * iw
  const sy = (y: number) => m.top + ih - (y / (yMax || 1)) * ih

  const yTicks = ticksTo(yMax, 4)
  const linePath = (pts: Array<{ x: number; y: number }>) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')

  // Nearest x-tick to the pointer, for the crosshair
  const nearest = hoverX == null ? null : xs.reduce((a, b) =>
    Math.abs(sx(b) - hoverX) < Math.abs(sx(a) - hoverX) ? b : a)

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}
        onMouseMove={e => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          setHoverX(((e.clientX - r.left) / r.width) * W)
        }}
        onMouseLeave={() => setHoverX(null)}
        role="img"
      >
        {/* gridlines + y ticks */}
        {yTicks.map(t => (
          <g key={t}>
            <line x1={m.left} x2={m.left + iw} y1={sy(t)} y2={sy(t)} stroke={CHART.grid} strokeWidth={1} />
            <text x={m.left - 8} y={sy(t)} textAnchor="end" dominantBaseline="middle"
              fontSize={10} fill={CHART.inkMuted} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {t.toLocaleString()}
            </text>
          </g>
        ))}
        {/* x ticks */}
        {xs.map(x => (
          <text key={x} x={sx(x)} y={m.top + ih + 16} textAnchor="middle"
            fontSize={10} fill={CHART.inkMuted} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatX(x)}
          </text>
        ))}
        {/* axis labels */}
        {yLabel && (
          <text transform={`translate(12,${m.top + ih / 2}) rotate(-90)`} textAnchor="middle"
            fontSize={10} fontWeight={700} fill={CHART.inkSoft}>{yLabel}</text>
        )}
        {xLabel && (
          <text x={m.left + iw / 2} y={H - 4} textAnchor="middle"
            fontSize={10} fontWeight={700} fill={CHART.inkSoft}>{xLabel}</text>
        )}

        {/* uncertainty band (area wash ~12% opacity) */}
        {band && band.points.length > 1 && (
          <path
            d={
              band.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.hi).toFixed(1)}`).join(' ') +
              ' ' +
              [...band.points].reverse().map(p => `L${sx(p.x).toFixed(1)},${sy(p.lo).toFixed(1)}`).join(' ') +
              ' Z'
            }
            fill={band.color} fillOpacity={0.12} stroke="none"
          />
        )}

        {/* crosshair */}
        {nearest != null && (
          <line x1={sx(nearest)} x2={sx(nearest)} y1={m.top} y2={m.top + ih}
            stroke={CHART.axis} strokeWidth={1} strokeDasharray="3 3" />
        )}

        {/* series lines + end dots with surface ring */}
        {series.map(s => {
          const last = s.points[s.points.length - 1]
          return (
            <g key={s.key}>
              <path d={linePath(s.points)} fill="none" stroke={s.color} strokeWidth={2}
                strokeLinejoin="round" strokeLinecap="round" />
              {last && (
                <>
                  <circle cx={sx(last.x)} cy={sy(last.y)} r={4.5} fill={s.color}
                    stroke={CHART.surface} strokeWidth={2} />
                  <text x={sx(last.x)} y={sy(last.y) - 10} textAnchor="end"
                    fontSize={10} fontWeight={700} fill={CHART.inkSoft}
                    style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {s.label}
                  </text>
                </>
              )}
              {/* hover markers on the crosshair tick */}
              {nearest != null && (() => {
                const pt = s.points.find(p => p.x === nearest)
                return pt ? (
                  <circle cx={sx(pt.x)} cy={sy(pt.y)} r={4} fill={s.color}
                    stroke={CHART.surface} strokeWidth={2} />
                ) : null
              })()}
            </g>
          )
        })}
      </svg>

      {/* tooltip */}
      {nearest != null && (
        <div className="absolute pointer-events-none rounded-lg px-2.5 py-1.5 text-[11px]"
          style={{
            left: `${(sx(nearest) / W) * 100}%`, top: 6,
            transform: `translateX(${sx(nearest) > W * 0.6 ? '-108%' : '8%'})`,
            background: 'rgba(15,23,42,0.94)', color: 'white',
            boxShadow: '0 4px 14px rgba(0,0,0,0.3)', whiteSpace: 'nowrap',
          }}>
          <div className="font-bold mb-0.5">{formatX(nearest)}</div>
          {series.map(s => {
            const pt = s.points.find(p => p.x === nearest)
            return pt ? (
              <div key={s.key} className="flex items-center gap-1.5">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                <span className="opacity-80">{s.label}</span>
                <span className="ml-auto font-semibold tabular-nums">{pt.y.toLocaleString()}{yUnit}</span>
              </div>
            ) : null
          })}
        </div>
      )}
    </div>
  )
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

function ticksTo(max: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, i) => Math.round((max / count) * i))
}
