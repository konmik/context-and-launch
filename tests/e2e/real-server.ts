import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { removeTempDir } from '../test-temp.js'
import { pickPort } from './test-port.js'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const SERVER_ENTRY = path.join(PROJECT_ROOT, 'scripts', 'serve.mjs')

export type RealServerMode = 'production' | 'development'

export interface RealServer {
  process: ChildProcess
  baseUrl: string
}

async function startRealServerOnce(
  port: number,
  dataDir: string,
  extraEnv: NodeJS.ProcessEnv,
  mode: RealServerMode,
): Promise<RealServer | StartRealServerOnceResult> {
  const baseUrl = `http://127.0.0.1:${port}`
  const args =
    mode === 'development'
      ? [path.join(PROJECT_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort']
      : [SERVER_ENTRY]
  const readyMessage = mode === 'development' ? baseUrl : `Listening on ${baseUrl}`
  const proc = spawn(process.execPath, args, {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      CONTEXT_LAUNCH_DATA_DIR: dataDir,
      CONTEXT_LAUNCH_SERVER_PROCESS_FILE: path.join(dataDir, 'server-process'),
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  proc.stderr?.on('data', (b: Buffer) => {
    stderr += b.toString()
  })
  return new Promise((resolve, reject) => {
    let stdout = ''
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onClose = (code: number | null) => {
      cleanup()
      if (stderr.includes('EADDRINUSE'))
        resolve({
          addrInUse: true,
          stderr,
        })
      else reject(new Error(`Real server exited early (code ${code}):\n${stderr}`))
    }
    const onData = (chunk: Buffer) => {
      stdout += chunk.toString()
      if (!stripVTControlCharacters(stdout).includes(readyMessage)) return
      cleanup()
      resolve({
        process: proc,
        baseUrl,
      })
    }
    const cleanup = () => {
      proc.off('error', onError)
      proc.off('close', onClose)
      proc.stdout.off('data', onData)
    }
    proc.once('error', onError)
    proc.once('close', onClose)
    proc.stdout.on('data', onData)
  })
}

export async function startRealServer(
  port: number,
  dataDir: string,
  extraEnv: NodeJS.ProcessEnv = {},
  mode: RealServerMode = 'production',
): Promise<RealServer> {
  const maxAttempts = 5
  let currentPort = port
  let lastStderr = ''
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await startRealServerOnce(currentPort, dataDir, extraEnv, mode)
    if (!('addrInUse' in res)) return res
    lastStderr = res.stderr
    currentPort = pickPort()
  }
  throw new Error(`Real server could not bind a port after ${maxAttempts} attempts. Last stderr:\n${lastStderr}`)
}

export async function rmTemp(dir: string, label: string): Promise<void> {
  try {
    await removeTempDir(dir)
  } catch (err) {
    console.warn(`temp cleanup failed for ${label}:`, err)
  }
}

export function stopRealServer(server: RealServer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server.process.exitCode !== null || server.process.signalCode !== null) {
      resolve()
      return
    }
    server.process.once('error', reject)
    server.process.once('close', () => {
      server.process.off('error', reject)
      resolve()
    })
    server.process.kill()
  })
}

export interface StartRealServerOnceResult {
  addrInUse: true
  stderr: string
}
