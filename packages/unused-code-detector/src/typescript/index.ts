import { fileURLToPath } from 'node:url'
import { createLanguageServer } from '../lsp-client.js'
import type { LanguageServerCommands } from '../lsp-client.js'

export { createTypeScriptExclusions } from './exclusions.js'
export type { ExternalConfigurationContract, TypeScriptExclusionCommands, TypeScriptExclusionOptions } from './exclusions.js'
export { inspectTypeScriptUnusedCode } from './inspector.js'
export type { InspectionReport, UnusedFinding } from './inspector.js'

export interface TypeScriptInitializationOptions {
  hostInfo: string
  tsserver: {
    path: string
  }
  disableAutomaticTypingAcquisition: boolean
}

export function createTypeScriptInitializationOptions(): TypeScriptInitializationOptions {
  return {
    hostInfo: 'unused-code-checker',
    tsserver: {
      path: fileURLToPath(import.meta.resolve('typescript/lib/tsserver.js')),
    },
    disableAutomaticTypingAcquisition: true,
  }
}

export function createTypeScriptLanguageServer(root: string): LanguageServerCommands {
  return createLanguageServer(
    process.execPath,
    [fileURLToPath(import.meta.resolve('typescript-language-server/lib/cli.mjs')), '--stdio'],
    root,
  )
}

export function getTypeScriptLanguageId(file: string): string {
  if (file.endsWith('.tsx')) return 'typescriptreact'
  if (file.endsWith('.jsx')) return 'javascriptreact'
  return /\.[cm]?ts$/.test(file) ? 'typescript' : 'javascript'
}
