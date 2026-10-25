// Signs release builds with the Notes key instead of the template's debug.keystore, which is public in npm: an APK
// signed with it could be installed as an update to Notes by anyone. Without the key a release build fails.
const { withAppBuildGradle } = require('expo/config-plugins')

const RELEASE_CONFIG = `
        release {
            def keystore = System.getenv('NOTES_KEYSTORE')
            if (keystore) {
                storeFile file(keystore)
                storePassword System.getenv('NOTES_KEYSTORE_PASSWORD')
                keyAlias System.getenv('NOTES_KEY_ALIAS')
                keyPassword System.getenv('NOTES_KEY_PASSWORD')
            } else if (gradle.startParameter.taskNames.any { it.toLowerCase().contains('release') }) {
                throw new GradleException('Release builds need NOTES_KEYSTORE, NOTES_KEYSTORE_PASSWORD, NOTES_KEY_ALIAS and NOTES_KEY_PASSWORD.')
            }
        }`

function replaceOnce(text, pattern, replacement) {
  const matches = text.match(new RegExp(pattern.source, 'g'))
  if (matches?.length !== 1) throw new Error(`releaseSigning: expected one match for ${pattern}, found ${matches?.length ?? 0}`)
  return text.replace(pattern, replacement)
}

function signRelease(gradle) {
  // expo prebuild without --clean runs plugins again over the file they already changed.
  if (gradle.includes(RELEASE_CONFIG)) return gradle
  const withConfig = replaceOnce(gradle, /(signingConfigs \{\n\s*debug \{[^}]*\})/, `$1${RELEASE_CONFIG}`)
  return replaceOnce(withConfig, /(\n\s*release \{[^}]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.release')
}

module.exports = (config) =>
  withAppBuildGradle(config, (c) => {
    if (c.modResults.language !== 'groovy') throw new Error('releaseSigning: app/build.gradle is not Groovy')
    c.modResults.contents = signRelease(c.modResults.contents)
    return c
  })
module.exports.signRelease = signRelease
