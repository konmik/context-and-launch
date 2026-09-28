import { commandTemplateStore } from '~/core/config/instances.js'
import { errorPayload } from '~/core/shared/errors.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { COMMAND_TEMPLATE_DEFINITIONS, type KeyedCommandTemplateDefinition } from '~/core/command-template/command-template-definitions.js'
import { currentCommandTemplatePlatform, type CommandTemplateOverrides } from '~/core/command-template/command-template-types.js'
import { failure, success, type Result } from '~/util/result.js'

export async function getCommandTemplateDefinitions(): Promise<KeyedCommandTemplateDefinition[]> {
  'use server'

  return COMMAND_TEMPLATE_DEFINITIONS.filter((entry) => entry.platforms.includes(currentCommandTemplatePlatform()))
}

export async function readCommandTemplates(owner?: string): Promise<Result<CommandTemplateOverrides, UserFacingError>> {
  'use server'

  try {
    return success(commandTemplateStore.read(owner))
  } catch (error) {
    return failure(errorPayload(error, 'Load command templates failed'))
  }
}

export async function saveCommandTemplates(json: string, owner: string): Promise<Result<CommandTemplateOverrides, UserFacingError>> {
  'use server'

  try {
    if (!owner)
      return failure({
        title: 'Save failed',
        description: 'Configuration update requires a client identity.',
      })
    return success(commandTemplateStore.write(JSON.parse(json), owner))
  } catch (error) {
    return failure(errorPayload(error, 'Save command templates failed'))
  }
}

export async function releaseCommandTemplates(owner: string): Promise<void> {
  'use server'

  commandTemplateStore.release(owner)
}
