// ── react-native-svg chart primitives for the Accuracy screen ───────
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Path, Line, Rect, Circle, G, Text as SvgText } from 'react-native-svg'
import { colors, space, font, radius } from '../../lib/theme'

const INK = colors.text
const INK_SOFT = colors.textSoft
const MUTED = colors.textMuted
const GRID = 'rgba(255,255,255,0.10)'

// ── Stat tile (hero number) ─────────────────────────────────────────
export function StatTile({ label, value, unit, sublabel, accent = colors.primary }: {
  label: string; value: string; unit?: string; sublabel?: string; accent?: string
}) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 4 }}>
        <Text style={[styles.tileValue, { color: accent }]}>{value}</Text>
        {unit && <Text style={styles.tileUnit}>{unit}</Text>}
      </View>
      {sublabel && <Text style={styles.tileSub}>{sublabel}</Text>}
    </View>
  )
}

// ── Radial gauge (0..1) ─────────────────────────────────────────────
export function Gauge({ value, label, color = colors.primary, size = 128 }: {
  value: number; label: string; color?: string; size?: number
}) {
  const stroke = 11
  const r = (size - stroke) / 2 - 2
  const cx = size / 2, cy = size / 2
  const start = 135, sweep = 270
  const v = Math.max(0, Math.min(1, value))
  const polar = (deg: number) => {
    const a = (deg * Math.PI) / 180
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }
  const arc = (frac: number) => {
    const p0 = polar(start), p1 = polar(start + sweep * frac)
    const large = sweep * frac > 180 ? 1 : 0
    return `M${p0.x.toFixed(1)},${p0.y.toFixed(1)} A${r},${r} 0 ${large} 1 ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`
  }
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <Path d={arc(1)} stroke="rgba(77,155,255,0.16)" strokeWidth={stroke} strokeLinecap="round" fill="none" />
        <Path d={arc(v)} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        <SvgText x={cx} y={cy + 6} fontSize={size * 0.22} fontWeight="800" fill={INK} textAnchor="middle">
          {(v * 100).toFixed(0)}%
        </SvgText>
      </Svg>
      <Text style={styles.gaugeLabel}>{label}</Text>
    </View>
  )
}

// ── Horizontal accuracy bars ────────────────────────────────────────
export function AccuracyBars({ rows, width }: {
  rows: Array<{ label: string; value: number; meta?: string }>   // value 0..1
  width: number
}) {
  const labelW = 118
  const valueW = 34
  const rowH = 34
  const barH = 12
  const trackW = width - labelW - valueW
  const H = rows.length * rowH + 6

  return (
    <Svg width={width} height={H}>
      {[0, 0.5, 1].map(t => (
        <Line key={t} x1={labelW + t * trackW} x2={labelW + t * trackW} y1={0} y2={rows.length * rowH}
          stroke={GRID} strokeWidth={1} />
      ))}
      {rows.map((row, i) => {
        const y = i * rowH
        const w = Math.max(row.value * trackW, 2)
        return (
          <G key={row.label}>
            <SvgText x={labelW - 8} y={y + rowH / 2 - 2} fontSize={11} fontWeight="700" fill={INK} textAnchor="end">
              {row.label}
            </SvgText>
            {row.meta && (
              <SvgText x={labelW - 8} y={y + rowH / 2 + 10} fontSize={8.5} fill={MUTED} textAnchor="end">
                {row.meta}
              </SvgText>
            )}
            <Rect x={labelW} y={y + rowH / 2 - barH / 2} width={trackW} height={barH} rx={3} fill="rgba(255,255,255,0.06)" />
            <Rect x={labelW} y={y + rowH / 2 - barH / 2} width={w} height={barH} rx={3} fill={colors.primary} />
            <SvgText x={labelW + w + 6} y={y + rowH / 2 + 3} fontSize={10.5} fontWeight="700" fill={INK_SOFT}>
              {Math.round(row.value * 100)}
            </SvgText>
          </G>
        )
      })}
    </Svg>
  )
}

// ── Line chart: average miss vs lead time, with P50–P90 band ────────
export function MissLineChart({ rows, width }: {
  rows: Array<{ h: number; mae: number; p50: number; p90: number }>
  width: number
}) {
  const H = 220
  const m = { top: 14, right: 16, bottom: 34, left: 46 }
  const iw = width - m.left - m.right
  const ih = H - m.top - m.bottom
  const xs = rows.map(r => r.h)
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const yMax = niceMax(Math.max(...rows.map(r => Math.max(r.mae, r.p90))))
  const sx = (x: number) => m.left + ((x - xMin) / (xMax - xMin || 1)) * iw
  const sy = (y: number) => m.top + ih - (y / (yMax || 1)) * ih
  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${sx(r.h).toFixed(1)},${sy(r.mae).toFixed(1)}`).join(' ')
  const band =
    rows.map((r, i) => `${i ? 'L' : 'M'}${sx(r.h).toFixed(1)},${sy(r.p90).toFixed(1)}`).join(' ') + ' ' +
    [...rows].reverse().map(r => `L${sx(r.h).toFixed(1)},${sy(r.p50).toFixed(1)}`).join(' ') + ' Z'
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(yMax * t))
  const leadLabel = (h: number) => (h < 24 ? `${h}h` : `${h / 24}d`)

  return (
    <Svg width={width} height={H}>
      {yTicks.map(t => (
        <G key={t}>
          <Line x1={m.left} x2={m.left + iw} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth={1} />
          <SvgText x={m.left - 6} y={sy(t) + 3} fontSize={9} fill={MUTED} textAnchor="end">
            {t.toLocaleString()}
          </SvgText>
        </G>
      ))}
      {rows.map(r => (
        <SvgText key={r.h} x={sx(r.h)} y={H - 18} fontSize={9} fill={MUTED} textAnchor="middle">{leadLabel(r.h)}</SvgText>
      ))}
      <SvgText x={m.left + iw / 2} y={H - 2} fontSize={9.5} fontWeight="700" fill={INK_SOFT} textAnchor="middle">
        How far ahead
      </SvgText>
      <Path d={band} fill="rgba(77,155,255,0.14)" />
      <Path d={line} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {rows.map(r => <Circle key={r.h} cx={sx(r.h)} cy={sy(r.mae)} r={3} fill={colors.primary} />)}
    </Svg>
  )
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1, flexBasis: '47%',
    backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: space.md,
  },
  tileLabel: { color: MUTED, fontSize: font.tiny, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  tileValue: { fontSize: 26, fontWeight: '800' },
  tileUnit: { color: MUTED, fontSize: font.body, fontWeight: '700' },
  tileSub: { color: colors.textSoft, fontSize: 11, marginTop: 4, lineHeight: 15 },
  gaugeLabel: { color: colors.textSoft, fontSize: font.tiny, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: -2 },
})
