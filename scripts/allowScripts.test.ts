import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')
const read = (file: string): Record<string, never> => JSON.parse(readFileSync(join(root, file), 'utf8'))

// npm skips the install script of any dependency allowScripts does not name, without failing, so a version bump that
// leaves the entry behind breaks the package only at run time.
describe.each(['.', 'mobile'])('install scripts in %s', (dir) => {
  it('are allowed for every locked package that has one', () => {
    const allowed = Object.keys((read(join(dir, 'package.json')) as { allowScripts?: Record<string, boolean> }).allowScripts ?? {})
    const packages = (read(join(dir, 'package-lock.json')) as { packages: Record<string, { version?: string; hasInstallScript?: boolean }> }).packages
    const needed = Object.entries(packages)
      .filter(([path, p]) => path && p.hasInstallScript)
      .map(([path, p]) => `${path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)}@${p.version}`)
    expect(needed.filter((pkg) => !allowed.includes(pkg) && !allowed.includes(pkg.slice(0, pkg.lastIndexOf('@'))))).toEqual([])
  })
})
