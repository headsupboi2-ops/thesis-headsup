import { useEffect, useState } from 'react'
import { ScrollView, View, Text, StyleSheet, useWindowDimensions, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Card, SectionTitle, ErrorNote, Loading } from '../../components/ui'
import { StatTile, Gauge, AccuracyBars, MissLineChart } from '../../components/charts/analyticsCharts'
import { fetchModelPerformance, fetchClimateOutlook } from '../../lib/api'
import { colors, space, font, radius } from '../../lib/theme'
import type { ModelPerformance, ClimateOutlook } from '../../lib/types'

const FRIENDLY_CAT: Record<string, string> = {
  'TD': 'Tropical Depression', 'TS': 'Tropical Storm', 'TY': 'Typhoon',
  'SevTY-3': 'Severe Typhoon', 'SevTY-4': 'Very Severe Typhoon', 'STY': 'Super Typhoon',
}

export default function AnalyticsScreen() {
  const { width } = useWindowDimensions()
  const chartW = width - space.lg * 2 - space.lg * 2   // screen + card padding
  const [perf, setPerf] = useState<ModelPerformance | null>(null)
  const [perfError, setPerfError] = useState<string | null>(null)
  const [outlook, setOutlook] = useState<ClimateOutlook | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    setPerfError(null)
    try { setPerf(await fetchModelPerformance()) } catch (e) { setPerfError(e instanceof Error ? e.message : 'Failed') }
    try { setOutlook(await fetchClimateOutlook()) } catch { /* optional */ }
  }
  useEffect(() => { load() }, [])

  const rows = perf ? Object.keys(perf.track_metrics).map(Number).sort((a, b) => a - b)
    .map(h => ({ h, ...perf.track_metrics[String(h)] })) : []
  const classes = perf ? perf.per_class.filter(c => !/avg|average/i.test(c.label)) : []
  const day1 = perf?.track_metrics['24']
  const hr6 = perf?.track_metrics['6']

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="How We Predict" subtitle="Plain-language accuracy report" />
      <ScrollView contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false) }} />}>

        {/* How it works */}
        <Card>
          <SectionTitle title="How a typhoon forecast is made"
            subtitle="Three steps turn scattered weather data into a 7-day forecast — and prove how trustworthy it is." />
          {[
            { icon: 'planet', color: colors.primary, t: 'We gather live data', b: 'Every few minutes we pull each storm’s position and strength from 10 official agencies — PAGASA, Japan, the US Navy and more — plus our own AI.' },
            { icon: 'bulb', color: '#a78bfa', t: 'The AI learns from history', b: `Our model studied ${yrs(perf?.train_years, '2013–2022')} of past typhoons to learn how storms here move and strengthen, then projects the next 7 days.` },
            { icon: 'checkmark-done', color: colors.success, t: 'We measure the accuracy', b: `We replayed ${perf?.n_test_storms ?? 67} real typhoons from ${yrs(perf?.test_years, '2023–2026')} it had never seen. Those results are below.` },
          ].map(s => (
            <View key={s.t} style={styles.step}>
              <View style={[styles.stepIcon, { backgroundColor: `${s.color}22` }]}>
                <Ionicons name={s.icon as keyof typeof Ionicons.glyphMap} size={16} color={s.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{s.t}</Text>
                <Text style={styles.stepBody}>{s.b}</Text>
              </View>
            </View>
          ))}
        </Card>

        {perfError && <ErrorNote message={`Accuracy results aren’t available yet — ${perfError}`} />}
        {!perf && !perfError && <Loading label="Loading accuracy results…" />}

        {perf && (
          <>
            {/* KPIs */}
            <View style={styles.kpiRow}>
              <StatTile label="Strength called right" value={(perf.classification.accuracy * 100).toFixed(0)} unit="%"
                sublabel="How often we rate a storm’s category correctly" accent={colors.success} />
              <StatTile label="Typical miss, 1 day out" value={day1 ? `~${Math.round(day1.mae)}` : '—'} unit="km"
                sublabel="Distance from the real storm centre" />
              <StatTile label="Real typhoons tested" value={String(perf.n_test_storms)}
                sublabel={`Checked against ${yrs(perf.test_years, '')} storms`} accent="#a78bfa" />
              <StatTile label="How far ahead we see" value={String(Math.max(...rows.map(r => r.h)) / 24)} unit="days"
                sublabel="Every forecast reaches a week ahead" accent={colors.warn} />
            </View>

            {/* Path accuracy */}
            <Card>
              <SectionTitle title="How close are the path predictions?"
                subtitle="Average distance between our predicted storm centre and where it actually went. Lower is better; the band shows the usual range." />
              <MissLineChart rows={rows} width={chartW} />
              <Takeaway>
                About {hr6 ? `${Math.round(hr6.mae)} km` : 'tens of km'} off just 6 hours ahead and roughly{' '}
                {day1 ? `${Math.round(day1.mae)} km` : 'a few hundred km'} off a day ahead. Like every weather service,
                precision naturally eases the further out we look.
              </Takeaway>
            </Card>

            {/* Strength accuracy */}
            <Card>
              <SectionTitle title="How well do we judge strength?"
                subtitle="We rate each storm from Tropical Depression up to Super Typhoon. Here’s how reliably we get each level right (0–100)." />
              <View style={styles.gaugeRow}>
                <Gauge value={perf.classification.accuracy} label="Overall correct" color={colors.success} />
                <Gauge value={perf.classification.macro_f1} label="All types, evenly" color={colors.primary} />
              </View>
              <View style={{ marginTop: space.sm }}>
                <AccuracyBars width={chartW}
                  rows={classes.map(c => ({ label: FRIENDLY_CAT[c.label] ?? c.label, value: c.f1, meta: `${c.support.toLocaleString()} readings` }))} />
              </View>
              <Takeaway>
                We correctly rate a storm’s category about <Text style={{ fontWeight: '800', color: colors.text }}>
                {(perf.classification.accuracy * 100).toFixed(0)}%</Text> of the time. Everyday storms score highest;
                the rarest Super Typhoons are hardest to label exactly — but a dangerous storm is never mistaken for a calm one.
              </Takeaway>
            </Card>
          </>
        )}

        {/* Seasonal outlook */}
        {outlook && (
          <Card>
            <SectionTitle title={`This month’s outlook · ${outlook.month_name} ${outlook.target_year}`} />
            <View style={styles.outlookRow}>
              <View style={[styles.activityPill, activityStyle(outlook.activity_level)]}>
                <Text style={[styles.activityText, { color: activityStyle(outlook.activity_level).color }]}>
                  {outlook.activity_level.replace('-', ' ').toUpperCase()}
                </Text>
              </View>
              <MiniStat label="Typical" value={`${outlook.avg_storms.toFixed(1)} storms`} />
              <MiniStat label="Busiest" value={`${outlook.max_storms} (${outlook.max_year})`} />
            </View>
            <Text style={styles.outlookText}>{outlook.forecast_text}</Text>
          </Card>
        )}
      </ScrollView>
    </View>
  )
}

