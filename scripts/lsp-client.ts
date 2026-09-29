import { spawn } from 'node:child_process'
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'
import {
  createProtocolConnection,
  DidOpenTextDocumentNotification,
  DocumentSymbolRequest,
  ExitNotification,
  InitializeRequest,
  InitializedNotification,
  LogMessageNotification,
  MessageType,
  ReferencesRequest,
  ShutdownRequest,
} from 'vscode-languageserver-protocol/node'
import type {
  DocumentSymbol,
  InitializeParams,
  InitializeResult,
  Location,
  Position,
  SymbolInformation,
  TextDocumentItem,
} from 'vscode-languageserver-protocol/node'

interface ServerExit {
  code?: number
  signal?: string
}

export interface LanguageServerCommands {
  initialize: (params: InitializeParams) => Promise<InitializeResult>
  open: (document: TextDocumentItem) => Promise<void>
  symbols: (uri: string) => Promise<DocumentSymbol[] | SymbolInformation[] | null>
  references: (uri: string, position: Position) => Promise<Location[] | null>
  errors: () => string[]
  close: () => Promise<void>
}

export function createLanguageServer(command: string, args: string[], root: string): LanguageServerCommands {
  const child = spawn(command, args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  const errors: string[] = []
  const connection = createProtocolConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin), {
    error: (message) => errors.push(message),
    warn: (message) => console.error(`LSP warning: ${message}`),
    info: (message) => console.error(`LSP: ${message}`),
    log: (message) => console.error(`LSP: ${message}`),
  })
  let closing = false
  let initialized = false
  let exited = false
  const exit = new Promise<ServerExit>((resolve) => {
    child.once('error', (error) => {
      errors.push(`Cannot run language server: ${error.message}`)
      connection.dispose()
    })
    child.once('close', (code, signal) => {
      exited = true
      if (!closing) errors.push(`Language server exited unexpectedly: code=${code}, signal=${signal}`)
      connection.dispose()
      resolve({ code: code ?? undefined, signal: signal ?? undefined })
    })
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (text: string) => process.stderr.write(text))
  connection.onClose(() => {
    if (!closing) errors.push('Language server closed its protocol connection unexpectedly.')
    connection.dispose()
  })
  connection.onError(([error]) => errors.push(`LSP connection error: ${error.message}`))
  connection.onNotification(LogMessageNotification.type, (message) => {
    if (message.type === MessageType.Error) errors.push(message.message)
    if (message.type <= MessageType.Warning) console.error(`LSP: ${message.message}`)
  })
  connection.listen()
  return {
    initialize: async (params) => {
      const result = await connection.sendRequest(InitializeRequest.type, params)
      initialized = true
      await connection.sendNotification(InitializedNotification.type, {})
      return result
    },
    open: (textDocument) => connection.sendNotification(DidOpenTextDocumentNotification.type, { textDocument }),
    symbols: (uri) => connection.sendRequest(DocumentSymbolRequest.type, { textDocument: { uri } }),
    references: (uri, position) => connection.sendRequest(ReferencesRequest.type, {
      textDocument: { uri },
      position,
      context: { includeDeclaration: false },
    }),
    errors: () => [...errors],
    close: async () => {
      closing = true
      try {
        if (!exited && initialized) {
          await connection.sendRequest(ShutdownRequest.type)
          await connection.sendNotification(ExitNotification.type)
        } else if (!exited) {
          child.kill()
        }
      } catch (error) {
        errors.push(`Language server shutdown failed: ${String(error)}`)
        if (!exited) child.kill()
      } finally {
        child.stdin.end()
        const result = await exit
        connection.dispose()
        if (result.code !== 0) errors.push(`Language server stopped with code=${result.code}, signal=${result.signal}`)
      }
    },
  }
}
