import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTheme } from '../theme'

export function PromptModal({
  visible,
  title,
  placeholder,
  initialValue = '',
  submitLabel = 'Save',
  onSubmit,
  onClose
}: {
  visible: boolean
  title: string
  placeholder?: string
  initialValue?: string
  submitLabel?: string
  onSubmit: (value: string) => void
  onClose: () => void
}) {
  const t = useTheme()
  const [value, setValue] = useState(initialValue)
  useEffect(() => {
    if (visible) setValue(initialValue)
  }, [visible, initialValue])
  const submit = (): void => {
    const v = value.trim()
    if (!v) return
    onClose()
    onSubmit(v)
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} importantForAccessibility="no" />
        <View style={[styles.card, { backgroundColor: t.sheet }]}>
          <Text style={[styles.title, { color: t.text }]} accessibilityRole="header">
            {title}
          </Text>
          <TextInput
            autoFocus
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={t.text3}
            selectTextOnFocus
            accessibilityLabel={title}
            maxLength={200}
            returnKeyType="done"
            onSubmitEditing={submit}
            style={[styles.input, { backgroundColor: t.field, color: t.text }]}
          />
          <View style={styles.buttons}>
            <Pressable onPress={onClose} style={styles.btn} accessibilityRole="button">
              <Text style={[styles.btnText, { color: t.accentText }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} style={styles.btn} disabled={!value.trim()} accessibilityRole="button" accessibilityState={{ disabled: !value.trim() }}>
              <Text style={[styles.btnText, { color: t.accentText, fontWeight: '600', opacity: value.trim() ? 1 : 0.4 }]}>{submitLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 28 },
  card: { borderRadius: 16, padding: 18 },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  btn: { paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { fontSize: 16 }
})
