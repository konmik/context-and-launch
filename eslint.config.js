import tseslint from 'typescript-eslint'
import namedFunctionReturns from './tools/eslint/named-function-returns.ts'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'dist-electron/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.{ts,tsx}', 'electron/**/*.ts', 'scripts/**/*.ts', 'tools/eslint/**/*.ts', '*.config.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: { allowDefaultProject: ['vitest.config.ts', 'vitest.shell.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { local: { rules: { 'named-function-returns': namedFunctionReturns } } },
    rules: {
      'local/named-function-returns': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@solidjs/router',
              importNames: ['createAsync'],
              message: 'Use a Solid 2 async memo or projection under Loading and Errored boundaries.',
            },
            { name: 'solid-js/web', message: 'Import renderer APIs from @solidjs/web.' },
            { name: 'solid-js/store', message: 'Import Solid 2 store APIs from solid-js.' },
          ],
        },
      ],
    },
  },
)
