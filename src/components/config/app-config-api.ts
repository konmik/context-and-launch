import { appConfigStore } from '~/core/config/instances.js'
import type { AppConfigData } from '~/core/config/app-config-data.js'
import { failure, success, type Result } from '~/util/result.js'
import { errorMessage } from '~/core/shared/errors.js'

export async function readAppConfig(owner?: string): Promise<Result<AppConfigData, string>> {
  'use server'

  try {
    return success(appConfigStore.read(owner))
  } catch (error) {
    return failure(errorMessage(error))
  }
}

export async function saveAppConfig(configJson: string, owner: string): Promise<Result<AppConfigData, string>> {
  'use server'

  try {
    return owner
      ? success(appConfigStore.update(() => JSON.parse(configJson), owner))
      : failure('Configuration update requires a client identity.')
  } catch (error) {
    return failure(errorMessage(error))
  }
}

export async function releaseAppConfig(owner: string): Promise<void> {
  'use server'

  appConfigStore.release(owner)
}

export async function recordAppProjectFocus(projectSlug: string): Promise<Result<AppConfigData, string>> {
  'use server'

  try {
    return success(await appConfigStore.recordProjectFocus(projectSlug))
  } catch (error) {
    return failure(errorMessage(error))
  }
}
