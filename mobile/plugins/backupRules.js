// Android backups keep the notes but never the session. expo-secure-store's own rules include only shared
// preferences, which also drops the AsyncStorage database that holds notes written in local-only mode.
const fs = require('fs')
const path = require('path')
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins')

const EXCLUDE_SESSION = '<exclude domain="sharedpref" path="SecureStore" />'

const BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
    ${EXCLUDE_SESSION}
</full-backup-content>
`

const EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        ${EXCLUDE_SESSION}
    </cloud-backup>
    <device-transfer>
        ${EXCLUDE_SESSION}
    </device-transfer>
</data-extraction-rules>
`

function applyBackupRules(manifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)
  app.$['android:allowBackup'] = 'true'
  app.$['android:fullBackupContent'] = '@xml/notes_backup_rules'
  app.$['android:dataExtractionRules'] = '@xml/notes_data_extraction_rules'
  return manifest
}

module.exports = (config) => {
  config = withAndroidManifest(config, (c) => {
    c.modResults = applyBackupRules(c.modResults)
    return c
  })
  return withDangerousMod(config, [
    'android',
    (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'notes_backup_rules.xml'), BACKUP_RULES)
      fs.writeFileSync(path.join(dir, 'notes_data_extraction_rules.xml'), EXTRACTION_RULES)
      return c
    }
  ])
}
module.exports.applyBackupRules = applyBackupRules
module.exports.BACKUP_RULES = BACKUP_RULES
module.exports.EXTRACTION_RULES = EXTRACTION_RULES
