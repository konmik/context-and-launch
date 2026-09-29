import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export function relativeFile(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/')
}

export function isTestFile(file: string): boolean {
  return /(^|\/)(tests|__tests__|__mocks__)\//.test(file) || /\.(test|spec|bench)\.[cm]?[jt]sx?$/.test(file)
}

export function findGitSourceFiles(root: string): string[] {
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
