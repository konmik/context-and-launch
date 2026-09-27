import type { CommandTemplateEntry } from './command-template-types.js'
import { appLog, type AppLogContext } from '../infra/app-logger.js'
import { isProcessError } from '../shared/errors.js'
import { buildDirectInvocationArgv } from './command-template-direct-invocation.js'
import type { CommandTemplateKey } from './command-template-definitions.js'
import { interpolateCommandTemplate } from './command-template-interpolation.js'
import type { CommandTemplateStore } from './command-template-store.js'
import {
  currentCommandTemplatePlatform,
  type CommandTemplateExecutor,
  type CommandTemplateListValues,
  type CommandTemplateMode,
  type CommandTemplatePlatform,
  type CommandTemplateValues,
  type PlatformShellRunner,
  type ShellExecutionRequest,
} from './command-template-types.js'

export type CommandTemplateLog = (category: string, message: string, context?: AppLogContext) => void

/**
 * A trusted script is a user-authored Profile or Shortcut body, so its log
 * identity is a pair, not two optional fields that any caller could mix. Making
 * it a union means the runner identity and the selected name cannot disagree.
 */
export type TrustedScriptSource =
  | {
      kind: 'profile'
      profileName: string
    }
  | {
      kind: 'shortcut'
      shortcutName: string
    }

const TRUSTED_SCRIPT_IDENTITY = {
  profile: 'agent-launch.profile',
  shortcut: 'agent-launch.shortcut',
} as const

export interface TrustedScriptOptions {
  source: TrustedScriptSource
  script: string
  values: CommandTemplateValues
  listValues?: CommandTemplateListValues
  knownScalarPlaceholders: readonly string[]
  knownListPlaceholders?: readonly string[]
  cwd: string
  mode?: CommandTemplateMode
  timeoutMs?: number
}

const FAILURE_LOG_MESSAGES = {
  exited: 'non-zero failure',
  'command-not-found': 'command not found',
  'interpreter-failure': 'interpreter failure',
  timeout: 'timeout',
  'spawn-error': 'spawn error',
}

function failureLogMessage(cause: unknown): string {
  return isProcessError(cause) ? FAILURE_LOG_MESSAGES[cause.kind] : 'spawn error'
}

function trustedScriptContext(source: TrustedScriptSource): AppLogContext {
  return source.kind === 'profile'
    ? {
        commandTemplateKey: TRUSTED_SCRIPT_IDENTITY.profile,
        profileName: source.profileName,
      }
    : {
        commandTemplateKey: TRUSTED_SCRIPT_IDENTITY.shortcut,
        shortcutName: source.shortcutName,
      }
}

export interface CommandTemplateService extends CommandTemplateExecutor {
  get(key: CommandTemplateKey): CommandTemplateEntry
  executeTrustedScript(options: TrustedScriptOptions): Promise<string>
}

export function createCommandTemplateService(
  store: CommandTemplateStore,
  runner: PlatformShellRunner,
  platform: CommandTemplatePlatform = currentCommandTemplatePlatform(),
  log: CommandTemplateLog = appLog,
): CommandTemplateService {
  function get(key: CommandTemplateKey): CommandTemplateEntry {
    const entry = store.get(key)
    if (!entry.platforms.includes(platform)) {
      throw new Error(`Command Template '${key}' is not available on ${platform}.`)
    }
    return entry
  }

  function render(key: CommandTemplateKey, values: CommandTemplateValues = {}, listValues: CommandTemplateListValues = {}): string {
    const entry = get(key)
    return interpolateCommandTemplate(entry.script, values, listValues, entry.scalarPlaceholders, entry.listPlaceholders, platform)
  }

  async function execute(
    key: CommandTemplateKey,
    cwd: string,
    values: CommandTemplateValues = {},
    listValues: CommandTemplateListValues = {},
  ): Promise<string> {
    return executeRequest(buildExecutionRequest(key, cwd, values, listValues))
  }

  function executeSync(
    key: CommandTemplateKey,
    cwd: string,
    values: CommandTemplateValues = {},
    listValues: CommandTemplateListValues = {},
  ): string {
    const request = buildExecutionRequest(key, cwd, values, listValues)
    log('command-template', 'start', {
      commandTemplateKey: key,
    })
    try {
      const stdout = runner.executeSync(request)
      log('command-template', 'success', {
        commandTemplateKey: key,
      })
      return stdout
    } catch (error) {
      logFailure(key, error)
      throw error
    }
  }

  async function executeTrustedScript(options: TrustedScriptOptions): Promise<string> {
    const context = trustedScriptContext(options.source)
    const renderedScript = interpolateCommandTemplate(
      options.script,
      options.values,
      options.listValues ?? {},
      options.knownScalarPlaceholders,
      options.knownListPlaceholders ?? [],
      platform,
    )
    const request: ShellExecutionRequest = {
      key: TRUSTED_SCRIPT_IDENTITY[options.source.kind],
      platform: platform,
      script: renderedScript,
      argv: buildDirectInvocationArgv(
        options.script,
        options.values,
        options.listValues ?? {},
        options.knownScalarPlaceholders,
        options.knownListPlaceholders ?? [],
      ),
      cwd: options.cwd,
      environment: {},
      mode: options.mode ?? 'detached',
      timeoutMs: options.timeoutMs ?? 10000,
    }
    return executeRequest(request, context)
  }

  function buildExecutionRequest(
    key: CommandTemplateKey,
    cwd: string,
    values: CommandTemplateValues,
    listValues: CommandTemplateListValues,
  ): ShellExecutionRequest {
    const entry = get(key)
    return {
      key,
      platform: platform,
      script: interpolateCommandTemplate(entry.script, values, listValues, entry.scalarPlaceholders, entry.listPlaceholders, platform),
      argv: buildDirectInvocationArgv(entry.script, values, listValues, entry.scalarPlaceholders, entry.listPlaceholders),
      cwd,
      environment: entry.environment,
      mode: entry.mode,
      timeoutMs: entry.timeoutMs,
      detachDelayMs: entry.detachDelayMs,
    }
  }

  async function executeRequest(
    request: ShellExecutionRequest,
    context: AppLogContext = {
      commandTemplateKey: request.key,
    },
  ): Promise<string> {
    log('command-template', 'start', context)
    try {
      const stdout = await runner.execute(request)
      log('command-template', 'success', context)
      return stdout
    } catch (error) {
      logFailure(request.key, error, context)
      throw error
    }
  }

  function logFailure(key: string, cause: unknown, extra: AppLogContext = {}): void {
    log('command-template', failureLogMessage(cause), {
      ...extra,
      commandTemplateKey: key,
    })
  }

  return {
    get,
    render,
    execute,
    executeSync,
    executeTrustedScript,
  }
}
