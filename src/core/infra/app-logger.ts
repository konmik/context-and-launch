import fs from 'fs'
import os from 'os'
import path from 'path'

const MAX_FILE_BYTES = 1 * 1024 * 1024

const MAX_FILES = 10

interface RollingLogger {
  log(category: string, message: string): void
  readAll(): string
  clear(): void
}

function createRollingLogger(logDir: string): RollingLogger {
  let currentPath: string
  let currentSize: number
  fs.mkdirSync(logDir, {
    recursive: true,
  })
  const files = listFiles()
  const last = files.at(-1)
  if (last && fileSize(path.join(logDir, last)) < MAX_FILE_BYTES) {
    currentPath = path.join(logDir, last)
    currentSize = fileSize(currentPath)
  } else {
    currentPath = newFilePath()
    currentSize = 0
  }

  function log(category: string, message: string): void {
    const line = `${new Date().toISOString()} [${category}] ${message}\n`
    const bytes = Buffer.byteLength(line)
    if (currentSize + bytes > MAX_FILE_BYTES) {
      rotate()
    }
    fs.appendFileSync(currentPath, line)
    currentSize += bytes
  }

  function readAll(): string {
    return listFiles()
      .map((f) => fs.readFileSync(path.join(logDir, f), 'utf-8'))
      .join('')
  }

  function clear(): void {
    for (const f of listFiles()) {
      fs.unlinkSync(path.join(logDir, f))
    }
    currentPath = newFilePath()
    currentSize = 0
  }

  function rotate(): void {
    const files = listFiles()
    while (files.length >= MAX_FILES) {
      fs.unlinkSync(path.join(logDir, files.shift()!))
    }
    currentPath = newFilePath()
    currentSize = 0
  }

  function listFiles(): string[] {
    try {
      return fs
        .readdirSync(logDir)
        .filter((f) => f.startsWith('app-') && f.endsWith('.log'))
        .sort()
    } catch {
      return []
    }
  }

  function newFilePath(): string {
    return path.join(logDir, `app-${Date.now()}.log`)
  }

  function fileSize(filePath: string): number {
    try {
      return fs.statSync(filePath).size
    } catch {
      return 0
    }
  }

  return {
    log,
    readAll,
    clear,
  }
}

let instance: RollingLogger | undefined

function getLogger(): RollingLogger {
  if (!instance) {
    const baseDir = process.env.CONTEXT_LAUNCH_DATA_DIR || path.join(os.homedir(), '.context-launch')
    instance = createRollingLogger(path.join(baseDir, 'logs'))
  }
  return instance
}

export type AppLogContext = Readonly<Record<string, string | number | boolean | undefined>>

export function appLog(category: string, message: string, context?: AppLogContext): void {
  const suffix = context ? ` ${JSON.stringify(Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined)))}` : ''
  getLogger().log(category, `${message}${suffix}`)
}

export function readAppLogs(): string {
  return getLogger().readAll()
}

export function clearAppLogs(): void {
  getLogger().clear()
}
