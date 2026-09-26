# Formatting, checks, and tests

- After editing code, run `pnpm run check <affected-test-file>...` once for selected tests. Always supply test paths; omitting them runs the full suite.
- Run `pnpm run check:full` only when the user explicitly requests it. It runs formatting, repo-wide TypeScript checking, lint, and tests.
- Run the full suite with `pnpm test` only when the user explicitly requests it.
- Never add tests unless the user explicitly requests them.
