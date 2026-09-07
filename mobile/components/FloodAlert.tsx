// ── Rising flood-risk alert (mobile) ────────────────────────────────
// Mirrors frontend/components/impact/FloodAlert.tsx. Fires when the 24 h peak
// level for the selected area climbs to Moderate or above, watching the same
// `peak` the timeline draws so banner and chart cannot disagree.
//
// Uses the app's local-notification wrapper (lib/notifications.ts). These are
// LOCAL notifications: they fire while the app is running. There is no push
// server, so a closed app is not woken.
import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { floodMeta, shouldAlert, type FloodHour, type FloodLevel } from '../lib/flood'
import { getNotificationPermission, requestNotificationPermission, scheduleLocalNotification } from '../lib/notifications'
import { colors, space, font, radius } from '../lib/theme'

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function FloodAlert({ peak, areaLabel, tidalInfluence }: {
  peak: FloodHour | null
  areaLabel: string
  tidalInfluence: number
}) {
  // Last level seen PER AREA — switching barangay must not read as a rise.
  const lastLevelRef = useRef<Map<string, FloodLevel>>(new Map())
  // Areas+levels already notified this session, so one rise notifies once.
  const notifiedRef = useRef<Set<string>>(new Set())

  const [alert, setAlert] = useState<
    { key: string; level: FloodLevel; ms: number; rainMm: number; tideM: number | null } | null
  >(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [canAsk, setCanAsk] = useState(false)
  const grantedRef = useRef(false)

  useEffect(() => {
    let alive = true
    getNotificationPermission().then(p => {
      if (!alive) return
      grantedRef.current = p.granted
      setCanAsk(!p.granted && p.canAskAgain)
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!peak) return
    const prev = lastLevelRef.current.get(areaLabel) ?? null
    lastLevelRef.current.set(areaLabel, peak.level)
    if (!shouldAlert(prev, peak.level)) return

    const key = `${areaLabel}:${peak.level}`
    setAlert({ key, level: peak.level, ms: peak.ms, rainMm: peak.rainMm, tideM: peak.tideM })
    setDismissed(d => { const n = new Set(d); n.delete(key); return n })

    if (notifiedRef.current.has(key)) return
    notifiedRef.current.add(key)
    if (grantedRef.current) {
      const meta = floodMeta(peak.level)
      scheduleLocalNotification(
        `Flood risk rising — ${areaLabel}`,
        `${meta.word} by ${hhmm(peak.ms)} · ${peak.rainMm} mm/24h. ${meta.advice}`,
      )
    }
  }, [peak, areaLabel])

  const hidden = alert ? dismissed.has(alert.key) : true
  if (hidden && !canAsk) return null

  const meta = alert ? floodMeta(alert.level) : null

  return (
    <View style={{ gap: space.sm }}>
      {alert && !hidden && meta && (
        <View style={[styles.banner, { backgroundColor: meta.color }]} accessibilityRole="alert">
          <Ionicons name="warning" size={20} color="#fff" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              Flood risk rising in {areaLabel} — {meta.word} by {hhmm(alert.ms)}
            </Text>
            <Text style={styles.body}>
              {alert.rainMm} mm/24h forecast
              {alert.tideM != null && tidalInfluence > 0.05 ? ` on a ${alert.tideM.toFixed(2)} m tide` : ''}
              . {meta.advice}
            </Text>
          </View>
          <Pressable onPress={() => setDismissed(d => new Set(d).add(alert.key))}
            accessibilityLabel="Dismiss flood alert" hitSlop={8} style={styles.close}>
            <Ionicons name="close" size={14} color="#fff" />
          </Pressable>
        </View>
      )}

      {canAsk && (
        <Pressable
          onPress={async () => {
            const p = await requestNotificationPermission()
            grantedRef.current = p.granted
            setCanAsk(!p.granted && p.canAskAgain)
          }}
          style={styles.optIn}>
          <Ionicons name="notifications" size={13} color={colors.primary} />
          <Text style={styles.optInText}>Enable flood alerts</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space.md,
    borderRadius: radius.lg, padding: space.md,
  },
  title: { color: '#fff', fontSize: font.small, fontWeight: '900', lineHeight: 18 },
  body: { color: 'rgba(255,255,255,0.93)', fontSize: font.tiny, marginTop: 2, lineHeight: 16 },
  close: {
    width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  optIn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft, borderColor: `${colors.primary}55`, borderWidth: 1,
    borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 7,
  },
  optInText: { color: colors.primary, fontSize: font.small, fontWeight: '800' },
})
