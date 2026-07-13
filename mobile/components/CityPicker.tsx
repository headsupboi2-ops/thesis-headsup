import { useState } from 'react'
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { PH_CITIES, type City } from '../lib/cities'
import { colors, space, font, radius } from '../lib/theme'

/** Bottom-sheet-style modal to pick a PH city. */
export function CityPicker({ visible, current, onSelect, onClose }: {
  visible: boolean; current: City; onSelect: (c: City) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const list = q.trim()
    ? PH_CITIES.filter(c => `${c.name} ${c.province}`.toLowerCase().includes(q.toLowerCase()))
    : PH_CITIES

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Choose your area</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={15} color={colors.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search city or province"
            placeholderTextColor={colors.textMuted} style={styles.searchInput} autoCorrect={false} />
        </View>
        <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
          {list.map(c => {
            const active = c.name === current.name && c.province === current.province
            return (
              <Pressable key={`${c.name}-${c.province}`} onPress={() => { onSelect(c); onClose() }}
                style={[styles.row, active && { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="location" size={16} color={active ? colors.primary : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cityName}>{c.name}</Text>
                  <Text style={styles.cityProv}>{c.province}</Text>
                </View>
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
  title: { color: colors.text, fontSize: font.h2, fontWeight: '800', marginBottom: space.md },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.md, marginBottom: space.sm,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: font.body, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 11, paddingHorizontal: space.sm, borderRadius: radius.md },
  cityName: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  cityProv: { color: colors.textMuted, fontSize: font.tiny },
  empty: { color: colors.textMuted, textAlign: 'center', padding: space.lg },
})
