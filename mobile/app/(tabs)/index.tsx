import { ScrollView, View, Text, StyleSheet, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { ScreenHeader } from '../../components/ScreenHeader'
import { StormCard } from '../../components/StormCard'
import { Loading, EmptyState, ErrorNote, SectionLabel } from '../../components/ui'
import { useStormData } from '../../hooks/useStormData'
import { API_BASE, API_IS_PLACEHOLDER } from '../../lib/config'
import { colors, space, font, radius } from '../../lib/theme'
import type { ParAlert } from '../../lib/alerts'

export default function StormsScreen() {
  const { storms, alerts, source, loading, refreshing, error, lastUpdated, refresh } = useStormData()
  const router = useRouter()

  const focusOnMap = (name: string) =>
    router.navigate({ pathname: '/map', params: { focus: name, fk: String(Date.now()) } })

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="HeadsUp"
        subtitle="Real-time PAR · Western Pacific"
        right={<Ionicons name="rainy" size={26} color={colors.primary} />}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        {API_IS_PLACEHOLDER && (
          <ErrorNote message={`API URL not set yet. Edit app.json → extra.apiBaseUrl to your PC's LAN IP (currently ${API_BASE}).`} />
        )}

        <ThreatHero alerts={alerts} loading={loading} />

        <View style={styles.sectionHead}>
          <SectionLabel>Active storms{storms.length ? ` · ${storms.length}` : ''}</SectionLabel>
          {lastUpdated && (
            <Text style={styles.updated}>
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {source ? ` · ${source}` : ''}
            </Text>
          )}
        </View>

        {loading && !storms.length && <Loading label="Fetching live storms…" />}
        {error && !storms.length && <ErrorNote message={error} />}
        {!loading && !error && !storms.length && (
          <EmptyState icon="🌤️" title="No active storms" note="The Western Pacific is calm right now. Pull down to refresh." />
        )}

        <View style={{ gap: space.md }}>
          {storms.map(s => (
            <StormCard key={s.name} storm={s} alert={alerts.find(a => a.storm === s.name)}
              onPress={() => focusOnMap(s.name)} />
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

// ── PAR threat hero ─────────────────────────────────────────────────
function ThreatHero({ alerts, loading }: { alerts: ParAlert[]; loading: boolean }) {
  const inside = alerts.filter(a => a.status === 'inside')
  const approaching = alerts.filter(a => a.status === 'approaching')
  const watch = alerts.filter(a => a.status === 'watch')

  const state =
    inside.length ? { color: colors.danger, icon: 'warning' as const, title: 'Typhoon inside the PAR',
      note: inside.map(a => a.storm).join(', ') }
    : approaching.length ? { color: colors.warn, icon: 'alert-circle' as const, title: 'Storm approaching the PAR',
      note: approaching.map(a => a.storm).join(', ') }
    : watch.length ? { color: colors.watch, icon: 'eye' as const, title: 'Watching near the PAR',
      note: watch.map(a => a.storm).join(', ') }
    : { color: colors.success, icon: 'checkmark-circle' as const, title: 'All clear in the PAR',
      note: loading ? 'Checking the latest storm positions…' : 'No storms threatening the Philippines right now.' }

  return (
    <View style={[styles.hero, { borderColor: `${state.color}55`, backgroundColor: `${state.color}14` }]}>
      <View style={[styles.heroIcon, { backgroundColor: `${state.color}22` }]}>
        <Ionicons name={state.icon} size={26} color={state.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.heroTitle, { color: state.color }]}>{state.title}</Text>
        <Text style={styles.heroNote}>{state.note}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    borderWidth: 1, borderRadius: radius.lg, padding: space.lg,
  },
  heroIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: font.h2, fontWeight: '800' },
  heroNote: { color: colors.textSoft, fontSize: font.small, marginTop: 2, lineHeight: 18 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  updated: { color: colors.textMuted, fontSize: font.tiny },
})
