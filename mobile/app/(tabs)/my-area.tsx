import { useEffect, useState } from 'react'
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Circle } from 'react-native-svg'
import { ScreenHeader } from '../../components/ScreenHeader'
import { CityPicker } from '../../components/CityPicker'
import { BarangayPicker } from '../../components/BarangayPicker'
import { Loading, ErrorNote, SectionLabel } from '../../components/ui'
import { useStormData } from '../../hooks/useStormData'
import { useLocation } from '../../hooks/useLocation'
import { fetchMultiModel } from '../../lib/api'
import { fetchWeatherGrid, type WeatherGrid } from '../../lib/weather'
import { computeImpact, mostThreatening, riskMeta, type Impact, type ModelLite } from '../../lib/impact'
import { prepTimeline, type PrepItem } from '../../lib/prep'
import { rainAccum, floodPotential, floodMeta } from '../../lib/flood'
import { surgeRisk, surgeMeta } from '../../lib/surge'
import { nearestBarangay, susceptibilityAt, coastalExposureAt, type HazardArea } from '../../lib/hazard'
import { colors, space, font, radius } from '../../lib/theme'
import type { TrackPoint } from '../../lib/types'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function MyAreaScreen() {
  const { city, setCity } = useLocation()
  const { storms } = useStormData()
  const [impact, setImpact] = useState<Impact | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [refreshing, setRefreshing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [bgyPickerOpen, setBgyPickerOpen] = useState(false)
  const [barangay, setBarangay] = useState<HazardArea | null>(null)
  const [weatherGrid, setWeatherGrid] = useState<WeatherGrid | null>(null)

  // Barangay-level detail for Naga; other cities resolve from the hazard zones.
  const isNaga = city.name === 'Naga'
  const bgy = isNaga ? (barangay ?? nearestBarangay(city.lat, city.lon)) : null
  const loc = bgy ? { lat: bgy.lat, lon: bgy.lon } : { lat: city.lat, lon: city.lon }
  const susceptibility = bgy ? bgy.floodSusceptibility : susceptibilityAt(city.lat, city.lon)
  const exposure = bgy ? bgy.coastalExposure : coastalExposureAt(city.lat, city.lon)
  const areaLabel = bgy ? `${bgy.name}, Naga` : city.name

  // Reset the barangay selection when the city changes away from Naga.
  useEffect(() => { if (!isNaga) setBarangay(null) }, [isNaga])

  // Fetch the rainfall grid once (cached 30 min server-side) for flood risk.
  useEffect(() => {
    let alive = true
    fetchWeatherGrid().then(g => { if (alive) setWeatherGrid(g) }).catch(() => {})
    return () => { alive = false }
  }, [])

  async function evaluate(manual = false) {
    manual ? setRefreshing(true) : setState('loading')
    try {
      if (!storms.length) { setImpact(null); setState('done'); return }
      const impacts: Impact[] = []
      for (const s of storms) {
        try {
          const history: TrackPoint[] = s.path?.length ? s.path.slice(-16) : [{ lat: s.lat, lon: s.lon }]
          const res = await fetchMultiModel(s.name, history)
          const models: ModelLite[] = res.models.map(m => ({
            model: m.model, label: m.label, color: m.color, source: m.source, points: m.points,
          }))
          const imp = computeImpact(s.name, models, city.lat, city.lon, Math.round(s.wind_speed))
          if (imp) impacts.push(imp)
        } catch { /* skip this storm */ }
      }
      setImpact(mostThreatening(impacts))
      setState('done')
    } catch {
      setState('error')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { evaluate() }, [storms, city]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="My Area" subtitle="Will it hit me?"
        right={
          <Pressable style={styles.cityChip} onPress={() => setPickerOpen(true)}>
            <Ionicons name="location" size={13} color={colors.primary} />
            <Text style={styles.cityChipText} numberOfLines={1}>{city.name}</Text>
            <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => evaluate(true)} tintColor={colors.primary} />}>

        {isNaga && (
          <Pressable style={styles.bgyChip} onPress={() => setBgyPickerOpen(true)}>
            <Ionicons name="home" size={13} color={colors.primary} />
            <Text style={styles.bgyChipText} numberOfLines={1}>Barangay: {bgy?.name}</Text>
            <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
          </Pressable>
        )}

        {state === 'loading' && !impact && <Loading label={`Checking storms near ${city.name}…`} />}
        {state === 'error' && <ErrorNote message={`Couldn't load the forecast for ${city.name}. Pull to retry.`} />}

        {state !== 'loading' && (!impact || impact.level === 'clear')
          ? <CalmCard city={city.name} hasStorms={storms.length > 0} closest={impact?.closestKm} />
          : impact && (
            <>
              <RiskHero impact={impact} city={city.name} />
              <MetricsRow impact={impact} />
              <PrepSection impact={impact} />
              <ModelAgreement impact={impact} />
            </>
          )}

        <FloodSurgeCard grid={weatherGrid} lat={loc.lat} lon={loc.lon}
          susceptibility={susceptibility} exposure={exposure} impact={impact} areaLabel={areaLabel} />
      </ScrollView>

      <CityPicker visible={pickerOpen} current={city} onSelect={setCity} onClose={() => setPickerOpen(false)} />
      <BarangayPicker visible={bgyPickerOpen} current={bgy} onSelect={setBarangay} onClose={() => setBgyPickerOpen(false)} />
    </View>
  )
}

// ── Risk hero with a probability ring ───────────────────────────────
function RiskHero({ impact, city }: { impact: Impact; city: string }) {
  const meta = riskMeta(impact.level)
  const pct = Math.round(impact.strikeProbability * 100)
  const size = 156, stroke = 13, r = (size - stroke) / 2, C = 2 * Math.PI * r
  const headline =
    impact.level === 'high' ? `${impact.storm} is likely to affect ${city}`
    : impact.level === 'moderate' ? `${impact.storm} may affect ${city}`
    : `${impact.storm} is being watched near ${city}`

  return (
    <View style={[styles.hero, { borderColor: `${meta.color}55`, backgroundColor: `${meta.color}12` }]}>
      <View style={{ alignItems: 'center' }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={meta.color} strokeWidth={stroke} fill="none"
            strokeLinecap="round" strokeDasharray={`${C}`} strokeDashoffset={C * (1 - impact.strikeProbability)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={[styles.ringPct, { color: meta.color }]}>{pct}<Text style={styles.ringPctSign}>%</Text></Text>
          <Text style={styles.ringSub}>chance of impact</Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.riskWord, { color: meta.color }]}>{meta.word.toUpperCase()}</Text>
        <Text style={styles.heroHeadline}>{headline}</Text>
        <Text style={styles.heroNote}>
          {impact.striking} of {impact.total} forecast models bring it within 100 km of {city}.
        </Text>
      </View>
    </View>
  )
}

function MetricsRow({ impact }: { impact: Impact }) {
  const eta = impact.etaEarliest
  const etaText = eta == null ? '—' : eta < 24 ? `~${eta}h` : `~${Math.floor(eta / 24)}d ${eta % 24}h`
  const window = impact.etaEarliest != null && impact.etaLatest != null && impact.etaLatest !== impact.etaEarliest
    ? `to ${impact.etaLatest < 24 ? impact.etaLatest + 'h' : Math.floor(impact.etaLatest / 24) + 'd'}`
    : undefined
  return (
    <View style={styles.metrics}>
      <Metric icon="navigate-circle" label="Closest approach" value={`${impact.closestKm} km`} />
      <Metric icon="time" label="Arrives in" value={etaText} sub={window} />
      <Metric icon="warning" label="Expected signal"
        value={impact.tcws?.short ?? '—'} color={impact.tcws?.color} />
    </View>
  )
}

function Metric({ icon, label, value, sub, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={15} color={color ?? colors.primary} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, color ? { color } : null]}>{value}</Text>
      {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
    </View>
  )
}