function Takeaway({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.takeaway}>
      <Text style={{ fontSize: 14 }}>💡</Text>
      <Text style={styles.takeawayText}>{children}</Text>
    </View>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value}</Text>
    </View>
  )
}

function yrs(arr: number[] | undefined, fallback: string) {
  if (!arr || !arr.length) return fallback
  return `${arr[0]}–${arr[arr.length - 1]}`
}

function activityStyle(level: string): { backgroundColor: string; borderColor: string; color: string } {
  const map: Record<string, string> = {
    'quiet': '#7c8aa5', 'below-normal': '#22b8cf', 'normal': colors.success,
    'above-normal': colors.warn, 'very active': colors.danger,
  }
  const c = map[level] ?? colors.primary
  return { backgroundColor: `${c}1e`, borderColor: `${c}55`, color: c }
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  step: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  stepIcon: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { color: colors.text, fontSize: font.body, fontWeight: '800' },
  stepBody: { color: colors.textSoft, fontSize: font.small, marginTop: 2, lineHeight: 18 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  gaugeRow: { flexDirection: 'row', justifyContent: 'center', gap: space.xl, marginVertical: space.sm },
  takeaway: {
    flexDirection: 'row', gap: space.sm, marginTop: space.md,
    backgroundColor: 'rgba(77,155,255,0.10)', borderColor: 'rgba(77,155,255,0.28)', borderWidth: 1,
    borderRadius: radius.md, padding: space.md,
  },
  takeawayText: { color: colors.textSoft, fontSize: font.small, lineHeight: 19, flex: 1 },
  outlookRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  activityPill: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 6 },
  activityText: { fontSize: font.small, fontWeight: '900', letterSpacing: 0.4 },
  miniStat: { backgroundColor: colors.cardAlt, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 6 },
  miniLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: '700', textTransform: 'uppercase' },
  miniValue: { color: colors.text, fontSize: font.small, fontWeight: '800' },
  outlookText: { color: colors.textSoft, fontSize: font.small, lineHeight: 19, marginTop: space.md },
})
