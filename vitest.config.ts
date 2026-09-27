import { defineConfig } from 'vitest/config'
import solidPlugin from '@solidjs/vite-plugin'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const alias = {
  '~': path.resolve(__dirname, 'src'),
}

const solidVite = () => ({
  plugins: solidPlugin(),
  resolve: {
    alias,
  },
})

const timingReporter = fileURLToPath(new URL('./scripts/test-timing-reporter.ts', import.meta.url))

const projectTemplate = fileURLToPath(new URL('./tests/e2e/project-template.ts', import.meta.url))

const nodeTests = ['tests/core/**/*.test.ts', 'tests/electron/**/*.test.ts', 'tests/scripts/**/*.test.ts']

export default defineConfig({
  ...solidVite(),
  test: {
    poolOptions: {
      forks: {
        maxForks: process.platform === 'win32' ? 8 : 24,
      },
    },
    reporters: ['default', timingReporter],
    projects: [
      {
        resolve: {
          alias,
        },
        test: {
          name: 'unit-node',
          environment: 'node',
          isolate: false,
          include: nodeTests,
          exclude: ['**/*.shell.test.ts'],
          testTimeout: 20000,
          maxConcurrency: 8,
          setupFiles: ['tests/test-git-env.ts'],
        },
      },
      {
        ...solidVite(),
        test: {
          name: 'unit-ts',
          isolate: false,
          environment: 'jsdom',
          include: ['tests/**/*.test.ts'],
          exclude: [...nodeTests, 'tests/server/**/*.test.ts', 'tests/e2e/**/*.test.ts', '**/*.shell.test.ts'],
          testTimeout: 20000,
          maxConcurrency: 8,
          setupFiles: ['tests/test-git-env.ts'],
        },
      },
      {
        ...solidVite(),
        test: {
          name: 'unit-tsx',
          include: ['tests/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/test-setup.ts'],
        },
      },
      {
        ...solidVite(),
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/server/**/*.test.ts'],
          setupFiles: ['tests/test-git-env.ts'],
        },
      },
      {
        resolve: {
          alias,
        },
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          // Every e2e file runs a real server and a real browser against real git
          // and real files. Windows serialises far more of that I/O than the core
          // count suggests, and oversubscribing it starves individual runs until
          // they miss their deadlines. Unit projects keep the wider default.
          poolOptions: {
            forks: {
              maxForks: process.platform === 'win32' ? 4 : 12,
            },
          },
          testTimeout: 60000,
          hookTimeout: 60000,
          maxConcurrency: 4,
          globalSetup: [projectTemplate],
          setupFiles: ['tests/test-git-env.ts'],
        },
      },
      {
        resolve: {
          alias,
        },
        test: {
          name: 'bench',
          include: ['tests/e2e/**/*.bench.ts'],
          testTimeout: 600000,
          hookTimeout: 600000,
          maxConcurrency: 1,
          globalSetup: [projectTemplate],
          setupFiles: ['tests/test-git-env.ts'],
        },
      },
    ],
  },
})
