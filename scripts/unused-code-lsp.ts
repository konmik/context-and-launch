import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareInspectionBaseline, inspectUnusedCode, readInspectionBaseline } from '@inspection/unused-code-detector'
import { findGitSourceFiles, isTestFile } from '@inspection/unused-code-detector/files'
import { createTypeScriptExclusions, createTypeScriptLanguageServer, createTypeScriptInitializationOptions, getTypeScriptLanguageId } from '@inspection/unused-code-detector/typescript'
import { inspectionOutputDirectory } from './inspection-output.js'

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error('Usage: pnpm run check:unused')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const baseline = readInspectionBaseline(path.join(root, 'tools/inspections/unused-code-baseline.json'))
  const files = findGitSourceFiles(root)
  const exclusions = createTypeScriptExclusions(root, files, {
    entryPoints: new Map([
      ['src/Document.tsx#Document', 'Solid document entry point'],
      ['src/server/middleware.ts#middleware', 'vite.config.ts middleware entry point'],
    ]),
    externalConfigurations: new Map([
      ['eslint.config.js', { exportName: 'default', reason: 'ESLint flat configuration' }],
      ['scripts/typescript-spacing-config.mjs', { exportName: 'typescriptSpacingConfig', reason: 'ESLint stylistic rule configuration' }],
    ]),
  }, isTestFile)
  console.log(`Opening ${files.length} files through LSP, including tests as reference sources...`)
  const report = await inspectUnusedCode({ root, files, initializationOptions: createTypeScriptInitializationOptions() }, {
    createServer: () => createTypeScriptLanguageServer(root),
    languageId: getTypeScriptLanguageId,
    isTestFile,
    shouldInspect: (file) => !/\.d\.[cm]?ts$/.test(file),
    reviewDeclaration: exclusions.review,
    onProgress: (inspectedFiles, symbols) => {
      if (inspectedFiles % 50 === 0)
        console.log(`Inspected ${inspectedFiles} files; requested references for ${symbols} symbols.`)
    },
  })
  const comparison = report.complete ? compareInspectionBaseline(report.findings, baseline) : undefined
  const output = path.join(inspectionOutputDirectory('unused-code-lsp-'), 'report.json')
  fs.writeFileSync(output, `${JSON.stringify({ ...report, comparison }, undefined, 2)}\n`, { flag: 'wx' })
  for (const finding of (comparison?.newFindings ?? report.findings).slice(0, 30))
    console.log(`${finding.file}:${finding.line}:${finding.column} [${finding.kind}] ${[...finding.container, finding.symbol].join('.')}`)
  console.log(`${report.inspectedFiles} files; ${report.referenceRequests} reference requests; ${report.findings.length} candidates.`)
  console.log(`Skipped ${report.skippedSymbols} container or synthetic symbols without a matching declaration name.`)
  console.log(`${report.exclusions.length} declarations excluded by TypeScript rules; reasons are recorded in the report.`)
  console.log('Candidates require review: document symbols can omit locals; framework, dynamic, and external consumers may be invisible to references.')
  console.log(`Report: ${output}`)
  if (!report.complete) {
    console.error(report.errors.join('\n'))
    console.error('Inspection incomplete. Repair the LSP failure before reviewing baseline changes.')
    process.exitCode = 2
  } else if (comparison) {
    console.log(`${comparison.newFindings.length} new; ${comparison.suppressedCount} baselined; ${comparison.staleEntries.length} stale baseline entries.`)
    for (const entry of comparison.staleEntries) console.error(`Stale or reduced-count baseline entry: ${entry.file} ${entry.symbol}`)
    if (comparison.newFindings.length || comparison.staleEntries.length) {
      console.error('Review report.json and fix confirmed unused or test-only code. Baseline only reviewed exceptions as file -> qualified symbol -> reason; use [count, reason] for multiple occurrences.')
      console.error('Remove or reduce stale entries, then re-run pnpm run check:unused. Only exit 0 is a clean audit.')
      process.exitCode = 1
    }
  }
}

try {
  await main()
} catch (error) {
  console.error(String(error))
  process.exitCode = 2
}
