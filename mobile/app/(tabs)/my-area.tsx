import { useEffect, useState } from 'react'
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Circle } from 'react-native-svg'
import { ScreenHeader } from '../../components/ScreenHeader'
import { CityPicker } from '../../components/CityPicker'
import { Loading, ErrorNote, SectionLabel } from '../../components/ui'
import { useStormData } from '../../hooks/useStormData'
import { useLocation } from '../../hooks/useLocation'
import { fetchMultiModel } from '../../lib/api'
import { computeImpact, mostThreatening, riskMeta, type Impact, type ModelLite } from '../../lib/impact'
import { prepTimeline, type PrepItem } from '../../lib/prep'
import { colors, space, font, radius } from '../../lib/theme'
import type { TrackPoint } from '../../lib/types'

export default function MyAreaScreen() {
  const { city, setCity } = useLocation()
  const { storms } = useStormData()
  const [impact, setImpact] = useState<Impact | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [refreshing, setRefreshing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

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
      </ScrollView>

      <CityPicker visible={pickerOpen} current={city} onSelect={setCity} onClose={() => setPickerOpen(false)} />
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

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
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
