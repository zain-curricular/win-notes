// Builds the Android APK: bundles the editor page, generates the native project with Expo, runs Gradle,
// and copies the result to release/Notes-<version>.apk next to the desktop installers.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const mobile = join(root, 'mobile')
const win = process.platform === 'win32'

function run(cmd, args, cwd) {
  console.log(`\n> ${cmd} ${args.join(' ')}  (${cwd})`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: win })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('node', ['scripts/build-mobile-editor.mjs'], root)
if (!existsSync(join(mobile, 'node_modules'))) run(win ? 'npm.cmd' : 'npm', ['ci'], mobile)
run(win ? 'npx.cmd' : 'npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], mobile)
run(win ? 'gradlew.bat' : './gradlew', ['assembleRelease', '--no-daemon'], join(mobile, 'android'))

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const apk = join(mobile, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
const out = join(root, 'release', `Notes-${version}.apk`)
mkdirSync(dirname(out), { recursive: true })
copyFileSync(apk, out)
console.log(`\nAPK: ${out}`)
