import './require-test-workspace.mjs'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { activeMarkerName } from './test-workspace.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const receipt = path.join(root, 'dist', '.test-build')

function fingerprint(files: string[]): string {
  const hash = createHash('sha256')
  for (const file of [...new Set(files)].sort()) {
    hash.update(file).update('\0')
    const absolute = path.join(root, file)
    if (fs.existsSync(absolute)) hash.update(fs.readFileSync(absolute))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function outputFiles(directory: string): string[] {
  const absolute = path.join(root, directory)
  if (!fs.existsSync(absolute)) return []
  return fs
    .readdirSync(absolute, {
      withFileTypes: true,
    })
    .flatMap((entry) => {
      const relative = path.join(directory, entry.name)
      return entry.isDirectory() ? outputFiles(relative) : [relative]
    })
}

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\0')
  .filter((file) => file.length > 0 && file !== activeMarkerName)

files.push(...fs.readdirSync(root).filter((name) => name === '.env' || name.startsWith('.env.')))

const environment = Object.entries(process.env)
  .filter(([name]) => name.startsWith('VITE_') || ['NODE_ENV', 'BABEL_ENV', 'NODE_OPTIONS'].includes(name))
  .sort(([left], [right]) => left.localeCompare(right))

const inputs = createHash('sha256')
  .update(fingerprint(files))
  .update(JSON.stringify([process.version, process.platform, process.arch, environment]))
  .digest('hex')

const outputs = () => fingerprint([...outputFiles('dist/client'), ...outputFiles('dist/server')])

const expected = `${inputs}\n${outputs()}\n`

if (fs.existsSync(receipt) && fs.readFileSync(receipt, 'utf8') === expected) {
  console.log('Reusing verified test build (inputs and outputs unchanged).')
} else {
  console.log('Building test app (build inputs or outputs changed).')
  if (fs.existsSync(receipt)) fs.unlinkSync(receipt)
  const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  fs.writeFileSync(receipt, `${inputs}\n${outputs()}\n`)
}
