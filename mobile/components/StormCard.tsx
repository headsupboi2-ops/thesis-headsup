import { View, Text, StyleSheet, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, space, font, radius, CAT_COLOR, CAT_NAME, freshnessBadge } from '../lib/theme'
import { CategoryBadge } from './ui'
import type { LiveStorm } from '../lib/types'
import type { ParAlert } from '../lib/alerts'
import { etaLabel } from '../lib/alerts'

export function StormCard({ storm, alert, onPress }: { storm: LiveStorm; alert?: ParAlert; onPress?: () => void }) {
  const color = CAT_COLOR[storm.category] ?? colors.textMuted
  const parLine =
    alert?.status === 'inside' ? { text: 'Inside PAR now', color: colors.danger }
    : alert?.status === 'approaching' ? { text: `May enter PAR ${etaLabel(alert.etaHours ?? 0)}`, color: colors.warn }
    : alert?.status === 'watch' ? { text: `${alert.distanceKm} km from PAR`, color: colors.watch }
    : { text: 'Outside PAR', color: colors.textMuted }

  return (
    <Pressable onPress={onPress} disabled={!onPress}
      style={({ pressed }) => [styles.card, pressed && onPress ? { opacity: 0.75 } : null]}>
      <View style={[styles.accent, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.topRow}>
          <Text style={styles.name}>{storm.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CategoryBadge category={storm.category} filled />
            {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
          </View>
        </View>
        <Text style={styles.cat}>{CAT_NAME[storm.category] ?? 'Storm'}</Text>

        <View style={styles.metrics}>
          <Metric icon="speedometer-outline" value={`${Math.round(storm.wind_speed)} kt`} label="winds" />
          {storm.pressure ? <Metric icon="cellular-outline" value={`${Math.round(storm.pressure)}`} label="hPa" /> : null}
          <Metric icon="location-outline" value={`${storm.lat.toFixed(1)}°, ${storm.lon.toFixed(1)}°`} label="" />
        </View>

        <View style={styles.parRow}>
          <View style={[styles.parDot, { backgroundColor: parLine.color }]} />
          <Text style={[styles.parText, { color: parLine.color }]}>{parLine.text}</Text>
          <Freshness storm={storm} />
        </View>
      </View>
    </Pressable>
  )
}

function Freshness({ storm }: { storm: LiveStorm }) {
  const { label, color } = freshnessBadge(storm.freshness, storm.age_hours)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={[styles.source, { color }]}>{label}</Text>
    </View>
  )
}

function Metric({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={13} color={colors.textMuted} />
      <Text style={styles.metricValue}>{value}</Text>
      {label ? <Text style={styles.metricLabel}>{label}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  accent: { width: 5 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg, paddingBottom: 2 },
  name: { color: colors.text, fontSize: font.h2, fontWeight: '800' },
  cat: { color: colors.textSoft, fontSize: font.small, paddingHorizontal: space.lg },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, paddingHorizontal: space.lg, paddingTop: space.md },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricValue: { color: colors.text, fontSize: font.small, fontWeight: '700' },
  metricLabel: { color: colors.textMuted, fontSize: font.tiny },
  parRow: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: space.lg, paddingTop: space.md },
  parDot: { width: 8, height: 8, borderRadius: 4 },
  parText: { fontSize: font.small, fontWeight: '700', flex: 1 },
  source: { color: colors.textMuted, fontSize: font.tiny, textTransform: 'uppercase', letterSpacing: 0.5 },
})
