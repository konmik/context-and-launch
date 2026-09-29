import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export function relativeFile(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/')
}

export function isTestFile(file: string): boolean {
  return /(^|\/)(tests|__tests__|__mocks__)\//.test(file) || /\.(test|spec|bench)\.[cm]?[jt]sx?$/.test(file)
}

export function sourceFiles(root: string): string[] {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => /\.[cm]?[jt]sx?$/.test(file) && fs.existsSync(path.join(root, file)))
    .map((file) => path.join(root, file))
  if (!files.length) throw new Error('No tracked or unignored TypeScript/JavaScript files found.')
  return files
}

export function inspectionOutputDirectory(prefix: string): string {
  let parent = os.tmpdir()
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA
    if (!local) throw new Error('Missing required environment variable: LOCALAPPDATA')
    parent = path.join(local, 'Temp', 'opencode')
  }
  fs.mkdirSync(parent, {
    recursive: true,
  })
  return fs.mkdtempSync(path.join(parent, prefix))
}
