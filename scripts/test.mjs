import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const runner = fileURLToPath(new URL('./run-tests.mjs', import.meta.url))
const testPaths = process.argv.slice(2)
const suite = testPaths.length === 0 ? 'all' : 'selected'
const result = spawnSync(process.execPath, [runner, suite, ...testPaths], { stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
