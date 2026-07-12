import { ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, space, font } from '../lib/theme'

/** Consistent branded header across every screen. */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + space.sm }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.md,
  },
  title: { color: colors.text, fontSize: font.h1, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: colors.textMuted, fontSize: font.tiny, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 2 },
})
