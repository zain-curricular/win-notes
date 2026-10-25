import { describe, expect, it } from 'vitest'
import plugin from './backupRules'

const { applyBackupRules, BACKUP_RULES, EXTRACTION_RULES } = plugin as unknown as {
  applyBackupRules: (manifest: object) => { manifest: { application: { $: Record<string, string> }[] } }
  BACKUP_RULES: string
  EXTRACTION_RULES: string
}

describe('Android backup rules', () => {
  it('point the manifest at the Notes rules', () => {
    const manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication', 'android:allowBackup': 'false' } }] } }
    expect(applyBackupRules(manifest).manifest.application[0].$).toEqual({
      'android:name': '.MainApplication',
      'android:allowBackup': 'true',
      'android:fullBackupContent': '@xml/notes_backup_rules',
      'android:dataExtractionRules': '@xml/notes_data_extraction_rules'
    })
  })

  // An <include> limits a backup to what it names, which is how the notes database was dropped.
  it.each([
    ['full backup', BACKUP_RULES, 1],
    ['data extraction', EXTRACTION_RULES, 2]
  ])('%s rules only exclude the session', (_name, xml, excludes) => {
    expect(xml).not.toContain('<include')
    expect(xml.match(/<exclude domain="sharedpref" path="SecureStore" \/>/g)).toHaveLength(excludes)
    expect(xml.match(/<exclude /g)).toHaveLength(excludes)
  })
})
