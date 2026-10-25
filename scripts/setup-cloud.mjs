#!/usr/bin/env node
// One-time cloud setup: creates (or reuses) a Supabase project, applies the database schema,
// pushes the auth settings in supabase/config.toml, writes .env.production, and optionally builds the installer.
//
//   npm run setup:cloud                         create a new project named "win-notes"
//   npm run setup:cloud -- --project-ref <ref>  use an existing project
//   npm run setup:cloud -- --region eu-west-2   pick a region (default us-east-1)
//   npm run setup:cloud -- --no-build           skip building the installer
//
// Requires `supabase login` first.
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(import.meta.dirname, '..')
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)
const secretsFile = join(root, '.env.supabase.local')

const isWin = process.platform === 'win32'
const SECRET_FLAGS = new Set(['--password', '--db-password'])

/** The command as it can be printed: the database password is never shown. */
export const shownCommand = (cmdArgs) => cmdArgs.map((a, i) => (SECRET_FLAGS.has(cmdArgs[i - 1]) ? '***' : a)).join(' ')

function sb(cmdArgs, { json = false, quiet = false } = {}) {
  const res = spawnSync('supabase', cmdArgs, { cwd: root, encoding: 'utf8', shell: isWin })
  if (res.status !== 0) {
    const msg = (res.stderr || res.stdout || '').trim()
    throw new Error(`supabase ${shownCommand(cmdArgs)} failed:\n${msg}`)
  }
  if (!quiet && !json && res.stdout.trim()) console.log(res.stdout.trim())
  if (!json) return res.stdout
  const out = res.stdout.trim()
  const start = out.search(/[[{]/)
  return JSON.parse(out.slice(start))
}

const step = (n, text) => console.log(`\n[${n}/6] ${text}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function readSecrets() {
  if (!existsSync(secretsFile)) return {}
  return Object.fromEntries(
    readFileSync(secretsFile, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  )
}

async function main() {
  step(1, 'Checking Supabase login')
  let projects
  try {
    projects = sb(['projects', 'list', '-o', 'json'], { json: true })
  } catch {
    console.error('\nNot logged in. Run `supabase login` first, then re-run this command.')
    process.exit(1)
  }
  const list = Array.isArray(projects) ? projects : projects.projects ?? []
  console.log(`Logged in. ${list.length} existing project(s).`)

  const saved = readSecrets()
  let ref = flag('project-ref') ?? saved.SUPABASE_PROJECT_REF
  // Only overwrite auth settings on a project this script created, never on one you already had.
  let ownsProject = !flag('project-ref') && !!saved.SUPABASE_PROJECT_REF
  let password = flag('db-password') ?? saved.SUPABASE_DB_PASSWORD

  step(2, ref ? `Using project ${ref}` : 'Creating project "win-notes"')
  if (!ref) {
    const orgs = sb(['orgs', 'list', '-o', 'json'], { json: true })
    const orgList = Array.isArray(orgs) ? orgs : orgs.organizations ?? []
    const org = flag('org-id') ?? orgList[0]?.id
    if (!org) throw new Error('No Supabase organization found. Create one at https://supabase.com/dashboard first.')
    password = randomBytes(18).toString('base64url')
    const created = sb(
      ['projects', 'create', 'win-notes', '--org-id', org, '--db-password', password, '--region', flag('region') ?? 'us-east-1', '-o', 'json'],
      { json: true }
    )
    ref = created.ref ?? created.id ?? created.project_ref
    if (!ref) throw new Error(`Could not read the new project ref from: ${JSON.stringify(created)}`)
    ownsProject = true
    writeFileSync(secretsFile, `SUPABASE_PROJECT_REF=${ref}\nSUPABASE_DB_PASSWORD=${password}\n`)
    console.log(`Created project ${ref}. Database password saved to .env.supabase.local (not committed).`)
  }
  if (!password) throw new Error('Pass --db-password <password> for an existing project (needed to apply the schema).')

  step(3, 'Waiting for the project to be ready')
  for (let i = 0; i < 90; i++) {
    const all = sb(['projects', 'list', '-o', 'json'], { json: true })
    const p = (Array.isArray(all) ? all : all.projects ?? []).find((x) => (x.ref ?? x.id) === ref)
    const status = p?.status ?? 'UNKNOWN'
    if (status === 'ACTIVE_HEALTHY') break
    if (i % 6 === 0) console.log(`  status: ${status}`)
    await sleep(10_000)
  }

  step(4, 'Applying database schema (tables, row security, realtime)')
  sb(['link', '--project-ref', ref, '--password', password])
  sb(['db', 'push', '--linked', '--password', password, '--yes'])

  step(5, 'Pushing auth settings (email confirmation, password rules, winnotes:// sign-in links)')
  const authSettings =
    `Check "Confirm email" is on at https://supabase.com/dashboard/project/${ref}/auth/providers and that ` +
    `winnotes://auth-callback** is a redirect URL at https://supabase.com/dashboard/project/${ref}/auth/url-configuration`
  if (!ownsProject) {
    console.log(`Skipped for an existing project. ${authSettings}`)
  } else try {
    sb(['config', 'push', '--project-ref', ref, '--yes'])
  } catch (err) {
    console.warn(`Could not push auth settings automatically:\n${err.message}\n${authSettings}`)
  }

  step(6, 'Writing .env.production')
  const keys = sb(['projects', 'api-keys', '--project-ref', ref, '-o', 'json'], { json: true })
  const keyList = Array.isArray(keys) ? keys : keys.keys ?? []
  const publishable =
    keyList.find((k) => k.type === 'publishable')?.api_key ??
    keyList.find((k) => (k.api_key ?? '').startsWith('sb_publishable_'))?.api_key ??
    keyList.find((k) => k.name === 'anon')?.api_key
  if (!publishable) throw new Error(`No publishable key found in: ${JSON.stringify(keyList.map((k) => k.name ?? k.type))}`)
  writeFileSync(
    join(root, '.env.production'),
    `# Generated by scripts/setup-cloud.mjs. The publishable key is safe to ship in the app.\nVITE_SUPABASE_URL=https://${ref}.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=${publishable}\n`
  )
  console.log(`Cloud ready: https://${ref}.supabase.co`)

  if (!has('no-build')) {
    console.log('\nBuilding the Windows installer…')
    execFileSync(isWin ? 'npm.cmd' : 'npm', ['run', isWin ? 'dist:win' : 'dist:mac'], { cwd: root, stdio: 'inherit', shell: isWin })
    console.log('\nDone. Installer is in the release folder.')
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`\nSetup failed: ${err.message}`)
    process.exit(1)
  })
}
