import { useState } from 'react'
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { NAGA_BARANGAYS, type HazardArea } from '../lib/hazard'
import { colors, space, font, radius } from '../lib/theme'

/** Susceptibility → short word + colour for the barangay list. */
export function suscWord(s: number): { word: string; color: string } {
  if (s >= 0.7) return { word: 'Very high', color: '#ff3b30' }
  if (s >= 0.5) return { word: 'High',      color: '#ff9500' }
  if (s >= 0.3) return { word: 'Moderate',  color: '#e1e100' }
  return { word: 'Low', color: '#39d98a' }
}

/** Bottom-sheet modal to pick a Naga barangay (sorted most flood-prone first). */
export function BarangayPicker({ visible, current, onSelect, onClose }: {
  visible: boolean; current: HazardArea | null; onSelect: (b: HazardArea) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const sorted = [...NAGA_BARANGAYS].sort((a, b) => b.floodSusceptibility - a.floodSusceptibility)
  const list = q.trim() ? sorted.filter(b => b.name.toLowerCase().includes(q.toLowerCase())) : sorted

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Your Naga barangay</Text>
        <Text style={styles.subtitle}>Sorted by flood susceptibility</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={15} color={colors.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search barangay"
            placeholderTextColor={colors.textMuted} style={styles.searchInput} autoCorrect={false} />
        </View>
        <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
          {list.map(b => {
            const active = current?.name === b.name
            const s = suscWord(b.floodSusceptibility)
            return (
              <Pressable key={b.name} onPress={() => { onSelect(b); onClose() }}
                style={[styles.row, active && { backgroundColor: colors.primarySoft }]}>
                <View style={[styles.dot, { backgroundColor: s.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{b.name}</Text>
                  {b.note ? <Text style={styles.note}>{b.note}</Text> : null}
                </View>
                <Text style={[styles.susc, { color: s.color }]}>{s.word}</Text>
                {active && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </Pressable>
            )
          })}
          {!list.length && <Text style={styles.empty}>No match.</Text>}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: space.lg, paddingBottom: space.xxl, borderTopWidth: 1, borderColor: colors.border,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: space.md },
  title: { color: colors.text, fontSize: font.h2, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: font.tiny, marginBottom: space.md },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.md, marginBottom: space.sm,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: font.body, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 11, paddingHorizontal: space.sm, borderRadius: radius.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  note: { color: colors.textMuted, fontSize: font.tiny },
  susc: { fontSize: font.small, fontWeight: '800' },
  empty: { color: colors.textMuted, textAlign: 'center', padding: space.lg },
})
