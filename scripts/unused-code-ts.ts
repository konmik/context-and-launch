import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { isTestFile } from './unused-code-report.js'

interface ReferenceLocation {
  file: string
  line: number
  column: number
}

interface UnusedFinding extends ReferenceLocation {
  id: string
  kind: 'unused-local' | 'unused-export' | 'test-only-export'
  symbol: string
  description: string
  references: ReferenceLocation[]
}

interface InspectionReport {
  complete: boolean
  typescriptVersion: string
  files: number
  exports: number
  errors: string[]
  findings: UnusedFinding[]
}

interface ExportCandidate {
  name: ts.DeclarationName
  referenceNames: ts.DeclarationName[]
  declarations: ts.Declaration[]
}

function relativeFile(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/')
}

function location(root: string, source: ts.SourceFile, start: number): ReferenceLocation {
  const position = source.getLineAndCharacterOfPosition(start)
  return {
    file: relativeFile(root, source.fileName),
    line: position.line + 1,
    column: position.character + 1,
  }
}

function diagnosticText(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
}

function createFinding(
  root: string,
  source: ts.SourceFile,
  start: number,
  symbol: string,
  kind: UnusedFinding['kind'],
  description: string,
  references: ReferenceLocation[],
): UnusedFinding {
  const position = location(root, source, start)
  const id = createHash('sha256')
    .update(JSON.stringify([position.file, kind, symbol, description]))
    .digest('hex')
  return { ...position, id, kind, symbol, description, references }
}

function exportCandidates(source: ts.SourceFile, checker: ts.TypeChecker, program: ts.Program): ExportCandidate[] {
  const moduleSymbol = checker.getSymbolAtLocation(source)
  if (!moduleSymbol) return []
  const declarationPath = source.fileName.replace(/\.(mjs|cjs|js)$/, (extension) =>
    extension === '.mjs' ? '.d.mts' : extension === '.cjs' ? '.d.cts' : '.d.ts',
  )
  const declarationSource = declarationPath === source.fileName ? undefined : program.getSourceFile(declarationPath)
  const declarationModule = declarationSource && checker.getSymbolAtLocation(declarationSource)
  const declarationExports = new Map(declarationModule
    ? checker.getExportsOfModule(declarationModule).map((symbol) => [symbol.name, symbol])
    : [])
  const candidates: ExportCandidate[] = []
  const seen = new Set<ts.Symbol>()
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    if (seen.has(symbol)) continue
    seen.add(symbol)
    const declarations = symbol.getDeclarations()
    if (!declarations) continue
    const declaration = declarations.find((item) => item.getSourceFile() === source)
    if (!declaration) continue
    const name = ts.getNameOfDeclaration(declaration)
    if (!name) continue
    const companion = declarationExports.get(exported.name)
    const companionDeclarations = companion?.getDeclarations() ?? []
    const referenceNames = [name]
    for (const item of companionDeclarations) {
      const companionName = ts.getNameOfDeclaration(item)
      if (companionName) referenceNames.push(companionName)
    }
    candidates.push({ name, referenceNames, declarations: [...declarations, ...companionDeclarations] })
  }
  return candidates
}

