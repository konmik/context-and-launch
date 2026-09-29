import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SymbolKind } from 'vscode-languageserver-protocol/node'
import type { DocumentSymbol, Location, Position, Range } from 'vscode-languageserver-protocol/node'
import { createLanguageServer } from './lsp-client.js'
import { inspectionOutputDirectory, isTestFile, relativeFile, sourceFiles } from './unused-code-files.js'
import { createTypeScriptExclusions } from './unused-code-ts-exclusions.js'
import { compareInspectionBaseline, readInspectionBaseline } from './unused-code-baseline.js'

interface ReferenceLocation {
  file: string
  line: number
  column: number
}

interface LspFinding extends ReferenceLocation {
  id: string
  kind: 'unused' | 'test-only'
  symbol: string
  symbolKind: SymbolKind
  container: string[]
  references: ReferenceLocation[]
}

interface LspReport {
  complete: boolean
  server?: {
    name: string
    version?: string
  }
  openedFiles: number
  inspectedFiles: number
  symbols: number
  skippedSymbols: number
  referenceRequests: number
  exclusions: ExcludedDeclaration[]
  errors: string[]
  findings: LspFinding[]
}

interface ExcludedDeclaration extends ReferenceLocation {
  symbol: string
  reason: string
}

interface Candidate {
  symbol: DocumentSymbol
  container: string[]
}

interface CandidateCollection {
  candidates: Candidate[]
  skippedSymbols: number
}

function languageId(file: string): string {
  if (file.endsWith('.tsx')) return 'typescriptreact'
  if (file.endsWith('.jsx')) return 'javascriptreact'
  return /\.[cm]?ts$/.test(file) ? 'typescript' : 'javascript'
}

function selectedText(lines: string[], range: Range): string {
  const selected = lines.slice(range.start.line, range.end.line + 1)
  if (!selected.length) throw new Error('Language server returned a selection outside the document.')
  const end = selected.length - 1
  selected[end] = selected[end].slice(0, range.end.character)
  selected[0] = selected[0].slice(range.start.character)
  return selected.join('\n')
}

function candidates(symbols: DocumentSymbol[], container: string[], lines: string[]): CandidateCollection {
  const result: CandidateCollection = {
    candidates: [],
    skippedSymbols: 0,
  }
  for (const symbol of symbols) {
    const children = candidates(symbol.children ?? [], [...container, symbol.name], lines)
    result.candidates.push(...children.candidates)
    result.skippedSymbols += children.skippedSymbols
    const text = selectedText(lines, symbol.selectionRange)
    const names = [symbol.name, `'${symbol.name}'`, `"${symbol.name}"`, `\`${symbol.name}\``]
    if ([SymbolKind.File, SymbolKind.Module, SymbolKind.Package].includes(symbol.kind) || !names.includes(text)) {
      result.skippedSymbols += 1
      continue
    }
    result.candidates.push({
      symbol,
      container,
    })
  }
  return result
}

function comparePosition(a: Position, b: Position): number {
  return a.line - b.line || a.character - b.character
}

function contains(range: Range, position: Position): boolean {
  return comparePosition(position, range.start) >= 0 && comparePosition(position, range.end) < 0
}

function documentKey(uri: string): string {
  const file = path.resolve(fileURLToPath(uri))
  return process.platform === 'win32' ? file.toLowerCase() : file
}

function referenceLocation(root: string, reference: Location): ReferenceLocation {
  return {
    file: relativeFile(root, fileURLToPath(reference.uri)),
    line: reference.range.start.line + 1,
    column: reference.range.start.character + 1,
  }
}

function makeFinding(root: string, uri: string, candidate: Candidate, references: Location[]): LspFinding | undefined {
  const document = documentKey(uri)
  const callers = references.filter(
    (reference) => documentKey(reference.uri) !== document || !contains(candidate.symbol.range, reference.range.start),
  )
  const unique = new Map<string, ReferenceLocation>()
  for (const caller of callers) {
    const position = referenceLocation(root, caller)
    if (!isTestFile(position.file)) return undefined
    unique.set(`${position.file}:${position.line}:${position.column}`, position)
  }
  const position = referenceLocation(root, {
    uri,
    range: candidate.symbol.selectionRange,
  })
  const kind = unique.size ? 'test-only' : 'unused'
  const id = createHash('sha256')
    .update(JSON.stringify([position.file, candidate.container, candidate.symbol.name, candidate.symbol.kind, kind]))
    .digest('hex')
  return {
    ...position,
    id,
    kind,
    symbol: candidate.symbol.name,
    symbolKind: candidate.symbol.kind,
    container: candidate.container,
    references: [...unique.values()],
  }
}

