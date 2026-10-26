import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { notesInView, useStore, type Folder, type SyncStatus } from '../lib/store'
import { checkForUpdates } from '../lib/updates'
import { useTheme, type Theme } from '../theme'
import { BarButton, TopBar } from '../components/TopBar'
import { ActionSheet, type SheetItem } from '../components/ActionSheet'
import { PromptModal } from '../components/PromptModal'
import type { ScreenProps } from '../navigation'

const STATUS_LABEL: Record<SyncStatus, string> = {
  local: 'Not syncing',
  connecting: 'Connecting…',
  syncing: 'Syncing…',
  synced: 'Up to date',
  offline: 'Offline'
}

function Row({ icon, label, count, onPress, onLongPress, t, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; count: number; onPress: () => void; onLongPress?: () => void; t: Theme; last?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: t.ripple }}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count} ${count === 1 ? 'note' : 'notes'}`}
      accessibilityHint={onLongPress ? 'Touch and hold to rename or delete' : undefined}
    >
      <Ionicons name={icon} size={22} color={t.accentText} style={{ width: 34 }} />
      <View style={[styles.rowBody, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.sep }]}>
        <Text style={[styles.rowLabel, { color: t.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.rowCount, { color: t.text3 }]}>{count}</Text>
        <Ionicons name="chevron-forward" size={18} color={t.text3} />
      </View>
    </Pressable>
  )
}

export function FoldersScreen({ navigation, email, onSignOut, onSignIn }: ScreenProps<'Folders'> & { email?: string; onSignOut: () => void; onSignIn: () => void }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const folders = useStore((s) => s.folders)
  const notes = useStore((s) => s.notes)
  const syncStatus = useStore((s) => s.syncStatus)
  const [newFolder, setNewFolder] = useState(false)
  const [renaming, setRenaming] = useState<Folder | null>(null)
  const [menuFolder, setMenuFolder] = useState<Folder | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)

  const sorted = useMemo(() => Object.values(folders).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [folders])
  const count = (view: string): number => notesInView({ notes, folders, view }, view).length

  const open = (view: string): void => {
    useStore.getState().setView(view)
    navigation.navigate('Notes')
  }
  const compose = (): void => {
    useStore.getState().setView('notes')
    useStore.getState().createNote(null)
    navigation.navigate('Notes')
    navigation.navigate('Editor')
  }

  const folderMenu: SheetItem[] = menuFolder
    ? [
        { label: 'Rename Folder', icon: 'pencil-outline', onPress: () => setRenaming(menuFolder) },
        { label: 'Delete Folder', icon: 'trash-outline', danger: true, onPress: () => useStore.getState().deleteFolder(menuFolder.id) }
      ]
    : []
  const checkUpdates: SheetItem = { label: 'Check for Updates', icon: 'refresh-outline', onPress: () => void checkForUpdates(true) }
  const accountMenu: SheetItem[] = email
    ? [checkUpdates, { label: 'Sign Out', icon: 'log-out-outline', danger: true, onPress: onSignOut }]
    : [checkUpdates, { label: 'Sign In to Sync', icon: 'cloud-outline', onPress: onSignIn }]

  useEffect(() => {
    void checkForUpdates(false)
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: t.grouped }}>
      <TopBar title="Folders" large right={<BarButton icon="person-circle-outline" label="Account" onPress={() => setAccountOpen(true)} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <Text style={[styles.section, { color: t.text3 }]} accessibilityRole="header">
          {email ?? 'On This Phone'}
        </Text>
        <View style={[styles.group, { backgroundColor: t.card }]}>
          <Row t={t} icon="albums-outline" label="All Notes" count={count('all')} onPress={() => open('all')} />
          <Row t={t} icon="folder-outline" label="Notes" count={count('notes')} onPress={() => open('notes')} last={sorted.length === 0} />
          {sorted.map((f, i) => (
            <Row key={f.id} t={t} icon="folder-outline" label={f.name} count={count(f.id)} onPress={() => open(f.id)} onLongPress={() => setMenuFolder(f)} last={i === sorted.length - 1} />
          ))}
        </View>
        <View style={[styles.group, { backgroundColor: t.card, marginTop: 18 }]}>
          <Row t={t} icon="trash-outline" label="Recently Deleted" count={count('deleted')} onPress={() => open('deleted')} last />
        </View>
        <Text style={[styles.hint, { color: t.text3 }]}>Touch and hold a folder to rename or delete it.</Text>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 8, borderTopColor: t.sep, backgroundColor: t.grouped }]}>
        <Pressable onPress={() => setNewFolder(true)} hitSlop={8} style={styles.bottomBtn} accessibilityRole="button" accessibilityLabel="New Folder">
          <Ionicons name="folder-open-outline" size={24} color={t.accentText} />
        </Pressable>
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: syncStatus === 'synced' ? t.success : syncStatus === 'offline' ? t.danger : syncStatus === 'local' ? t.text3 : t.accent }]} />
          <Text style={{ color: t.text2, fontSize: 12 }}>{STATUS_LABEL[syncStatus]}</Text>
        </View>
        <Pressable onPress={compose} hitSlop={8} style={styles.bottomBtn} accessibilityRole="button" accessibilityLabel="New Note">
          <Ionicons name="create-outline" size={26} color={t.accentText} />
        </Pressable>
      </View>

      <PromptModal visible={newFolder} title="New Folder" placeholder="Name" initialValue="New Folder" submitLabel="Create" onClose={() => setNewFolder(false)} onSubmit={(name) => open(useStore.getState().createFolder(name))} />
      <PromptModal visible={!!renaming} title="Rename Folder" initialValue={renaming?.name} onClose={() => setRenaming(null)} onSubmit={(name) => renaming && useStore.getState().renameFolder(renaming.id, name)} />
      <ActionSheet visible={!!menuFolder} title={menuFolder?.name} items={folderMenu} onClose={() => setMenuFolder(null)} />
      <ActionSheet visible={accountOpen} title={email ?? 'Notes are stored only on this phone'} items={accountMenu} onClose={() => setAccountOpen(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  section: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 32, marginTop: 12, marginBottom: 8 },
  group: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingRight: 12 },
  rowLabel: { flex: 1, fontSize: 17 },
  rowCount: { fontSize: 16, marginRight: 6 },
  hint: { fontSize: 12, textAlign: 'center', marginTop: 20 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  bottomBtn: { padding: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 }
})
