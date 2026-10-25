import { describe, expect, it } from 'vitest'
import plugin from './releaseSigning'

const { signRelease } = plugin as unknown as { signRelease: (gradle: string) => string }

// android/app/build.gradle from expo-template-bare-minimum 57.0.33.
const TEMPLATE = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
        }
    }`

describe('release signing', () => {
  it('signs release builds with the Notes key and leaves debug builds on the debug key', () => {
    const gradle = signRelease(TEMPLATE)
    const release = gradle.slice(gradle.indexOf('buildTypes'))
    expect(release.match(/signingConfig signingConfigs\.\w+/g)).toEqual(['signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release'])
    expect(gradle).toContain("storeFile file(keystore)")
    expect(gradle).toContain("throw new GradleException('Release builds need NOTES_KEYSTORE")
  })

  it('refuses a template it does not recognise rather than leave the debug key on release', () => {
    expect(() => signRelease(TEMPLATE.replace('signingConfigs {', 'signingConfigs {\n        other {}'))).toThrow(/releaseSigning/)
    expect(() => signRelease(TEMPLATE.replace(/(release \{[^}]*?)signingConfig signingConfigs\.debug/, '$1'))).toThrow(/releaseSigning/)
  })

  it('leaves a file it already signed unchanged', () => {
    expect(signRelease(signRelease(TEMPLATE))).toBe(signRelease(TEMPLATE))
  })
})
