# Unused code detector

Reusable Node.js library for finding declarations with no references outside their own body, or references only from tests. Findings are review candidates, not proof that code can be deleted. Dynamic consumers, framework entry points and external callers may be invisible to LSP references.

## Layout

- `src/detector.ts`: language-independent analysis and typed reports.
- `src/lsp-client.ts`: JSON-RPC transport for a stdio language server.
- `src/baseline.ts`: reviewed exceptions and stale-entry detection.
- `src/files.ts`: optional Git-based JavaScript/TypeScript discovery and path helpers.
- `src/typescript/`: optional TypeScript server, declaration exclusions and compiler-based inspection.
- `dist/`: generated JavaScript, declarations and source maps.

The main entry point does not load TypeScript or typescript-language-server. Install those optional peers only when using the TypeScript entry point. Git is required only for `findGitSourceFiles`; other languages and non-Git projects should supply their own file list.

## Use another LSP

```ts
import { createLanguageServer, inspectUnusedCode } from '@inspection/unused-code-detector'

const report = await inspectUnusedCode(
  { root: projectRoot, files: sourceAndTestFiles },
  {
    createServer: () => createLanguageServer(serverExecutable, serverArguments, projectRoot),
    languageId: () => 'rust',
    isTestFile: (relativePath) => relativePath.startsWith('tests/'),
    shouldInspect: () => true,
    reviewDeclaration: () => ({ referenceTargets: [] }),
  },
)
```

Supply a `LanguageServerCommands` implementation instead of the stdio factory for an existing connection or another transport. Each inspection owns the client returned by `createServer` and closes it, including on failure. The server must support references and hierarchical document symbols with declaration-name selection ranges. Flat symbol responses produce an explicit incomplete report rather than guessed name positions. File URIs and UTF-16 LSP positions are required.

File paths can be absolute or relative to `root`. Include test files in `files` so their references are visible. The test classifier receives normalized root-relative paths; other file hooks receive absolute paths. `shouldInspect` excludes declarations without excluding their documents as reference sources. `reviewDeclaration` can exclude a declaration with a reason or supply additional reference targets for linked contracts. Language-specific initialization data goes in `initializationOptions`. Progress is optional; the library itself writes no report files and sets no process exit codes.

`onProgress(inspectedFiles, symbols)` receives counter values, not mutable inspection state. Inspect `report.complete` and `report.errors` before using findings. An incomplete report must not be treated as a clean audit.

## TypeScript

The `@inspection/unused-code-detector/typescript` entry point provides `createTypeScriptLanguageServer`, `createTypeScriptInitializationOptions`, `getTypeScriptLanguageId`, `createTypeScriptExclusions` and `inspectTypeScriptUnusedCode`. Exclusion analysis reads the project's `tsconfig.json`; callers supply entry points, external configuration contracts and their test classifier. No application paths are built into the package.

## Build and workspace use

Run `pnpm --filter @inspection/unused-code-detector build` to generate distributable ESM and declarations. Packing runs the build automatically. The `source` export condition lets workspace consumers use the TypeScript source through `tsx --conditions=source` without a build. Published consumers use `dist` by default.

This repository's scripts own file discovery, project-specific contracts, baseline location, console output and exit policy. `pnpm run check:unused` retains exit codes 0 for clean, 1 for findings or stale baseline entries, and 2 for analyzer failures.
