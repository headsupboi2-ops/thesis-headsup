// ── 24-hour flood-risk timeline (mobile) ────────────────────────────
// Mirrors the web component in frontend/components/impact/FloodTimeline.tsx.
// Bar HEIGHT is the Rain Radar's own mm/h for that hour; bar COLOUR is the
// flood level that rainfall produces once local susceptibility and the tide are
// applied. A taller radar bar therefore yields a hotter colour — and where the
// tide is high the colour runs hotter WITHOUT the bar growing, which separates
// the tide's contribution from the rain's.
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Rect, Line, Polyline, G, Text as SvgText } from 'react-native-svg'
import { floodMeta, type FloodHour } from '../lib/flood'
import type { TideExtreme } from '../lib/tides'
import { colors, space, font } from '../lib/theme'

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

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Next 24 hours</Text>

      <Text style={styles.headline}>
        {peak.level === 'none' && wettest < 0.2
          ? 'No rain on the radar in the next 24 hours.'
          : <>
              Peak risk <Text style={{ color: peakMeta.color, fontWeight: '800' }}>{hhmm(peak.ms)} · {peakMeta.word}</Text>
              {` — radar ${peak.rain1h.toFixed(1)} mm/h, ${peak.rainMm} mm/24h`}
              {hasTide && peak.tideM != null && tidalInfluence > 0.05
                ? ` on a ${peak.tideM.toFixed(2)} m ${peak.tideNorm >= 0.5 ? 'high' : 'low'} tide`
                : ''}.
            </>}
      </Text>

      <Svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" style={{ aspectRatio: VB_W / VB_H, marginTop: 6 }}>
        <Line x1={0} y1={BASELINE} x2={VB_W} y2={BASELINE} stroke={colors.borderStrong} strokeWidth={1} />

        {/* rain bars, coloured by the resulting flood level */}
        {hours.map((h, i) => {
          const m = floodMeta(h.level)
          const bh = barH(h.rain1h)
          const isPeak = h.hourIndex === peak.hourIndex
          return (
            <Rect key={h.hourIndex}
              x={i * SLOT + (SLOT - BAR_W) / 2} y={BASELINE - bh}
              width={BAR_W} height={bh} rx={3}
              fill={m.color} opacity={isPeak ? 1 : 0.85}
              stroke={isPeak ? m.color : undefined} strokeWidth={isPeak ? 2 : 0} />
          )
        })}

        {/* tide curve — thin and dashed so the rain bars stay the subject */}
        {hasTide && (
          <Polyline
            points={hours.map((h, i) =>
              `${i * SLOT + SLOT / 2},${TIDE_BOT - h.tideNorm * (TIDE_BOT - TIDE_TOP)}`).join(' ')}
            fill="none" stroke="#38bdf8" strokeWidth={2} strokeDasharray="5,3"
            strokeLinecap="round" opacity={0.8} />
        )}

        {/* high / low tide markers */}
        {hasTide && extremes.map(e => {
          const ms = Date.parse(e.time_utc)
          const x = xAt(ms)
          if (x < 0 || x > VB_W) return null
          const isHigh = e.type === 'high'
          return (
            // <G>, not a Fragment: react-native-svg walks its own children to
            // build the native tree, so a real SVG group is the safe container.
            <G key={e.time_utc}>
              <Line x1={x} y1={PLOT_TOP} x2={x} y2={BASELINE} stroke="#38bdf8" strokeWidth={1}
                strokeDasharray="2,4" opacity={0.45} />
              <SvgText x={x} y={MARKER_Y} textAnchor="middle" fontSize={13} fill="#38bdf8">
                {isHigh ? '▲' : '▼'}
              </SvgText>
              <SvgText x={x} y={MARKER_Y + 13} textAnchor="middle" fontSize={10.5} fill={colors.textSoft} fontWeight="700">
                {`${isHigh ? 'High' : 'Low'} ${e.height_m.toFixed(1)}m`}
              </SvgText>
              <SvgText x={x} y={MARKER_Y + 25} textAnchor="middle" fontSize={10} fill={colors.textMuted}>
                {hhmm(ms)}
              </SvgText>
            </G>
          )
        })}

        {/* hour axis, every 6 h */}
        {hours.map((h, i) => i % 6 === 0 ? (
          <SvgText key={h.hourIndex} x={i * SLOT + SLOT / 2} y={LABEL_Y + 18} textAnchor="middle"
            fontSize={11} fill={colors.textMuted} fontWeight="600">
            {hourLabel(h.ms)}
          </SvgText>
        ) : null)}
      </Svg>

      {/* legend + the formula, so the chart explains itself */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: colors.textMuted }]} />
          <Text style={styles.legendText}>bar height = Rain Radar mm/h</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: '#ff9500' }]} />
          <Text style={styles.legendText}>colour = flood risk</Text>
        </View>
        {hasTide && (
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: '#38bdf8', height: 2 }]} />
            <Text style={styles.legendText}>tide ({stationName})</Text>
          </View>
        )}
      </View>
      <Text style={styles.formula}>
        Rain Radar mm/h → rolling 24 h accumulation → × barangay susceptibility
        {tidalInfluence > 0
          ? ` → × tide (influence ${tidalInfluence.toFixed(2)}) = risk.`
          : ' = risk. This barangay sits above the tidal reach, so the tide does not change its risk.'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md, marginTop: space.xs },
  title: { color: colors.text, fontSize: font.body, fontWeight: '800' },
  headline: { color: colors.textSoft, fontSize: font.small, marginTop: 2, lineHeight: 18 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 12, height: 8, borderRadius: 2 },
  legendText: { color: colors.textMuted, fontSize: 9.5 },
  formula: { color: colors.textMuted, fontSize: 9.5, lineHeight: 13, fontStyle: 'italic', marginTop: 5 },
})
