import generate from '@babel/generator'
import { parse } from '@babel/parser'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { promisify } from 'node:util'
import { Linter } from 'eslint'
import { format as formatWithPrettier, getFileInfo, resolveConfig } from 'prettier'
import { typescriptSpacingConfig } from './typescript-spacing-config.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const execFileAsync = promisify(execFile)
const prettierIgnorePaths = ['.gitignore', '.prettierignore'].map((file) => path.join(root, file))
const prettierConfig = await resolveConfig(path.join(root, 'placeholder.ts'))
if (!prettierConfig) throw new Error('Prettier configuration is required')
const spacingLinter = new Linter()

function normalizePath(filePath) {
  return filePath.replaceAll(path.sep, '/')
}

async function collectTypeScriptFiles() {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--deduplicate', '-z', '--', '*.ts', '*.tsx', '*.mts', '*.cts'],
    { cwd: root, encoding: 'utf8' },
  )
  const files = []
  const relativePaths = stdout
    .split('\0')
    .filter((relativePath) => relativePath.length > 0)
    .sort((left, right) => left.localeCompare(right))
  for (const relativePath of relativePaths) {
    const filePath = path.join(root, relativePath)
    const fileInfo = await getFileInfo(filePath, { ignorePath: prettierIgnorePaths })
    if (!fileInfo.ignored) files.push(filePath)
  }
  return files
}

function removeSourceFormatting(value, visited = new WeakSet()) {
  if (value === undefined || value === null || typeof value !== 'object' || visited.has(value)) return
  visited.add(value)
  if (!Array.isArray(value)) {
    delete value.start
    delete value.end
    delete value.loc
    delete value.extra
  }
  for (const child of Object.values(value)) removeSourceFormatting(child, visited)
}

function addDeclarationSpacing(source, filePath) {
  const filename = normalizePath(path.relative(root, filePath))
  const result = spacingLinter.verifyAndFix(source, [typescriptSpacingConfig], { filename })
  if (result.messages.length > 0) {
    throw new Error(result.messages.map((message) => `${filename}:${message.line}:${message.column} ${message.message}`).join('\n'))
  }
  return result.output
}

async function formatTypeScript(source, filePath) {
  const relativePath = normalizePath(path.relative(root, filePath))
  const ast = parse(source, {
    sourceFilename: relativePath,
    sourceType: 'unambiguous',
    plugins: [['typescript', { dts: /\.d\.[cm]?ts$/.test(filePath) }], ...(filePath.endsWith('.tsx') ? ['jsx'] : [])],
  })
  removeSourceFormatting(ast)
  const result = generate(ast, {
    comments: true,
    compact: false,
    concise: false,
    retainFunctionParens: false,
    retainLines: false,
    jsescOption: { minimal: true, quotes: 'single' },
  })
  const formatted = await formatWithPrettier(result.code, { ...prettierConfig, filepath: filePath, parser: 'typescript' })
  return addDeclarationSpacing(formatted, filePath)
}

const write = process.argv.includes('--write')
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--write')
if (unknownArguments.length > 0) throw new Error(`Unknown arguments: ${unknownArguments.join(', ')}`)

let changed = 0
for (const filePath of await collectTypeScriptFiles()) {
  let source
  try {
    source = await readFile(filePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') continue
    throw error
  }
  const formatted = await formatTypeScript(source, filePath)
  if (source === formatted) continue
  changed += 1
  const relativePath = normalizePath(path.relative(root, filePath))
  if (write) await writeFile(filePath, formatted)
  else process.stderr.write(`${relativePath}\n`)
}

if (write) process.stdout.write(`Formatted ${changed} TypeScript files.\n`)
else if (changed > 0) {
  process.stderr.write(`${changed} TypeScript files are not canonically formatted.\n`)
  process.exitCode = 1
}
