import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme'

export type SheetItem =
  | { label: string; icon?: keyof typeof Ionicons.glyphMap; danger?: boolean; checked?: boolean; disabled?: boolean; onPress: () => void }
  | 'separator'

export function ActionSheet({ visible, title, items, onClose }: { visible: boolean; title?: string; items: SheetItem[]; onClose: () => void }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu">
        <Pressable style={[styles.sheet, { backgroundColor: t.sheet, marginBottom: insets.bottom + 10 }]} onPress={() => {}} accessible={false}>
          {title ? (
            <Text style={[styles.title, { color: t.text2 }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          <ScrollView bounces={false} style={{ maxHeight: 420 }}>
            {items.map((item, i) =>
              item === 'separator' ? (
                <View key={i} style={[styles.sep, { backgroundColor: t.sep }]} />
              ) : (
                <Pressable
                  key={i}
                  disabled={item.disabled}
                  accessibilityRole="menuitem"
                  accessibilityLabel={item.label}
                  accessibilityState={{ disabled: !!item.disabled, checked: item.checked }}
                  android_ripple={{ color: t.ripple }}
                  style={[styles.row, item.disabled && { opacity: 0.4 }]}
                  onPress={() => {
                    onClose()
                    setTimeout(item.onPress, 0)
                  }}
                >
                  <View style={styles.check}>{item.checked ? <Ionicons name="checkmark" size={18} color={t.accentText} /> : null}</View>
                  {item.icon ? <Ionicons name={item.icon} size={20} color={item.danger ? t.danger : t.text} style={styles.icon} /> : null}
                  <Text style={[styles.label, { color: item.danger ? t.danger : t.text }]}>{item.label}</Text>
                </Pressable>
              )
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', paddingHorizontal: 10 },
  sheet: { borderRadius: 16, paddingVertical: 6, overflow: 'hidden' },
  title: { fontSize: 13, textAlign: 'center', paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12 },
  check: { width: 24, alignItems: 'center' },
  icon: { marginRight: 12 },
  label: { fontSize: 17, flex: 1 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 4 }
})
