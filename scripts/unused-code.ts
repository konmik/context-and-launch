import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { compareInspectionBaseline, isTestFile, readInspectionBaseline, readInspectionFindings } from './unused-code-report.js'
import type { InspectionFinding } from './unused-code-report.js'

interface IdeLaunch {
  os: string
  arch: string
  javaExecutablePath: string
  vmOptionsFilePath: string
  bootClassPathJarNames: string[]
  additionalJvmArguments: string[]
}

interface IdeProduct {
  version: string
  buildNumber: string
  dataDirectoryName: string
  launch: IdeLaunch[]
}

interface InspectionRun {
  findings: InspectionFinding[]
  errors: string[]
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name} before running the unused-code check.`)
  return value
}

function findIdeInstallation(): string {
  const configured = process.env.IDE_HOME
  const installation = configured ?? path.join(requiredEnvironment('ProgramFiles'), 'JetBrains', 'WebStorm')
  if (!fs.existsSync(path.join(installation, 'product-info.json'))) {
    throw new Error(`IDE installation not found at ${installation}. Set IDE_HOME to your activated WebStorm installation directory.`)
  }
  console.log(`${configured ? 'Configured' : 'Detected'} IDE installation: ${installation}`)
  return installation
}

function copySnapshotFiles(root: string, project: string, files: string[]) {
  for (const file of files) {
    const source = path.join(root, file)
    if (!fs.existsSync(source)) continue
    const destination = path.join(project, file)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL)
  }
}

function inspect(installation: string, launch: IdeLaunch, project: string, profile: string, directory: string, runtime: string): InspectionRun {
  fs.mkdirSync(directory)
  const output = path.join(directory, 'output.log')
  const descriptor = fs.openSync(output, 'wx')
  const vmOptions = fs.readFileSync(path.join(installation, launch.vmOptionsFilePath), 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#'))
  const args = [
    ...vmOptions,
    ...launch.additionalJvmArguments.map((argument) => argument.replaceAll('%IDE_HOME%', installation).replaceAll('$IDE_HOME', installation)),
    `-Didea.config.path=${path.join(runtime, 'config')}`,
    `-Didea.system.path=${path.join(runtime, 'system')}`,
    `-Didea.log.path=${path.join(directory, 'logs')}`,
    `-Didea.plugins.path=${path.join(runtime, 'plugins')}`,
    '-Didea.initially.ask.config=false',
    '-cp',
    launch.bootClassPathJarNames.map((name) => path.join(installation, 'lib', name)).join(path.delimiter),
    'com.intellij.idea.Main',
    'inspect', project, profile, path.join(directory, 'results'), '-v1',
  ]
  const errors: string[] = []
  try {
    execFileSync(path.join(installation, launch.javaExecutablePath), args, { cwd: project, stdio: ['ignore', descriptor, descriptor] })
  } catch (error) {
    errors.push(`Inspector process failed: ${String(error)}`)
  } finally {
    fs.closeSync(descriptor)
  }
  const outputText = fs.readFileSync(output, 'utf8')
  if (!outputText.includes('Done.')) errors.push(`Inspector did not report completion: ${output}`)
  const logDirectory = path.join(directory, 'logs')
  const logFiles = fs.existsSync(logDirectory) ? fs.readdirSync(logDirectory).filter((file) => file.endsWith('.log')).map((file) => path.join(logDirectory, file)) : []
  for (const log of [output, ...logFiles]) {
    const failures = fs.readFileSync(log, 'utf8').split(/\r?\n/).filter((line) => /\b(?:ERROR|SEVERE)\s+-|Exception in thread|(?:^|\s)(?:java\.lang\.)?(?:OutOfMemoryError|StackOverflowError)\b/.test(line))
    if (failures.length) errors.push(`Inspector errors in ${log}:\n${[...new Set(failures)].slice(0, 5).join('\n')}`)
  }
  let findings: InspectionFinding[] = []
  try {
    findings = readInspectionFindings(path.join(directory, 'results'), project)
  } catch (error) {
    errors.push(`Cannot validate inspection results: ${String(error)}`)
  }
  return { findings, errors }
}

function main() {
  if (process.argv.length !== 2) throw new Error('Usage: pnpm run check:unused. Set IDE_HOME or IDE_CONFIG_DIR only for a nonstandard installation.')
  if (process.platform !== 'win32') throw new Error('The isolated IDE inspection runner currently supports Windows only.')
  const installation = findIdeInstallation()
  const product: IdeProduct = JSON.parse(fs.readFileSync(path.join(installation, 'product-info.json'), 'utf8'))
  const launch = product.launch.find((item) => item.os === 'Windows' && item.arch === 'amd64')
  if (!launch) throw new Error(`No Windows amd64 launcher in ${installation}/product-info.json`)
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const profile = path.join(root, 'tools/inspections/unused-code.xml')
  const baseline = readInspectionBaseline(path.join(root, 'tools/inspections/unused-code-baseline.json'))
  const sourceConfig = process.env.IDE_CONFIG_DIR ?? path.join(requiredEnvironment('APPDATA'), 'JetBrains', product.dataDirectoryName)
  const license = path.join(sourceConfig, 'webstorm.key')
  if (!fs.existsSync(license)) throw new Error(`IDE license file not found: ${license}. Activate WebStorm and set IDE_CONFIG_DIR to its configuration directory.`)
  const dependencies = path.join(root, 'node_modules')
  if (!fs.existsSync(dependencies)) throw new Error('Install project dependencies before running the unused-code check.')
  const runtimeParent = path.join(requiredEnvironment('LOCALAPPDATA'), 'Temp', 'opencode')
  fs.mkdirSync(runtimeParent, { recursive: true })
  const runtime = fs.mkdtempSync(path.join(runtimeParent, 'unused-code-'))
  const project = path.join(runtime, 'project')
  fs.mkdirSync(project)
  fs.mkdirSync(path.join(runtime, 'config'))
  fs.copyFileSync(license, path.join(runtime, 'config/webstorm.key'), fs.constants.COPYFILE_EXCL)
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter((file) => file && !/(^|\/)(\.git|\.idea|node_modules|dist|dist-electron|temp)\//.test(file))
  const productionFiles = files.filter((file) => !isTestFile(file))
  if (!productionFiles.some((file) => file.startsWith('src/') && /\.tsx?$/.test(file))) throw new Error('No production TypeScript files found in the source snapshot.')
  copySnapshotFiles(root, project, productionFiles)
  fs.symlinkSync(dependencies, path.join(project, 'node_modules'), 'junction')
  console.log(`IDE ${product.version} (${product.buildNumber}); reports: ${runtime}`)
  console.log('Inspecting production snapshot without test references...')
  const production = inspect(installation, launch, project, profile, path.join(runtime, 'production'), runtime)
  copySnapshotFiles(root, project, files.filter(isTestFile))
  console.log('Inspecting snapshot with test references...')
  const all = inspect(installation, launch, project, profile, path.join(runtime, 'all'), runtime)
  const allLocations = new Set(all.findings.map((finding) => `${finding.id}:${finding.line}`))
  const errors = [...production.errors, ...all.errors]
  const comparison = compareInspectionBaseline(production.findings, baseline)
  const report = {
    complete: errors.length === 0,
    ideVersion: product.version,
    ideBuild: product.buildNumber,
    errors,
    findings: production.findings.map((finding) => ({
      ...finding,
      testOnlyCandidate: !allLocations.has(`${finding.id}:${finding.line}`),
    })),
    ...comparison,
  }
  fs.writeFileSync(path.join(runtime, 'report.json'), `${JSON.stringify(report, undefined, 2)}\n`, { flag: 'wx' })
  for (const finding of comparison.newFindings.slice(0, 20)) console.log(`${finding.file}:${finding.line} [${finding.inspection}] ${finding.description} (${finding.id})`)
  if (comparison.newFindings.length > 20) console.log('Showing the first 20 new findings; the report contains every finding.')
  for (const entry of comparison.staleEntries) console.error(`Stale or reduced-count baseline entry: ${entry.file} ${entry.symbol} (${entry.id})`)
  console.log(`${production.findings.length} findings; ${comparison.newFindings.length} new; ${comparison.suppressedCount} baselined; ${comparison.staleEntries.length} stale baseline entries.`)
  console.log(`Report: ${path.join(runtime, 'report.json')}`)
  if (errors.length) {
    console.error(errors.join('\n'))
    console.error('Inspection incomplete. Do not use this run to add baseline entries or declare the check passed.')
    console.error('Repair the reported IDE/setup failure, then re-run pnpm run check:unused. Internal IDE errors may require a newer WebStorm installation (IDE_HOME).')
    process.exitCode = 2
  } else if (comparison.newFindings.length || comparison.staleEntries.length) {
    console.error('Review report.json and fix confirmed unused code. testOnlyCandidate means the finding disappears with tests; verify its callers before removing it.')
    console.error('For individually reviewed false positives or required external contracts, edit tools/inspections/unused-code-baseline.json: copy id, file and symbol from the report, set count to the matching occurrence count, and give a specific reason naming the consumer or analyzer limitation.')
    console.error('Remove or reduce stale baseline entries. Re-run pnpm run check:unused after changes; only exit 0 is a clean audit.')
    process.exitCode = 1
  }
}

try {
  main()
} catch (error) {
  console.error(String(error))
  process.exitCode = 2
}
