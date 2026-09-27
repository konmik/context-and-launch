import * as v from 'valibot'
import type { ConfigPaths } from '../config/config-paths.js'
import type { ConfigRepository } from '../config/config-repository.js'
import { COMMAND_TEMPLATE_DEFINITION_BY_KEY, COMMAND_TEMPLATE_DEFAULTS } from './command-template-definitions.js'
import type { CommandTemplateKey } from './command-template-definitions.js'
import { undeclaredPlaceholders } from './command-template-interpolation.js'
import type { CommandTemplateEntry, CommandTemplateOverrides } from './command-template-types.js'
import { createUpdateLock, type UpdateLock } from '~/util/update-lock.js'
import type { JsonValue } from '../shared/json.js'

function validateOverrides(value: JsonValue): CommandTemplateOverrides {
  if (Array.isArray(value)) throw new Error('Command Template overrides must be a JSON object.')
  const overrides = v.parse(v.record(v.string(), v.string()), value)
  for (const [key, script] of Object.entries(overrides)) {
    const definition = COMMAND_TEMPLATE_DEFINITION_BY_KEY.get(key)
    if (!definition) throw new Error(`Unknown Command Template key '${key}'.`)
    const undeclared = undeclaredPlaceholders(script, definition.scalarPlaceholders, definition.listPlaceholders)
    if (undeclared.length) {
      const list = (names: readonly string[]) => names.map((name) => `{{${name}}}`).join(', ') || 'none'
      const declared = [...definition.scalarPlaceholders, ...definition.listPlaceholders]
      throw new Error(
        `Command Template '${key}' has undeclared placeholders: ${list(undeclared)}. ` + `Available placeholders: ${list(declared)}.`,
      )
    }
  }
  return overrides
}

export interface CommandTemplateStore {
  read(owner?: string): CommandTemplateOverrides
  write(value: CommandTemplateOverrides, owner?: string): CommandTemplateOverrides
  release(owner: string): void
  get(key: CommandTemplateKey): CommandTemplateEntry
}

export function createCommandTemplateStore(
  paths: ConfigPaths,
  repository: ConfigRepository,
  lock: UpdateLock = createUpdateLock(),
): CommandTemplateStore {
  function read(owner?: string): CommandTemplateOverrides {
    return lock.read(() => validateOverrides(repository.readJson(paths.commandTemplateOverridesFile()) ?? {}), owner)
  }

  function write(value: CommandTemplateOverrides, owner?: string): CommandTemplateOverrides {
    return lock.write(() => {
      const overrides = validateOverrides(value) // SAFETY: validateOverrides rejects every key absent from the command catalog.
      for (const key of Object.keys(overrides) as CommandTemplateKey[]) {
        if (overrides[key] === COMMAND_TEMPLATE_DEFAULTS[key]) delete overrides[key]
      }
      repository.writeJson(paths.commandTemplateOverridesFile(), overrides)
      return overrides
    }, owner)
  }

  function release(owner: string): void {
    lock.release(owner)
  }

  function get(key: CommandTemplateKey): CommandTemplateEntry {
    const definition = COMMAND_TEMPLATE_DEFINITION_BY_KEY.get(key)
    if (!definition) throw new Error(`Unknown Command Template key '${key}'.`)
    const overrides = read()
    return {
      ...definition,
      key,
      script: overrides[key] ?? COMMAND_TEMPLATE_DEFAULTS[key],
      isOverridden: Object.hasOwn(overrides, key),
    }
  }

  return {
    read,
    write,
    release,
    get,
  }
}
