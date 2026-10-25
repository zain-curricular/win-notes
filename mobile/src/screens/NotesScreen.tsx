import { useMemo, useState } from 'react'
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TRASH_DAYS, useStore, viewTitle, visibleNotes, type Note } from '../lib/store'
import { groupLabel, rowDate } from '../lib/dates'
import { useTheme, type Theme } from '../theme'
import { BarButton, TopBar } from '../components/TopBar'
import { ActionSheet, type SheetItem } from '../components/ActionSheet'
import type { ScreenProps } from '../navigation'

function groupNotes(notes: Note[], pinFirst: boolean): { title: string; data: Note[] }[] {
  const groups: { title: string; data: Note[] }[] = []
  const pinned = pinFirst ? notes.filter((n) => n.pinned) : []
  if (pinned.length) groups.push({ title: 'Pinned', data: pinned })
  for (const n of notes) {
    if (pinFirst && n.pinned) continue
    const title = groupLabel(n.updated_at)
    const last = groups[groups.length - 1]
    if (last && last.title === title) last.data.push(n)
    else groups.push({ title, data: [n] })
  }
  return groups
}

/** Context menu items for a note; shared with the editor screen. */
export function noteMenu(note: Note, onMove: () => void, after?: () => void): SheetItem[] {
  const s = useStore.getState()
  if (note.deleted_at) {
    return [
      { label: 'Recover', icon: 'refresh-outline', onPress: () => s.recoverNote(note.id) },
      'separator',
      {
        label: 'Delete Permanently',
        icon: 'trash-outline',
        danger: true,
        onPress: () => {
          s.deleteNote(note.id)
          after?.()
        }
      }
    ]
  }
  return [
    { label: note.pinned ? 'Unpin Note' : 'Pin Note', icon: 'pin-outline', onPress: () => s.togglePin(note.id) },
    { label: 'Move To…', icon: 'folder-outline', onPress: onMove },
    { label: 'Duplicate Note', icon: 'copy-outline', onPress: () => s.duplicateNote(note.id) },
    'separator',
    {
      label: 'Delete',
      icon: 'trash-outline',
      danger: true,
      onPress: () => {
        s.deleteNote(note.id)
        after?.()
      }
    }
  ]
}

export function moveMenu(note: Note): SheetItem[] {
  const s = useStore.getState()
  const folders = Object.values(s.folders).sort((a, b) => a.position - b.position)
  const inDefault = !note.folder_id || !s.folders[note.folder_id]
  return [
    { label: 'Notes', icon: 'folder-outline', checked: inDefault, onPress: () => s.moveNote(note.id, null) },
    ...folders.map((f) => ({ label: f.name, icon: 'folder-outline' as const, checked: note.folder_id === f.id, onPress: () => s.moveNote(note.id, f.id) }))
  ]
}

