// ── Shared UI primitives ────────────────────────────────────────────
import { ReactNode } from 'react'
import { View, Text, StyleSheet, ViewStyle, TextStyle, ActivityIndicator } from 'react-native'
import { colors, radius, space, font, shadow, CAT_COLOR, CAT_LABEL } from '../lib/theme'

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  )
}

/** Colored pill, e.g. a storm-category or status tag. */
export function Badge({ label, color, filled = false }: { label: string; color: string; filled?: boolean }) {
  return (
    <View style={[
      styles.badge,
      filled
        ? { backgroundColor: color }
        : { backgroundColor: `${color}22`, borderColor: `${color}66`, borderWidth: 1 },
    ]}>
      <Text style={[styles.badgeText, { color: filled ? '#0a1a3a' : color }]}>{label}</Text>
    </View>
  )
}

export function CategoryBadge({ category, filled }: { category: number; filled?: boolean }) {
  return <Badge label={CAT_LABEL[category] ?? '—'} color={CAT_COLOR[category] ?? colors.textMuted} filled={filled} />
}

export function StatusDot({ color, size = 10 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.centerFill}>
      <ActivityIndicator color={colors.primary} />
      {label && <Text style={styles.mutedNote}>{label}</Text>}
    </View>
  )
}

export function EmptyState({ icon, title, note }: { icon?: string; title: string; note?: string }) {
  return (
    <View style={styles.empty}>
      {icon && <Text style={{ fontSize: 34, marginBottom: space.sm }}>{icon}</Text>}
      <Text style={styles.emptyTitle}>{title}</Text>
      {note && <Text style={styles.mutedNote}>{note}</Text>}
    </View>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>⚠  {message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    ...shadow.card,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sectionTitle: { color: colors.text, fontSize: font.h2, fontWeight: '800', letterSpacing: -0.2 },
  sectionSubtitle: { color: colors.textSoft, fontSize: font.small, marginTop: 3, lineHeight: 18 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: font.tiny, fontWeight: '800', letterSpacing: 0.4 },
  centerFill: { paddingVertical: space.xxl, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  mutedNote: { color: colors.textMuted, fontSize: font.small, textAlign: 'center', lineHeight: 18 },
  empty: { paddingVertical: space.xxl, alignItems: 'center', gap: 4 },
  emptyTitle: { color: colors.textSoft, fontSize: font.body, fontWeight: '700' },
  errorBox: {
    backgroundColor: 'rgba(255,90,90,0.12)',
    borderColor: 'rgba(255,90,90,0.4)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  errorText: { color: '#ffb4b4', fontSize: font.small, lineHeight: 18 },
})
