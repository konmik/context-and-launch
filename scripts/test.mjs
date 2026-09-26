import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const runner = fileURLToPath(new URL('./run-tests.mjs', import.meta.url))
const testPaths = process.argv.slice(2)
const groups = new Map()

for (const testPath of testPaths) {
  const normalized = testPath.replaceAll('\\', '/')
  const suite = normalized.endsWith('.shell.test.ts') ? 'shell' : /(^|\/)e2e\//.test(normalized) ? 'e2e' : 'unit'
  if (!groups.has(suite)) groups.set(suite, [])
  groups.get(suite).push(testPath)
}

if (testPaths.length === 0) groups.set('all', [])

for (const [suite, paths] of groups) {
  const result = spawnSync(process.execPath, [runner, suite, ...paths], { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
