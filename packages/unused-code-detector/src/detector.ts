import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SymbolKind } from 'vscode-languageserver-protocol/node'
import type { DocumentSymbol, InitializeParams, Location, Position, Range } from 'vscode-languageserver-protocol/node'
import type { LanguageServerCommands } from './lsp-client.js'
import { relativeFile } from './files.js'

export interface ReferenceLocation {
  file: string
  line: number
  column: number
}

export interface LspFinding extends ReferenceLocation {
  id: string
  kind: 'unused' | 'test-only'
  symbol: string
  symbolKind: SymbolKind
  container: string[]
  references: ReferenceLocation[]
}

export interface LspReport {
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

export interface ExcludedDeclaration extends ReferenceLocation {
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

export interface DeclarationReview {
  reason?: string
  referenceTargets: Location[]
}

export interface DetectorOptions {
  root: string
  files: string[]
  initializationOptions?: InitializeParams['initializationOptions']
}

export interface DetectorCommands {
  createServer: () => LanguageServerCommands
  languageId: (file: string) => string
  isTestFile: (file: string) => boolean
  shouldInspect: (file: string) => boolean
  reviewDeclaration: (file: string, position: Position) => DeclarationReview
  onProgress?: (inspectedFiles: number, symbols: number) => void
}

function selectedText(lines: string[], range: Range): string {
  const selected = lines.slice(range.start.line, range.end.line + 1)
  if (!selected.length) throw new Error('Language server returned a selection outside the document.')
  const end = selected.length - 1
  selected[end] = selected[end].slice(0, range.end.character)
  selected[0] = selected[0].slice(range.start.character)
  return selected.join('\n')
}

function collectCandidates(symbols: DocumentSymbol[], container: string[], lines: string[], result: CandidateCollection): void {
  for (const symbol of symbols) {
    collectCandidates(symbol.children ?? [], [...container, symbol.name], lines, result)
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

function makeFinding(root: string, uri: string, candidate: Candidate, references: Location[], isTestFile: (file: string) => boolean): LspFinding | undefined {
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

export async function inspectUnusedCode(options: DetectorOptions, commands: DetectorCommands): Promise<LspReport> {
  const root = path.resolve(options.root)
  const files = [...new Set(options.files.map((file) => path.resolve(root, file)))]
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
  const documents = new Map<string, string[]>()
  let server: LanguageServerCommands | undefined
  try {
    if (!files.length) throw new Error('No files provided for unused-code inspection.')
    server = commands.createServer()
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
      initializationOptions: options.initializationOptions,
    })
    report.server = initialized.serverInfo
    if (!initialized.capabilities.documentSymbolProvider || !initialized.capabilities.referencesProvider)
      throw new Error('Language server must support document symbols and references.')
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8')
      documents.set(file, text.split(/\r?\n/))
      await server.open({
        uri: pathToFileURL(file).href,
        languageId: commands.languageId(file),
        version: 1,
        text,
      })
      report.openedFiles += 1
    }
    for (const file of files) {
      if (commands.isTestFile(relativeFile(root, file)) || !commands.shouldInspect(file)) continue
      const uri = pathToFileURL(file).href
      const symbols = await server.symbols(uri)
      const declarations: DocumentSymbol[] = []
      for (const symbol of symbols ?? []) {
        if (!('selectionRange' in symbol)) throw new Error(`Language server returned flat symbols without name positions: ${file}`)
        declarations.push(symbol)
      }
      const lines = documents.get(file)
      if (!lines) throw new Error(`Missing opened document: ${file}`)
      const collected: CandidateCollection = { candidates: [], skippedSymbols: 0 }
      collectCandidates(declarations, [], lines, collected)
      report.skippedSymbols += collected.skippedSymbols
      for (const candidate of collected.candidates) {
        report.symbols += 1
        const review = commands.reviewDeclaration(file, candidate.symbol.selectionRange.start)
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
        let finding = makeFinding(root, uri, candidate, references, commands.isTestFile)
        for (const target of review.referenceTargets) {
          if (!finding) break
          report.referenceRequests += 1
          const related = await server.references(target.uri, target.range.start)
          references.push(...(related ?? []))
          finding = makeFinding(root, uri, candidate, references, commands.isTestFile)
        }
        if (finding) report.findings.push(finding)
      }
      report.inspectedFiles += 1
      commands.onProgress?.(report.inspectedFiles, report.symbols)
    }
  } catch (error) {
    report.errors.push(String(error))
  } finally {
    if (server) {
      try {
        await server.close()
      } catch (error) {
        report.errors.push(`Language server shutdown failed: ${String(error)}`)
      }
      report.errors.push(...server.errors())
    }
    report.complete = report.errors.length === 0
    report.findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)
  }
  return report
}
