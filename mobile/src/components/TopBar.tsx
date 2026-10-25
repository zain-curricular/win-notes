import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme'

export function TopBar({
  title,
  backLabel,
  onBack,
  right,
  large
}: {
  title: string
  backLabel?: string
  onBack?: () => void
  right?: ReactNode
  large?: boolean
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: 'transparent' }}>
      <View style={styles.bar}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel={`Back to ${backLabel ?? 'the previous screen'}`}>
            <Ionicons name="chevron-back" size={26} color={t.accentText} />
            <Text style={[styles.backText, { color: t.accentText }]} numberOfLines={1}>
              {backLabel ?? 'Back'}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        {!large ? (
          <Text style={[styles.title, { color: t.text }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={styles.right}>{right}</View>
      </View>
      {large ? (
        <Text style={[styles.large, { color: t.text }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
    </View>
  )
}

export function BarButton({ icon, onPress, active, disabled, label }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; active?: boolean; disabled?: boolean; label?: string }) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      style={[styles.btn, disabled && { opacity: 0.35 }]}
    >
      <Ionicons name={icon} size={23} color={active ? t.accent : t.accentText} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  back: { flexDirection: 'row', alignItems: 'center', minWidth: 70, maxWidth: 140 },
  backText: { fontSize: 17, marginLeft: -2, flexShrink: 1 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  right: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minWidth: 70 },
  btn: { paddingHorizontal: 8, paddingVertical: 6 },
  large: { fontSize: 32, fontWeight: '700', paddingHorizontal: 20, paddingTop: 2, paddingBottom: 8, letterSpacing: -0.3 }
})
