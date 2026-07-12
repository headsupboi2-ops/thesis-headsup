import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, space, font, radius } from '../lib/theme'
import type { DayForecast } from '../lib/weather'

/** Horizontal 7-day forecast cards. Tapping a day jumps the timeline to it. */
export function ForecastStrip({
  days, activeDay, onSelectDay,
}: {
  days: DayForecast[]
  activeDay: number
  onSelectDay: (dayIndex: number) => void
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {days.map(d => {
        const active = d.dayIndex === activeDay
        return (
          <Pressable key={d.dayIndex} onPress={() => onSelectDay(d.dayIndex)}
            style={[styles.card, active && styles.cardActive]}>
            <Text style={[styles.day, active && { color: colors.text }]}>{d.label}</Text>
            <Ionicons name={d.icon as keyof typeof Ionicons.glyphMap} size={20}
              color={active ? colors.primary : colors.textSoft} style={{ marginVertical: 3 }} />
            <Text style={[styles.temp, active && { color: colors.text }]}>
              {Number.isFinite(d.tempHigh) ? `${d.tempHigh}°` : '—'}
              <Text style={styles.low}> {Number.isFinite(d.tempLow) ? `${d.tempLow}°` : ''}</Text>
            </Text>
            <View style={styles.rain}>
              <Ionicons name="water" size={9} color={colors.primary} />
              <Text style={styles.rainText}>{d.rainMm}mm</Text>
            </View>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  card: {
    width: 66, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.md,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  cardActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  day: { color: colors.textSoft, fontSize: font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  temp: { color: colors.textSoft, fontSize: font.body, fontWeight: '800' },
  low: { color: colors.textMuted, fontSize: font.tiny, fontWeight: '600' },
  rain: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  rainText: { color: colors.textMuted, fontSize: 9 },
})