function dynamicModuleReferences(root: string, program: ts.Program, checker: ts.TypeChecker): Map<string, ReferenceLocation[]> {
  const references = new Map<string, ReferenceLocation[]>()
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || program.isSourceFileFromExternalLibrary(source)) continue
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = node.arguments[0]
        if (argument && ts.isStringLiteralLike(argument)) {
          const symbol = checker.getSymbolAtLocation(argument)
          for (const declaration of symbol?.getDeclarations() ?? []) {
            const file = declaration.getSourceFile().fileName
            const consumers = references.get(file) ?? []
            consumers.push(location(root, source, argument.getStart(source)))
            references.set(file, consumers)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return references
}

function candidateReferences(
  root: string,
  candidate: ExportCandidate,
  service: ts.LanguageService,
  program: ts.Program,
  dynamicReferences: Map<string, ReferenceLocation[]>,
): ReferenceLocation[] {
  const groups = candidate.referenceNames.flatMap((name) =>
    service.findReferences(name.getSourceFile().fileName, name.getStart()) ?? [],
  )
  const references = new Map<string, ReferenceLocation>()
  for (const name of candidate.referenceNames) {
    for (const position of dynamicReferences.get(name.getSourceFile().fileName) ?? []) {
      references.set(`${position.file}:${position.line}:${position.column}`, position)
    }
  }
  for (const group of groups) {
    for (const reference of group.references) {
      if (reference.isDefinition) continue
      const referencedSource = program.getSourceFile(reference.fileName)
      if (!referencedSource) throw new Error(`Reference source is missing: ${reference.fileName}`)
      if (candidate.declarations.some((declaration) =>
        declaration.getSourceFile() === referencedSource &&
        reference.textSpan.start >= declaration.getStart(referencedSource) &&
        reference.textSpan.start < declaration.getEnd(),
      )) continue
      const position = location(root, referencedSource, reference.textSpan.start)
      references.set(`${position.file}:${position.line}:${position.column}`, position)
    }
  }
  return [...references.values()]
}

function inspect(root: string, files: string[], options: ts.CompilerOptions): InspectionReport {
  const snapshots = new Map<string, ts.IScriptSnapshot>()
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => files,
    getScriptVersion: () => '0',
    getScriptSnapshot: (file) => {
      const existing = snapshots.get(file)
      if (existing) return existing
      const text = ts.sys.readFile(file)
      if (text === undefined) return undefined
      const snapshot = ts.ScriptSnapshot.fromString(text)
      snapshots.set(file, snapshot)
      return snapshot
    },
    getCurrentDirectory: () => root,
    getCompilationSettings: () => options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  }
  const service = ts.createLanguageService(host)
  const report: InspectionReport = {
    complete: false,
    typescriptVersion: ts.version,
    files: 0,
    exports: 0,
    errors: [],
    findings: [],
  }
  try {
    const program = service.getProgram()
    if (!program) throw new Error('TypeScript did not create a language-service program.')
    const checker = program.getTypeChecker()
    const dynamicReferences = dynamicModuleReferences(root, program, checker)
    for (const file of files) {
      const source = program.getSourceFile(file)
      if (!source) throw new Error(`TypeScript did not load ${file}`)
      const syntaxErrors = service.getSyntacticDiagnostics(file)
      for (const error of syntaxErrors) report.errors.push(`${relativeFile(root, file)}: ${diagnosticText(error)}`)
      if (source.isDeclarationFile || isTestFile(relativeFile(root, file)) || syntaxErrors.length) continue
      report.files += 1
      for (const diagnostic of service.getSuggestionDiagnostics(file)) {
        if (!diagnostic.reportsUnnecessary || diagnostic.start === undefined || diagnostic.length === undefined) continue
        if (![6133, 6192, 6196, 6198, 6199].includes(diagnostic.code)) continue
        report.findings.push(createFinding(
          root, source, diagnostic.start,
          source.text.slice(diagnostic.start, diagnostic.start + diagnostic.length),
          'unused-local', diagnosticText(diagnostic), [],
        ))
      }
      for (const candidate of exportCandidates(source, checker, program)) {
        report.exports += 1
        const references = candidateReferences(root, candidate, service, program, dynamicReferences)
        if (references.some((reference) => !isTestFile(reference.file))) continue
        const kind = references.length ? 'test-only-export' : 'unused-export'
        report.findings.push(createFinding(
          root, source, candidate.name.getStart(source), candidate.name.getText(source), kind,
          kind === 'test-only-export' ? 'Export is referenced only by tests.' : 'Export has no references outside its declaration.',
          references,
        ))
      }
    }
    report.complete = report.errors.length === 0
    report.findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)
    return report
  } finally {
    service.dispose()
  }
}

function main() {
  if (process.argv.length !== 2) throw new Error('Usage: pnpm run check:unused:ts')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const configPath = path.join(root, 'tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) throw new Error(diagnosticText(config.error))
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  if (parsed.errors.length) throw new Error(parsed.errors.map(diagnosticText).join('\n'))
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((file) => /\.[cm]?[jt]sx?$/.test(file) && fs.existsSync(path.join(root, file)))
    .map((file) => path.join(root, file))
  if (!files.length) throw new Error('No tracked or unignored TypeScript/JavaScript files found.')
  console.log(`TypeScript ${ts.version}: inspecting ${files.length} files with the language service...`)
  const report = inspect(root, files, {
    ...parsed.options,
    allowJs: true,
    checkJs: false,
    noEmit: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
  })
  const parent = process.platform === 'win32'
    ? path.join(requiredEnvironment('LOCALAPPDATA'), 'Temp', 'opencode')
    : os.tmpdir()
  fs.mkdirSync(parent, { recursive: true })
  const directory = fs.mkdtempSync(path.join(parent, 'unused-code-ts-'))
  const output = path.join(directory, 'report.json')
  fs.writeFileSync(output, `${JSON.stringify(report, undefined, 2)}\n`, { flag: 'wx' })
  for (const finding of report.findings.slice(0, 30))
    console.log(`${finding.file}:${finding.line}:${finding.column} [${finding.kind}] ${finding.symbol}: ${finding.description}`)
  console.log(`${report.files} implementation files; ${report.exports} exports; ${report.findings.length} findings.`)
  console.log('Experimental reference audit: framework entry points and external consumers require review; member reachability is not analyzed.')
  console.log('Dynamic imports conservatively count as consumers of every export in the imported module.')
  console.log(`Report: ${output}`)
  if (!report.complete) {
    console.error(report.errors.join('\n'))
    process.exitCode = 2
  } else if (report.findings.length) {
    process.exitCode = 1
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

try {
  main()
} catch (error) {
  console.error(String(error))
  process.exitCode = 2
}