async function inspect(root: string, files: string[], report: LspReport): Promise<void> {
  const documents = new Map<string, string[]>()
  const exclusions = createTypeScriptExclusions(root, files)
  const server = createLanguageServer(
    process.execPath,
    [fileURLToPath(import.meta.resolve('typescript-language-server/lib/cli.mjs')), '--stdio'],
    root,
  )
  try {
    const initialized = await server.initialize({
      processId: process.pid,
      rootUri: pathToFileURL(root).href,
      workspaceFolders: [
        {
          uri: pathToFileURL(root).href,
          name: path.basename(root),
        },
      ],
      capabilities: {
        textDocument: {
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
          },
          references: {},
        },
      },
      initializationOptions: {
        hostInfo: 'unused-code-checker',
        tsserver: {
          path: fileURLToPath(import.meta.resolve('typescript/lib/tsserver.js')),
        },
        disableAutomaticTypingAcquisition: true,
      },
    })
    report.server = initialized.serverInfo
    if (!initialized.capabilities.documentSymbolProvider || !initialized.capabilities.referencesProvider)
      throw new Error('Language server must support document symbols and references.')
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8')
      documents.set(file, text.split(/\r?\n/))
      await server.open({
        uri: pathToFileURL(file).href,
        languageId: languageId(file),
        version: 1,
        text,
      })
      report.openedFiles += 1
    }
    for (const file of files) {
      if (isTestFile(relativeFile(root, file)) || /\.d\.[cm]?ts$/.test(file)) continue
      const uri = pathToFileURL(file).href
      const symbols = await server.symbols(uri)
      const declarations: DocumentSymbol[] = []
      for (const symbol of symbols ?? []) {
        if (!('selectionRange' in symbol)) throw new Error(`Language server returned flat symbols without name positions: ${file}`)
        declarations.push(symbol)
      }
      const lines = documents.get(file)
      if (!lines) throw new Error(`Missing opened document: ${file}`)
      const collected = candidates(declarations, [], lines)
      report.skippedSymbols += collected.skippedSymbols
      for (const candidate of collected.candidates) {
        report.symbols += 1
        const review = exclusions.review(file, candidate.symbol.selectionRange.start)
        if (review.reason) {
          report.exclusions.push({
            ...referenceLocation(root, {
              uri,
              range: candidate.symbol.selectionRange,
            }),
            symbol: candidate.symbol.name,
            reason: review.reason,
          })
          continue
        }
        report.referenceRequests += 1
        const references = (await server.references(uri, candidate.symbol.selectionRange.start)) ?? []
        let finding = makeFinding(root, uri, candidate, references)
        for (const target of review.referenceTargets) {
          if (!finding) break
          report.referenceRequests += 1
          const related = await server.references(target.uri, target.range.start)
          references.push(...(related ?? []))
          finding = makeFinding(root, uri, candidate, references)
        }
        if (finding) report.findings.push(finding)
      }
      report.inspectedFiles += 1
      if (report.inspectedFiles % 50 === 0)
        console.log(`Inspected ${report.inspectedFiles} files; requested references for ${report.symbols} symbols.`)
    }
  } catch (error) {
    report.errors.push(String(error))
  } finally {
    await server.close()
    report.errors.push(...server.errors())
    report.complete = report.errors.length === 0
    report.findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)
  }
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error('Usage: pnpm run check:unused')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const baseline = readInspectionBaseline(path.join(root, 'tools/inspections/unused-code-baseline.json'))
  const files = sourceFiles(root)
  const report: LspReport = {
    complete: false,
    openedFiles: 0,
    inspectedFiles: 0,
    symbols: 0,
    skippedSymbols: 0,
    referenceRequests: 0,
    exclusions: [],
    errors: [],
    findings: [],
  }
  console.log(`Opening ${files.length} files through LSP, including tests as reference sources...`)
  await inspect(root, files, report)
  const comparison = report.complete ? compareInspectionBaseline(report.findings, baseline) : undefined
  const output = path.join(inspectionOutputDirectory('unused-code-lsp-'), 'report.json')
  fs.writeFileSync(
    output,
    `${JSON.stringify(
      {
        ...report,
        comparison,
      },
      undefined,
      2,
    )}\n`,
    {
      flag: 'wx',
    },
  )
  for (const finding of (comparison?.newFindings ?? report.findings).slice(0, 30))
    console.log(`${finding.file}:${finding.line}:${finding.column} [${finding.kind}] ${[...finding.container, finding.symbol].join('.')}`)
  console.log(`${report.inspectedFiles} files; ${report.referenceRequests} reference requests; ${report.findings.length} candidates.`)
  console.log(`Skipped ${report.skippedSymbols} container or synthetic symbols without a matching declaration name.`)
  console.log(`${report.exclusions.length} declarations excluded by TypeScript rules; reasons are recorded in the report.`)
  console.log(
    'Candidates require review: document symbols can omit locals; framework, dynamic, and external consumers may be invisible to references.',
  )
  console.log(`Report: ${output}`)
  if (!report.complete) {
    console.error(report.errors.join('\n'))
    console.error('Inspection incomplete. Repair the LSP failure before reviewing baseline changes.')
    process.exitCode = 2
  } else if (comparison) {
    console.log(
      `${comparison.newFindings.length} new; ${comparison.suppressedCount} baselined; ${comparison.staleEntries.length} stale baseline entries.`,
    )
    for (const entry of comparison.staleEntries) console.error(`Stale or reduced-count baseline entry: ${entry.file} ${entry.symbol}`)
    if (comparison.newFindings.length || comparison.staleEntries.length) {
      console.error(
        'Review report.json and fix confirmed unused or test-only code. Baseline only reviewed exceptions as file -> qualified symbol -> reason; use [count, reason] for multiple occurrences.',
      )
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
