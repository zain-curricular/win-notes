import { useCallback, useEffect, useRef, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isEmptyNote, onRemoteNote, useStore, viewTitle, type Note } from '../lib/store'
import { fullDate } from '../lib/dates'
import { isOpenableLink } from '../lib/links'
import { useTheme, type Theme } from '../theme'
import { BarButton, TopBar } from '../components/TopBar'
import { ActionSheet, type SheetItem } from '../components/ActionSheet'
import { EDITOR_HTML } from '../editor/editorHtml'
import { bridgeScript, HIGHLIGHT_COLORS, INITIAL_STATE, type BlockStyle, type EditorState, type FromEditor, type HighlightColor, type ListKind, type ToEditor } from '../editor/bridge'
import { moveMenu, noteMenu } from './NotesScreen'
import type { ScreenProps } from '../navigation'

const STYLES: { style: BlockStyle; label: string }[] = [
  { style: 'title', label: 'Title' },
  { style: 'heading', label: 'Heading' },
  { style: 'subheading', label: 'Subheading' },
  { style: 'body', label: 'Body' },
  { style: 'mono', label: 'Monostyled' }
]
const LISTS: { kind: ListKind; label: string; marker: string }[] = [
  { kind: 'bullet', label: 'Bulleted List', marker: '•' },
  { kind: 'dashed', label: 'Dashed List', marker: '–' },
  { kind: 'ordered', label: 'Numbered List', marker: '1.' }
]
const TABLE_OPS: { op: string; label: string; danger?: boolean }[] = [
  { op: 'addRowBefore', label: 'Add Row Above' },
  { op: 'addRowAfter', label: 'Add Row Below' },
  { op: 'addColumnBefore', label: 'Add Column Before' },
  { op: 'addColumnAfter', label: 'Add Column After' },
  { op: 'deleteRow', label: 'Delete Row' },
  { op: 'deleteColumn', label: 'Delete Column' },
  { op: 'deleteTable', label: 'Delete Table', danger: true }
]

function hlColor(t: Theme, c: HighlightColor): string {
  return { purple: t.hlPurple, pink: t.hlPink, orange: t.hlOrange, mint: t.hlMint, blue: t.hlBlue }[c]
}

function ToolButton({ t, active, disabled, onPress, children, label }: { t: Theme; active?: boolean; disabled?: boolean; onPress: () => void; children: React.ReactNode; label: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} style={[styles.tool, active && { backgroundColor: t.accentSoft }, disabled && { opacity: 0.35 }]}>
      {children}
    </Pressable>
  )
}

