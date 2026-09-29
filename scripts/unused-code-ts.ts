import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { findGitSourceFiles } from '@inspection/unused-code-detector/files'
import { inspectTypeScriptUnusedCode } from '@inspection/unused-code-detector/typescript'
import { inspectionOutputDirectory } from './inspection-output.js'

function diagnosticText(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
}

function main() {
  if (process.argv.length !== 2) throw new Error('Usage: pnpm run check:unused:ts')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
  if (config.error) throw new Error(diagnosticText(config.error))
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  if (parsed.errors.length) throw new Error(parsed.errors.map(diagnosticText).join('\n'))
  const files = findGitSourceFiles(root)
  console.log(`TypeScript ${ts.version}: inspecting ${files.length} files with the language service...`)
  const report = inspectTypeScriptUnusedCode(root, files, {
    ...parsed.options,
    allowJs: true,
    checkJs: false,
    noEmit: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
  })
  const output = path.join(inspectionOutputDirectory('unused-code-ts-'), 'report.json')
  fs.writeFileSync(output, `${JSON.stringify(report, undefined, 2)}\n`, {
    flag: 'wx',
  })
  for (const finding of report.findings.slice(0, 30))
    console.log(`${finding.file}:${finding.line}:${finding.column} [${finding.kind}] ${finding.symbol}: ${finding.description}`)
  console.log(`${report.files} implementation files; ${report.exports} exports; ${report.findings.length} findings.`)
  console.log(
    'Experimental reference audit: framework entry points and external consumers require review; member reachability is not analyzed.',
  )
  console.log('Dynamic imports conservatively count as consumers of every export in the imported module.')
  console.log(`Report: ${output}`)
  if (!report.complete) {
    console.error(report.errors.join('\n'))
    process.exitCode = 2
  } else if (report.findings.length) {
    process.exitCode = 1
  }
}

try {
  main()
} catch (error) {
  console.error(String(error))
  process.exitCode = 2
}
