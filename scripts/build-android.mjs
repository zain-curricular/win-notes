// Builds the Android APK: bundles the editor page, generates the native project with Expo, runs Gradle,
// and copies the result to release/Notes-<version>.apk next to the desktop installers.
// Release signing needs NOTES_KEYSTORE, NOTES_KEYSTORE_PASSWORD, NOTES_KEY_ALIAS and NOTES_KEY_PASSWORD
// (mobile/plugins/releaseSigning.js), and ANDROID_HOME for the certificate check at the end.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const mobile = join(root, 'mobile')
const win = process.platform === 'win32'
// SHA-256 of the certificate in Expo's template debug.keystore, which anyone can download from npm.
const PUBLIC_DEBUG_CERT = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'

function run(cmd, args, cwd) {
  console.log(`\n> ${cmd} ${args.join(' ')}  (${cwd})`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: win })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function fail(message) {
  console.error(`\n${message}`)
  process.exit(1)
}

/** The SHA-256 of the certificate the APK is signed with, read by apksigner from the SDK's newest build tools. */
function signingCertificate(apk) {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
  if (!sdk) fail('Set ANDROID_HOME so the APK signature can be checked.')
  const tools = join(sdk, 'build-tools')
  const newest = readdirSync(tools).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)
  if (!newest) fail(`No build tools in ${tools}.`)
  const r = spawnSync(join(tools, newest, win ? 'apksigner.bat' : 'apksigner'), ['verify', '--print-certs', apk], { encoding: 'utf8', shell: win })
  const digest = /certificate SHA-256 digest: ([0-9a-f]{64})/.exec(r.stdout ?? '')?.[1]
  if (r.status !== 0 || !digest) fail(`apksigner could not verify ${apk}:\n${r.stdout ?? ''}${r.stderr ?? ''}`)
  return digest
}

run('node', ['scripts/build-mobile-editor.mjs'], root)
if (!existsSync(join(mobile, 'node_modules'))) run(win ? 'npm.cmd' : 'npm', ['ci'], mobile)
run(win ? 'npx.cmd' : 'npx', ['expo', 'prebuild', '--platform', 'android', '--no-install', '--clean'], mobile)
run(win ? 'gradlew.bat' : './gradlew', ['assembleRelease', '--no-daemon'], join(mobile, 'android'))

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const apk = join(mobile, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
const certificate = signingCertificate(apk)
if (certificate === PUBLIC_DEBUG_CERT) fail('The APK is signed with the public debug key. It must not be released.')
const out = join(root, 'release', `Notes-${version}.apk`)
mkdirSync(dirname(out), { recursive: true })
copyFileSync(apk, out)
console.log(`\nAPK: ${out}\nSigning certificate SHA-256: ${certificate}`)