/** Bottom sheet with the "Aa" format options, mirroring the desktop Format menu. */
function FormatSheet({ visible, st, t, onClose, cmd }: { visible: boolean; st: EditorState; t: Theme; onClose: () => void; cmd: (name: string, arg?: unknown) => void }) {
  const insets = useSafeAreaInsets()
  const mark = (name: 'bold' | 'italic' | 'underline' | 'strike', glyph: string, style: object): React.ReactNode => (
    <Pressable key={name} onPress={() => cmd(name)} style={[styles.markBtn, { backgroundColor: st[name] ? t.accentSoft : t.field }]}>
      <Text style={[{ fontSize: 18, color: t.text }, style]}>{glyph}</Text>
    </Pressable>
  )
  const row = (label: string, on: boolean, onPress: () => void, marker?: string): React.ReactNode => (
    <Pressable key={label} onPress={onPress} android_ripple={{ color: t.ripple }} style={styles.formatRow}>
      <View style={{ width: 26 }}>{on ? <Ionicons name="checkmark" size={18} color={t.accentText} /> : null}</View>
      {marker ? <Text style={{ width: 22, color: t.text2, fontSize: 16 }}>{marker}</Text> : null}
      <Text style={{ fontSize: 17, color: t.text }}>{label}</Text>
    </Pressable>
  )
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: t.sheet, paddingBottom: insets.bottom + 8 }]} onPress={() => {}}>
          <View style={styles.marks}>
            {mark('bold', 'B', { fontWeight: '700' })}
            {mark('italic', 'I', { fontStyle: 'italic' })}
            {mark('underline', 'U', { textDecorationLine: 'underline' })}
            {mark('strike', 'S', { textDecorationLine: 'line-through' })}
          </View>
          <View style={styles.swatches}>
            {HIGHLIGHT_COLORS.map((c) => (
              <Pressable key={c} onPress={() => cmd('highlight', st.highlight === c ? null : c)} style={[styles.swatch, { backgroundColor: hlColor(t, c) }, st.highlight === c && { borderColor: t.text, borderWidth: 2 }]} />
            ))}
            <Pressable onPress={() => cmd('highlight', null)} style={[styles.swatch, { backgroundColor: t.field }]}>
              <Ionicons name="close" size={14} color={t.text2} />
            </Pressable>
          </View>
          <View style={[styles.sep, { backgroundColor: t.sep }]} />
          {STYLES.map((s) =>
            row(s.label, st.style === s.style && !st.list, () => {
              cmd('style', s.style)
              onClose()
            })
          )}
          <View style={[styles.sep, { backgroundColor: t.sep }]} />
          {LISTS.map((l) =>
            row(
              l.label,
              st.list === l.kind,
              () => {
                cmd('list', l.kind)
                onClose()
              },
              l.marker
            )
          )}
          {row(
            'Block Quote',
            st.quote,
            () => {
              cmd('quote')
              onClose()
            },
            '|'
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export function EditorScreen({ navigation }: ScreenProps<'Editor'>) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const note = useStore((s) => (s.selectedNoteId ? s.notes[s.selectedNoteId] ?? null : null))
  const view = useStore((s) => s.view)
  const folders = useStore((s) => s.folders)
  const noteId = note?.id ?? null
  const deleted = !!note?.deleted_at
  const updatedAt = note?.updated_at

  const web = useRef<WebView>(null)
  const ready = useRef(false)
  const leaving = useRef(false)
  const markdownReq = useRef<{ id: number; resolve: (r: { text: string; html: string }) => void } | null>(null)
  const [st, setSt] = useState<EditorState>(INITIAL_STATE)
  const [focused, setFocused] = useState(false)
  const [formatOpen, setFormatOpen] = useState(false)
  const [tableOpen, setTableOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)

  const send = useCallback((msg: ToEditor): void => {
    web.current?.injectJavaScript(bridgeScript(msg))
  }, [])
  const cmd = useCallback((name: string, arg?: unknown): void => send({ type: 'cmd', name, arg }), [send])

  const loadNote = useCallback((): void => {
    const n = noteId ? useStore.getState().notes[noteId] : null
    if (!n || !ready.current) return
    // A blank note opens ready to type; Android only shows the keyboard when the WebView itself has focus.
    if (isEmptyNote(n) && !n.deleted_at) web.current?.requestFocus()
    send({ type: 'load', content: n.content, editable: !n.deleted_at, theme: t.dark ? 'dark' : 'light', date: fullDate(n.updated_at), focus: isEmptyNote(n) })
  }, [noteId, send, t.dark])

  // Reload when a different note (or its deleted state) is shown; edits to the same note come back from the editor itself.
  useEffect(() => {
    setSt(INITIAL_STATE)
    loadNote()
  }, [noteId, deleted, loadNote])
  useEffect(() => send({ type: 'theme', theme: t.dark ? 'dark' : 'light' }), [t.dark, send])
  useEffect(() => {
    if (updatedAt) send({ type: 'date', date: fullDate(updatedAt) })
  }, [updatedAt, send])

  // Edits made on another device show up in the open note.
  useEffect(
    () =>
      onRemoteNote((id) => {
        if (id !== noteId) return
        const n = useStore.getState().notes[id]
        if (n) send({ type: 'remote', content: n.content })
      }),
    [noteId, send]
  )

  // The note was deleted elsewhere (or permanently here): nothing left to show.
  useEffect(() => {
    if (!note && !leaving.current) navigation.goBack()
  }, [note, navigation])

  // Flush the last keystrokes before the screen goes away (back button, gesture or our own navigation).
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (leaving.current) return
        e.preventDefault()
        leaving.current = true
        send({ type: 'blur' })
        setTimeout(() => navigation.dispatch(e.data.action), 150)
      }),
    [navigation, send]
  )
  useEffect(() => () => useStore.getState().selectNote(null), [])

  const onMessage = (e: WebViewMessageEvent): void => {
    let msg: FromEditor
    try {
      msg = JSON.parse(e.nativeEvent.data) as FromEditor
    } catch {
      return
    }
    switch (msg.type) {
      case 'ready':
        ready.current = true
        loadNote()
        break
      case 'update':
        if (noteId) useStore.getState().updateNote(noteId, { content: msg.content, title: msg.title, snippet: msg.snippet, body: msg.body })
        break
      case 'state': {
        const { type: _t, ...rest } = msg
        setSt(rest)
        break
      }
      case 'focus':
        setFocused(msg.focused)
        break
      case 'link':
        if (isOpenableLink(msg.href)) Linking.openURL(msg.href).catch(() => {})
        break
      case 'markdown':
        if (markdownReq.current?.id === msg.reqId) markdownReq.current.resolve({ text: msg.text, html: msg.html })
        markdownReq.current = null
        break
    }
  }

  const getMarkdown = (): Promise<{ text: string; html: string }> =>
    new Promise((resolve) => {
      const id = Date.now()
      markdownReq.current = { id, resolve }
      send({ type: 'getMarkdown', reqId: id })
    })

  const done = (): void => {
    send({ type: 'blur' })
    Keyboard.dismiss()
  }

  const moreItems: SheetItem[] = note
    ? [
        {
          label: 'Copy as Markdown',
          icon: 'copy-outline',
          onPress: async () => {
            const { text } = await getMarkdown()
            await Clipboard.setStringAsync(text)
          }
        },
        {
          label: 'Copy as Plain Text',
          icon: 'document-text-outline',
          onPress: () => Clipboard.setStringAsync(note.body)
        },
        'separator',
        // Deleting clears the selection, and the effect above then leaves the screen.
        ...noteMenu(note, () => setMoveOpen(true))
      ]
    : []

  const tableItems: SheetItem[] = TABLE_OPS.map((o) => ({ label: o.label, danger: o.danger, onPress: () => cmd('tableOp', o.op) }))

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TopBar
        title=""
        backLabel={viewTitle(view, folders)}
        onBack={() => navigation.goBack()}
        right={
          <>
            {note && !deleted ? <BarButton icon={note.pinned ? 'pin' : 'pin-outline'} active={note.pinned} label={note.pinned ? 'Unpin' : 'Pin'} onPress={() => useStore.getState().togglePin(note.id)} /> : null}
            {note && deleted ? (
              <Pressable onPress={() => useStore.getState().recoverNote(note.id)} style={{ paddingHorizontal: 10 }}>
                <Text style={{ color: t.accentText, fontSize: 17 }}>Recover</Text>
              </Pressable>
            ) : null}
            <BarButton icon="ellipsis-horizontal-circle-outline" label="More" onPress={() => setMoreOpen(true)} disabled={!note} />
          </>
        }
      />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <WebView
        ref={web}
        originWhitelist={['*']}
        source={{ html: EDITOR_HTML }}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(req) => {
          if (req.url.startsWith('about:') || req.url.startsWith('data:')) return true
          if (isOpenableLink(req.url)) Linking.openURL(req.url).catch(() => {})
          return false
        }}
        style={{ flex: 1, backgroundColor: t.bg }}
        containerStyle={{ backgroundColor: t.bg }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        overScrollMode="never"
        textZoom={100}
        webviewDebuggingEnabled={__DEV__}
      />

      {focused && !deleted ? (
        <View style={[styles.toolbar, { borderTopColor: t.sep, backgroundColor: t.sheet }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.toolbarInner}>
            <ToolButton t={t} label="Format" onPress={() => setFormatOpen(true)}>
              <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>Aa</Text>
            </ToolButton>
            <ToolButton t={t} label="Checklist" active={st.task} onPress={() => cmd('list', 'task')}>
              <Ionicons name="checkbox-outline" size={22} color={t.text} />
            </ToolButton>
            <ToolButton t={t} label={st.table ? 'Table options' : 'Table'} active={st.table} onPress={() => (st.table ? setTableOpen(true) : cmd('table'))}>
              <Ionicons name="grid-outline" size={21} color={t.text} />
            </ToolButton>
            <View style={[styles.toolSep, { backgroundColor: t.sep }]} />
            <ToolButton t={t} label="Bold" active={st.bold} onPress={() => cmd('bold')}>
              <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>B</Text>
            </ToolButton>
            <ToolButton t={t} label="Italic" active={st.italic} onPress={() => cmd('italic')}>
              <Text style={{ color: t.text, fontSize: 18, fontStyle: 'italic' }}>I</Text>
            </ToolButton>
            <ToolButton t={t} label="Underline" active={st.underline} onPress={() => cmd('underline')}>
              <Text style={{ color: t.text, fontSize: 18, textDecorationLine: 'underline' }}>U</Text>
            </ToolButton>
            <ToolButton t={t} label="Strikethrough" active={st.strike} onPress={() => cmd('strike')}>
              <Text style={{ color: t.text, fontSize: 18, textDecorationLine: 'line-through' }}>S</Text>
            </ToolButton>
            <View style={[styles.toolSep, { backgroundColor: t.sep }]} />
            <ToolButton t={t} label="Outdent" disabled={!st.list} onPress={() => cmd('outdent')}>
              <Ionicons name="chevron-back-outline" size={22} color={t.text} />
            </ToolButton>
            <ToolButton t={t} label="Indent" disabled={!st.list} onPress={() => cmd('indent')}>
              <Ionicons name="chevron-forward-outline" size={22} color={t.text} />
            </ToolButton>
            <View style={[styles.toolSep, { backgroundColor: t.sep }]} />
            <ToolButton t={t} label="Undo" disabled={!st.canUndo} onPress={() => cmd('undo')}>
              <Ionicons name="arrow-undo-outline" size={21} color={t.text} />
            </ToolButton>
            <ToolButton t={t} label="Redo" disabled={!st.canRedo} onPress={() => cmd('redo')}>
              <Ionicons name="arrow-redo-outline" size={21} color={t.text} />
            </ToolButton>
          </ScrollView>
          <Pressable onPress={done} style={styles.done}>
            <Text style={{ color: t.accentText, fontSize: 16, fontWeight: '600' }}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ height: insets.bottom, backgroundColor: t.bg }} />
      )}
      </KeyboardAvoidingView>

      <FormatSheet visible={formatOpen} st={st} t={t} cmd={cmd} onClose={() => setFormatOpen(false)} />
      <ActionSheet visible={tableOpen} title="Table" items={tableItems} onClose={() => setTableOpen(false)} />
      <ActionSheet visible={moreOpen} title={note?.title || 'New Note'} items={moreItems} onClose={() => setMoreOpen(false)} />
      <ActionSheet visible={moveOpen} title="Move To" items={note ? moveMenu(note) : []} onClose={() => setMoveOpen(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, height: 48 },
  toolbarInner: { alignItems: 'center', paddingHorizontal: 6, gap: 2 },
  tool: { minWidth: 40, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  toolSep: { width: StyleSheet.hairlineWidth, height: 22, marginHorizontal: 4 },
  done: { paddingHorizontal: 14, height: 48, justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 14 },
  marks: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  markBtn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  swatches: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  swatch: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  formatRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 }
})
