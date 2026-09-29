import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function inspectionOutputDirectory(prefix: string): string {
  let parent = os.tmpdir()
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA
    if (!local) throw new Error('Missing required environment variable: LOCALAPPDATA')
    parent = path.join(local, 'Temp', 'opencode')
  }
  fs.mkdirSync(parent, { recursive: true })
  return fs.mkdtempSync(path.join(parent, prefix))
}
