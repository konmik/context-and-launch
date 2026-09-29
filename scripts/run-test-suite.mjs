import './require-test-workspace.mjs'
import { spawnSync } from 'node:child_process'

const suite = process.argv[2]
const testArguments = process.argv.slice(3)
const groups = new Map()

if (suite === 'selected') {
  if (testArguments.length === 0) throw new Error('Selected test runs require explicit test paths.')
  for (const testPath of testArguments) {
    const normalized = testPath.replaceAll('\\', '/')
    const selectedSuite = normalized.endsWith('.shell.test.ts') ? 'shell' : /(^|\/)e2e\//.test(normalized) ? 'e2e' : 'unit'
    if (!groups.has(selectedSuite)) groups.set(selectedSuite, [])
    groups.get(selectedSuite).push(testPath)
  }
} else {
  groups.set(suite, testArguments)
}

const vitest = './node_modules/vitest/vitest.mjs'
const unit = [vitest, 'run', '--project', 'unit-node', '--project', 'unit-ts', '--project', 'unit-tsx', '--project', 'server']
const build = ['./node_modules/vite/bin/vite.js', 'build']
const cachedBuild = ['./node_modules/tsx/dist/cli.mjs', 'scripts/test-build.ts']
const e2e = [vitest, 'run', '--project', 'e2e', '--poolOptions.forks.maxForks', String(process.platform === 'win32' ? 2 : 12)]
for (const [selectedSuite, paths] of groups) {
  const commands = {
    unit: [[...unit, ...paths]],
    e2e: [cachedBuild, [...e2e, ...paths]],
    all: [[...unit, ...paths], build, [...e2e, ...paths]],
    shell: [[vitest, 'run', '-c', 'vitest.shell.config.ts', ...paths]],
    bench: [[vitest, 'run', '--project', 'bench', ...paths]],
  }
  if (!Object.hasOwn(commands, selectedSuite)) throw new Error(`Unknown test suite: ${selectedSuite}`)
  for (const args of commands[selectedSuite]) {
    const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
}