function NoteRow({ note, showFolder, t, onPress, onLongPress }: { note: Note; showFolder: boolean; t: Theme; onPress: () => void; onLongPress: () => void }) {
  const folderName = useStore((s) => (note.folder_id ? s.folders[note.folder_id]?.name : undefined) ?? 'Notes')
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: t.ripple }}
      style={[styles.row, { borderBottomColor: t.sep }]}
      accessibilityRole="button"
      accessibilityLabel={`${note.title || 'New Note'}, ${rowDate(note.updated_at)}, ${note.snippet || 'No additional text'}${showFolder ? `, in ${folderName}` : ''}`}
      accessibilityHint="Touch and hold for more options"
    >
      <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
        {note.title || 'New Note'}
      </Text>
      <View style={styles.meta}>
        <Text style={[styles.date, { color: t.text2 }]}>{rowDate(note.updated_at)}</Text>
        <Text style={[styles.snippet, { color: t.text3 }]} numberOfLines={1}>
          {note.snippet || 'No additional text'}
        </Text>
      </View>
      {showFolder ? (
        <View style={styles.folder}>
          <Ionicons name="folder-outline" size={12} color={t.text3} />
          <Text style={{ color: t.text3, fontSize: 12 }}>{folderName}</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

export function NotesScreen({ navigation }: ScreenProps<'Notes'>) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const view = useStore((s) => s.view)
  const search = useStore((s) => s.search)
  const notes = useStore((s) => s.notes)
  const folders = useStore((s) => s.folders)
  const [menuNote, setMenuNote] = useState<Note | null>(null)
  const [moveNote, setMoveNote] = useState<Note | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  const list = useMemo(() => visibleNotes({ notes, view, folders, search }), [notes, view, folders, search])
  const sections = useMemo(() => groupNotes(list, view !== 'deleted'), [list, view])
  const title = search.trim() ? 'Search' : viewTitle(view, folders)
  const showFolder = view === 'all' || !!search.trim()
  const deleted = view === 'deleted'

  const openNote = (id: string): void => {
    useStore.getState().selectNote(id)
    navigation.navigate('Editor')
  }
  const compose = (): void => {
    useStore.getState().createNote()
    navigation.navigate('Editor')
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TopBar
        title={title}
        backLabel="Folders"
        onBack={() => navigation.goBack()}
        right={deleted ? <BarButton icon="ellipsis-horizontal-circle-outline" label="More" onPress={() => setMoreOpen(true)} disabled={!list.length} /> : null}
      />
      {!deleted ? (
        <View style={[styles.search, { backgroundColor: t.field }]}>
          <Ionicons name="search" size={16} color={t.text3} />
          <TextInput value={search} onChangeText={(q) => useStore.getState().setSearch(q)} placeholder="Search" accessibilityLabel="Search notes" placeholderTextColor={t.text3} style={[styles.searchInput, { color: t.text }]} autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing" />
          {search ? (
            <Pressable onPress={() => useStore.getState().setSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={t.text3} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        renderSectionHeader={({ section }) => (
          <View style={styles.groupHeader}>
            {section.title === 'Pinned' ? <Ionicons name="pin" size={12} color={t.accentText} /> : null}
            <Text style={[styles.groupLabel, { color: t.text3 }]} accessibilityRole="header">
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => <NoteRow note={item} showFolder={showFolder} t={t} onPress={() => openNote(item.id)} onLongPress={() => setMenuNote(item)} />}
        ListEmptyComponent={
          <View style={styles.empty} accessibilityRole="text">
            <Ionicons name={deleted ? 'trash-outline' : search ? 'search' : 'create-outline'} size={30} color={t.textFaint} />
            <Text style={[styles.emptyTitle, { color: t.text2 }]}>{deleted ? 'Nothing here' : search ? 'No results' : 'No notes yet'}</Text>
            <Text style={[styles.emptyText, { color: t.text3 }]}>
              {deleted ? `Deleted notes wait here for ${TRASH_DAYS} days.` : search ? `Nothing matches “${search.trim()}”.` : 'Tap the pencil to write one.'}
            </Text>
          </View>
        }
      />
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 8, borderTopColor: t.sep, backgroundColor: t.bg }]}>
        <View style={{ width: 42 }} />
        <Text style={{ color: t.text2, fontSize: 12 }}>
          {list.length} {list.length === 1 ? 'Note' : 'Notes'}
        </Text>
        {deleted ? (
          <View style={{ width: 42 }} />
        ) : (
          <Pressable onPress={compose} hitSlop={8} style={{ padding: 8 }} accessibilityRole="button" accessibilityLabel="New Note">
            <Ionicons name="create-outline" size={26} color={t.accentText} />
          </Pressable>
        )}
      </View>

      <ActionSheet visible={!!menuNote} title={menuNote?.title || 'New Note'} items={menuNote ? noteMenu(menuNote, () => setMoveNote(menuNote)) : []} onClose={() => setMenuNote(null)} />
      <ActionSheet visible={!!moveNote} title="Move To" items={moveNote ? moveMenu(moveNote) : []} onClose={() => setMoveNote(null)} />
      <ActionSheet visible={moreOpen} items={[{ label: 'Delete All', icon: 'trash-outline', danger: true, onPress: () => useStore.getState().emptyTrash() }]} onClose={() => setMoreOpen(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 6, borderRadius: 10, paddingHorizontal: 10, height: 36 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  groupLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { flexDirection: 'row', gap: 8, marginTop: 2 },
  date: { fontSize: 14 },
  snippet: { fontSize: 14, flex: 1 },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  empty: { alignItems: 'center', gap: 8, marginTop: 72, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth }
})
