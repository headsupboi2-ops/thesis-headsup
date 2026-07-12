import { useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'
import { LeafletMap } from '../../components/LeafletMap'
import { ScreenHeader } from '../../components/ScreenHeader'
import { ForecastStrip } from '../../components/ForecastStrip'
import { useStormData } from '../../hooks/useStormData'
import { fetchMultiModel } from '../../lib/api'
import { fetchWeatherGrid, fetchMarineGrid, dailyForecast, type WeatherGrid, type MarineGrid, type DayForecast } from '../../lib/weather'
import { WEATHER_LAYERS, WEATHER_LAYER_BY_ID, type WeatherLayerId, type BasemapId } from '../../lib/weatherLayers'
import { colors, space, font, radius } from '../../lib/theme'
import type { ModelTrack, TrackPoint } from '../../lib/types'

export default function MapScreen() {
  const { storms, forecasts } = useStormData()
  const [spaghetti, setSpaghetti] = useState<{ storm: string; models: ModelTrack[] } | null>(null)
  const [ensembleBusy, setEnsembleBusy] = useState(false)

  const [layerId, setLayerId] = useState<WeatherLayerId | null>(null)
  const [basemap, setBasemap] = useState<BasemapId>('dark')
  const [hour, setHour] = useState(0)

  const [weatherGrid, setWeatherGrid] = useState<WeatherGrid | null>(null)
  const [marineGrid, setMarineGrid] = useState<MarineGrid | null>(null)

  useEffect(() => {
    fetchWeatherGrid().then(setWeatherGrid).catch(() => {})
    fetchMarineGrid().then(setMarineGrid).catch(() => {})
  }, [])

  const days: DayForecast[] = useMemo(() => weatherGrid ? dailyForecast(weatherGrid) : [], [weatherGrid])
  const strongest = [...storms].sort((a, b) => b.wind_speed - a.wind_speed)[0]
  const activeLayer = layerId ? WEATHER_LAYER_BY_ID[layerId] : null

  async function toggleEnsemble() {
    if (spaghetti) { setSpaghetti(null); return }
    if (!strongest) return
    setEnsembleBusy(true)
    try {
      const history: TrackPoint[] = strongest.path?.length ? strongest.path.slice(-16) : [{ lat: strongest.lat, lon: strongest.lon }]
      const res = await fetchMultiModel(strongest.name, history)
      setSpaghetti({ storm: strongest.name, models: res.models })
    } catch { /* keep map as-is */ }
    finally { setEnsembleBusy(false) }
  }

  const hourLabel = hour === 0 ? 'Now' : `+${hour}h · ${Math.floor(hour / 24)}d ${hour % 24}h`

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Weather Map" subtitle="Layers · storms · 7-day" />

      {/* Layer chip bar — pinned height so it never steals the map's space */}
      <View style={styles.chipBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {WEATHER_LAYERS.map(l => {
            const on = layerId === l.id
            return (
              <Chip key={l.id} icon={l.icon} label={l.label} active={on}
                onPress={() => setLayerId(on ? null : l.id)} />
            )
          })}
          <View style={styles.divider} />
          <Chip icon="image" label="Satellite" active={basemap === 'satellite'}
            onPress={() => setBasemap(b => (b === 'satellite' ? 'dark' : 'satellite'))} />
          {strongest && (
            <Chip icon="git-network" label={spaghetti ? 'Ensemble ✓' : 'Ensemble'} active={!!spaghetti}
              busy={ensembleBusy} onPress={toggleEnsemble} />
          )}
        </ScrollView>
      </View>

      {/* Map — fills all remaining space */}
      <View style={styles.mapWrap}>
        <LeafletMap
          storms={storms} forecasts={forecasts} spaghetti={spaghetti}
          weatherGrid={weatherGrid} marineGrid={marineGrid}
          layer={activeLayer} forecastHour={hour} basemap={basemap}
        />
        {activeLayer && (
          <View style={styles.legend}>
            <Text style={styles.legendText}>{activeLayer.label} · {activeLayer.unit}</Text>
          </View>
        )}
      </View>

      {/* 7-day forecast + timeline scrubber */}
      <View style={styles.bottom}>
        {days.length > 0 && (
          <ForecastStrip days={days} activeDay={Math.min(Math.floor(hour / 24), 6)}
            onSelectDay={d => setHour(d * 24)} />
        )}
        <View style={styles.scrubRow}>
          <Text style={styles.scrubLabel}>{hourLabel}</Text>
          <Slider style={{ flex: 1, height: 36 }} minimumValue={0} maximumValue={168} step={1}
            value={hour} onValueChange={setHour}
            minimumTrackTintColor={colors.primary} maximumTrackTintColor={colors.border}
            thumbTintColor={colors.primary} />
          {hour !== 0 && (
            <Pressable onPress={() => setHour(0)} hitSlop={8}>
              <Ionicons name="refresh" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}

function Chip({ icon, label, active, busy, onPress }: {
  icon: string; label: string; active: boolean; busy?: boolean; onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} disabled={busy}
      style={[styles.chip, active && styles.chipActive]}>
      {busy
        ? <ActivityIndicator size="small" color={active ? '#0a1a3a' : colors.primary} />
        : <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={14} color={active ? '#0a1a3a' : colors.textSoft} />}
      <Text style={[styles.chipText, active && { color: '#0a1a3a' }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chipBar: {
    height: 54, flexGrow: 0, flexShrink: 0,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    justifyContent: 'center',
  },
  chips: { gap: space.sm, paddingHorizontal: space.lg, alignItems: 'center' },
  mapWrap: { flex: 1, overflow: 'hidden' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1,
    paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.pill,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSoft, fontSize: font.small, fontWeight: '700' },
  divider: { width: 1, height: 22, backgroundColor: colors.border, marginHorizontal: 4 },
  legend: {
    position: 'absolute', top: space.sm, right: space.sm,
    backgroundColor: 'rgba(10,16,28,0.8)', borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 4,
  },
  legendText: { color: colors.text, fontSize: font.tiny, fontWeight: '700' },
  bottom: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgElevated, paddingBottom: 2 },
  scrubRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  scrubLabel: { color: colors.text, fontSize: font.tiny, fontWeight: '800', width: 78, fontVariant: ['tabular-nums'] },
})
