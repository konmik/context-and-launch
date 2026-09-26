import './require-test-workspace.mjs'
import { spawnSync } from 'node:child_process'

const suite = process.argv[2]
const testArguments = process.argv.slice(3)
const vitest = './node_modules/vitest/vitest.mjs'
const unit = [vitest, 'run', '--project', 'unit-ts', '--project', 'unit-tsx', '--project', 'server']
const build = ['./node_modules/vite/bin/vite.js', 'build']
const gate = ['./node_modules/tsx/dist/cli.mjs', 'scripts/testid-coverage.ts']
const e2e = [vitest, 'run', '--project', 'e2e']
const commands = {
  unit: [[...unit, ...testArguments]],
  e2e: [build, [...e2e, ...testArguments]],
  all: [[...unit, ...testArguments], build, gate, [...e2e, ...testArguments]],
  shell: [[vitest, 'run', '-c', 'vitest.shell.config.ts', ...testArguments]],
  bench: [[vitest, 'run', '--project', 'bench', ...testArguments]],
}

if (!Object.hasOwn(commands, suite)) throw new Error(`Unknown test suite: ${suite}`)

for (const args of commands[suite]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