function PrepSection({ impact }: { impact: Impact }) {
  const signal = impact.tcws?.signal ?? 0
  const items: PrepItem[] = prepTimeline(signal, impact.etaEarliest)
  if (!items.length) return null
  return (
    <View style={{ gap: space.sm }}>
      <SectionLabel>Prepare by</SectionLabel>
      {impact.tcws && (
        <Text style={styles.prepIntro}>
          Expecting <Text style={{ color: impact.tcws.color, fontWeight: '800' }}>{impact.tcws.short}</Text> · {impact.tcws.label}. Do these in order:
        </Text>
      )}
      {items.map((it, i) => (
        <View key={i} style={[styles.prepRow, it.overdue && { borderColor: `${colors.danger}55`, backgroundColor: `${colors.danger}10` }]}>
          <Ionicons name={it.icon as keyof typeof Ionicons.glyphMap} size={16}
            color={it.overdue ? colors.danger : colors.primary} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.prepLabel}>{it.label}</Text>
            <Text style={[styles.prepBy, it.overdue && { color: colors.danger }]}>
              {it.overdue ? 'Do this now' : `by ${it.by.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · in ${it.hoursToGo}h`}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function ModelAgreement({ impact }: { impact: Impact }) {
  const sorted = [...impact.perModel].sort((a, b) => a.distanceKm - b.distanceKm)
  return (
    <View style={{ gap: space.sm }}>
      <SectionLabel>Model agreement</SectionLabel>
      <View style={styles.agree}>
        {sorted.map(m => (
          <View key={m.model} style={styles.agreeRow}>
            <View style={[styles.agreeDot, { backgroundColor: m.color }]} />
            <Text style={styles.agreeName}>{m.model.replace('_', ' ')}</Text>
            <Text style={[styles.agreeDist, { color: m.distanceKm <= 100 ? colors.warn : colors.textMuted }]}>{m.distanceKm} km</Text>
            <Text style={styles.agreeSrc}>{m.source === 'live' ? 'LIVE' : 'SIM'}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function CalmCard({ city, hasStorms, closest }: { city: string; hasStorms: boolean; closest?: number }) {
  return (
    <View style={[styles.hero, { borderColor: `${colors.success}55`, backgroundColor: `${colors.success}12`, alignItems: 'center' }]}>
      <View style={[styles.calmIcon, { backgroundColor: `${colors.success}22` }]}>
        <Ionicons name="shield-checkmark" size={30} color={colors.success} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.riskWord, { color: colors.success }]}>ALL CLEAR</Text>
        <Text style={styles.heroHeadline}>No storm threatens {city}</Text>
        <Text style={styles.heroNote}>
          {hasStorms
            ? `The nearest active storm stays ${closest != null ? `~${closest} km` : 'well'} away. You're safe for now.`
            : 'No active storms in the Western Pacific right now.'}
        </Text>
      </View>
    </View>
  )
}

// ── Flood & storm-surge risk for the selected area ──────────────────
function FloodSurgeCard({ grid, lat, lon, susceptibility, exposure, impact, areaLabel }: {
  grid: WeatherGrid | null; lat: number; lon: number; susceptibility: number
  exposure: 'none' | 'bay' | 'open'; impact: Impact | null; areaLabel: string
}) {
  if (!grid) return null

  // Peak 24-hour rainfall over the 7-day forecast at this location.
  const hours = Math.min(grid.n_hours ?? 168, 168)
  let peakMm = 0, peakDay = 0
  for (let d = 0; d < 7; d++) {
    const s = d * 24
    if (s >= hours) break
    const mm = rainAccum(grid.points, lat, lon, s, Math.min(s + 24, hours))
    if (mm > peakMm) { peakMm = mm; peakDay = d }
  }
  const flood = floodPotential(peakMm, susceptibility)
  const fMeta = floodMeta(flood.level)
  const dayDate = new Date(Date.now() + peakDay * 86400000)
  const dayLabel = peakDay === 0 ? 'today' : peakDay === 1 ? 'tomorrow' : DOW[dayDate.getDay()]

  const surge = surgeRisk(impact?.expectedWindKt ?? 0, impact?.closestKm ?? 9999, impact?.etaEarliest ?? null, exposure)
  const sMeta = surgeMeta(surge.level)

  return (
    <View style={{ gap: space.sm }}>
      <SectionLabel>Flood & surge risk</SectionLabel>
      <View style={styles.floodCard}>
        <View style={styles.floodRow}>
          <View style={[styles.floodBadge, { backgroundColor: `${fMeta.color}22`, borderColor: `${fMeta.color}66` }]}>
            <Ionicons name="water" size={17} color={fMeta.color} />
            <Text style={[styles.floodWord, { color: fMeta.color }]}>{fMeta.word}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.floodTitle}>Flood potential · {areaLabel}</Text>
            <Text style={styles.floodDetail}>
              {peakMm >= 1 ? `${flood.rainMm} mm/24h forecast ${dayLabel}` : 'Little rain forecast this week'}
            </Text>
            <Text style={styles.floodAdvice}>{fMeta.advice}</Text>
          </View>
        </View>

        <View style={[styles.floodRow, styles.surgeRow]}>
          <View style={[styles.floodBadge, { backgroundColor: `${sMeta.color}22`, borderColor: `${sMeta.color}66` }]}>
            <Ionicons name="warning" size={17} color={sMeta.color} />
            <Text style={[styles.floodWord, { color: sMeta.color }]}>{sMeta.word}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.floodTitle}>Storm surge{surge.level !== 'none' && exposure !== 'none' ? ` · ${surge.band}` : ''}</Text>
            <Text style={styles.floodDetail}>
              {exposure === 'none' ? 'Inland — no coastal surge risk'
                : surge.level === 'none' ? 'No significant surge expected'
                : `Surge up to ${surge.band} possible on exposed coast`}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.disclaimer}>
        Risk index from forecast rainfall × local flood susceptibility (PAGASA thresholds). Not a surveyed flood map.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  bgyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft, borderColor: `${colors.primary}55`, borderWidth: 1,
    borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 7,
  },
  bgyChipText: { color: colors.text, fontSize: font.small, fontWeight: '800' },
  floodCard: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.md },
  floodRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  surgeRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  floodBadge: {
    width: 74, alignItems: 'center', justifyContent: 'center', gap: 2,
    borderWidth: 1, borderRadius: radius.md, paddingVertical: space.sm,
  },
  floodWord: { fontSize: font.small, fontWeight: '900' },
  floodTitle: { color: colors.text, fontSize: font.body, fontWeight: '800' },
  floodDetail: { color: colors.textSoft, fontSize: font.small, marginTop: 2, lineHeight: 17 },
  floodAdvice: { color: colors.textMuted, fontSize: font.tiny, marginTop: 3, lineHeight: 15 },
  disclaimer: { color: colors.textMuted, fontSize: 9.5, lineHeight: 13, fontStyle: 'italic' },
  cityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 150,
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6,
  },
  cityChipText: { color: colors.text, fontSize: font.small, fontWeight: '800' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderWidth: 1, borderRadius: radius.lg, padding: space.lg },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringPct: { fontSize: 38, fontWeight: '800' },
  ringPctSign: { fontSize: 18 },
  ringSub: { color: colors.textMuted, fontSize: font.tiny, marginTop: -2 },
  riskWord: { fontSize: font.tiny, fontWeight: '900', letterSpacing: 1.2 },
  heroHeadline: { color: colors.text, fontSize: font.h3, fontWeight: '800', marginTop: 3, lineHeight: 20 },
  heroNote: { color: colors.textSoft, fontSize: font.small, marginTop: 5, lineHeight: 18 },
  calmIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  metrics: { flexDirection: 'row', gap: space.sm },
  metric: {
    flex: 1, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: space.md, gap: 3,
  },
  metricLabel: { color: colors.textMuted, fontSize: 9.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  metricValue: { color: colors.text, fontSize: font.h3, fontWeight: '800' },
  metricSub: { color: colors.textMuted, fontSize: font.tiny },
  prepIntro: { color: colors.textSoft, fontSize: font.small, lineHeight: 18 },
  prepRow: {
    flexDirection: 'row', gap: space.sm, alignItems: 'flex-start',
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: space.md,
  },
  prepLabel: { color: colors.text, fontSize: font.small, fontWeight: '600', lineHeight: 18 },
  prepBy: { color: colors.textMuted, fontSize: font.tiny, marginTop: 2, fontWeight: '700' },
  agree: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 7 },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  agreeDot: { width: 9, height: 9, borderRadius: 5 },
  agreeName: { color: colors.textSoft, fontSize: font.small, fontWeight: '700', flex: 1 },
  agreeDist: { fontSize: font.small, fontWeight: '700', fontVariant: ['tabular-nums'] },
  agreeSrc: { color: colors.textMuted, fontSize: 8.5, fontWeight: '800', width: 28, textAlign: 'right' },
})
