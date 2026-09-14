'use client'
// ── 24-hour flood-risk timeline ─────────────────────────────────────
// One picture of the whole chain: bar HEIGHT is the Rain Radar's own mm/h for
// that hour, bar COLOUR is the flood level that rainfall produces once local
// susceptibility and the tide are applied. A taller radar bar therefore yields
// a hotter colour — and where the tide is high the colour runs hotter WITHOUT
// the bar growing, which is what isolates the tide's contribution from the rain's.
import { floodMeta, type FloodHour } from '@/lib/flood'
import type { TideExtreme } from '@/lib/tides'

const VB_W = 720, VB_H = 208
const SLOT = VB_W / 24
const BAR_W = 18
const PLOT_TOP = 16, BASELINE = 140
const TIDE_TOP = 26, TIDE_BOT = 130
const MARKER_Y = 158, LABEL_Y = 182

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const hourLabel = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric' })

export function FloodTimeline({ hours, extremes, peak, tidalInfluence, stationName }: {
  hours: FloodHour[]
  extremes: TideExtreme[]
  peak: FloodHour
  tidalInfluence: number
  stationName: string | null
}) {
  if (!hours.length) return null

  const startMs = hours[0].ms
  const endMs = hours[hours.length - 1].ms + 3_600_000
  const hasTide = stationName != null && hours.some(h => h.tideM != null)

  // Bar height is the radar value; the floor keeps a drizzle from filling the chart.
  const maxRain = Math.max(2, ...hours.map(h => h.rain1h))
  const barH = (mm: number) => Math.max(mm > 0 ? 2 : 0, (mm / maxRain) * (BASELINE - PLOT_TOP))
  const xAt = (ms: number) => ((ms - startMs) / (endMs - startMs)) * VB_W

  const peakMeta = floodMeta(peak.level)
  const wettest = Math.max(...hours.map(h => h.rain1h))
  const tideAtPeak = peak.tideM

  return (
    <div className="pt-3 border-t border-slate-100">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="text-slate-800 font-extrabold text-sm">Next 24 hours</div>
        <a href="/" className="text-[11px] font-bold text-[#0052cc] hover:underline">Open Rain Radar →</a>
      </div>

      {/* Headline — the peak hour, and why it peaks there. */}
      <div className="text-slate-500 text-sm mt-0.5">
        {peak.level === 'none' && wettest < 0.2
          ? 'No rain on the radar in the next 24 hours.'
          : <>
              Peak risk <span className="font-bold" style={{ color: peakMeta.color }}>{hhmm(peak.ms)} · {peakMeta.word}</span>
              {', radar '}{peak.rain1h.toFixed(1)} mm/h, {peak.rainMm} mm/24h
              {/* Only mention the tide where it actually moved the number —
                  quoting a tide for an upland barangay reads as a cause when it
                  had no effect. Level only: rising/falling is a separate question
                  from high/low, and the score depends on the level. */}
              {hasTide && tideAtPeak != null && tidalInfluence > 0.05 && (
                <>{' on a '}{tideAtPeak.toFixed(2)} m {peak.tideNorm >= 0.5 ? 'high' : 'low'} tide</>
              )}.
            </>}
      </div>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full mt-2" role="img"
        aria-label={`Hourly flood risk for the next 24 hours. Peak ${peakMeta.word} at ${hhmm(peak.ms)}.`}>
        {/* baseline */}
        <line x1={0} y1={BASELINE} x2={VB_W} y2={BASELINE} stroke="#e2e8f0" strokeWidth={1} />

        {/* rain bars, coloured by the resulting flood level */}
        {hours.map((h, i) => {
          const m = floodMeta(h.level)
          const bh = barH(h.rain1h)
          const isPeak = h.hourIndex === peak.hourIndex
          return (
            <g key={h.hourIndex}>
              <rect x={i * SLOT + (SLOT - BAR_W) / 2} y={BASELINE - bh} width={BAR_W} height={bh}
                rx={3} fill={m.color} opacity={isPeak ? 1 : 0.85} />
              {isPeak && bh > 0 && (
                <rect x={i * SLOT + (SLOT - BAR_W) / 2 - 2} y={BASELINE - bh - 2} width={BAR_W + 4} height={bh + 4}
                  rx={5} fill="none" stroke={m.color} strokeWidth={1.5} />
              )}
              <title>
                {`${hhmm(h.ms)}: ${m.word}\n`}
                {`Radar: ${h.rain1h.toFixed(1)} mm/h\n`}
                {`24h accumulation: ${h.rainMm} mm\n`}
                {h.tideM != null ? `Tide: ${h.tideM.toFixed(2)} m (×${h.factor.toFixed(2)})` : 'Tide: n/a'}
              </title>
            </g>
          )
        })}

        {/* tide curve — deliberately thin and dashed so the rain bars stay the subject */}
        {hasTide && (
          <polyline
            points={hours.map((h, i) =>
              `${i * SLOT + SLOT / 2},${TIDE_BOT - h.tideNorm * (TIDE_BOT - TIDE_TOP)}`).join(' ')}
            fill="none" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="5 3"
            strokeLinecap="round" opacity={0.75} />
        )}

        {/* high / low tide markers */}
        {hasTide && extremes.map(e => {
          const ms = Date.parse(e.time_utc)
          const x = xAt(ms)
          if (x < 0 || x > VB_W) return null
          const isHigh = e.type === 'high'
          return (
            <g key={e.time_utc}>
              <line x1={x} y1={PLOT_TOP} x2={x} y2={BASELINE} stroke="#0ea5e9" strokeWidth={1}
                strokeDasharray="2 4" opacity={0.45} />
              <text x={x} y={MARKER_Y} textAnchor="middle" fontSize={13} fill="#0ea5e9">
                {isHigh ? '▲' : '▼'}
              </text>
              <text x={x} y={MARKER_Y + 13} textAnchor="middle" fontSize={10.5} fill="#64748b" fontWeight={700}>
                {isHigh ? 'High' : 'Low'} {e.height_m.toFixed(1)}m
              </text>
              <text x={x} y={MARKER_Y + 25} textAnchor="middle" fontSize={10} fill="#94a3b8">
                {hhmm(ms)}
              </text>
            </g>
          )
        })}

        {/* hour axis, every 6 h */}
        {hours.map((h, i) => i % 6 === 0 && (
          <text key={h.hourIndex} x={i * SLOT + SLOT / 2} y={LABEL_Y + 18} textAnchor="middle"
            fontSize={11} fill="#94a3b8" fontWeight={600}>
            {hourLabel(h.ms)}
          </text>
        ))}
      </svg>

      {/* legend + the formula, so the chart explains itself */}
      <div className="flex items-center gap-3 flex-wrap mt-1 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: '#94a3b8' }} />
          bar height = Rain Radar mm/h
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm"
            style={{ background: 'linear-gradient(90deg,#39d98a,#e1e100,#ff9500,#ff3b30)' }} />
          colour = flood risk
        </span>
        {hasTide && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: '#0ea5e9' }} />
            tide ({stationName})
          </span>
        )}
      </div>
      <p className="text-[10px] italic text-slate-400 mt-1.5 leading-snug">
        Rain Radar mm/h → rolling 24 h accumulation → × barangay susceptibility
        {tidalInfluence > 0
          ? <> → × tide (influence {tidalInfluence.toFixed(2)}) = risk.</>
          : <> = risk. This barangay sits above the tidal reach, so the tide does not change its risk.</>}
      </p>
    </div>
  )
}
