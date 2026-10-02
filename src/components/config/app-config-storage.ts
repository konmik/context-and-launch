import { createContext } from 'solid-js'
import type { AppConfigData } from '~/core/config/app-config-data.js'
import { readAppConfig, saveAppConfig, releaseAppConfig } from './app-config-api.js'
import type { StoredSignal } from '~/util/stored-signal.js'
import { createStoredConfig } from '~/util/stored-config.js'
import { revalidate, useAction } from '@solidjs/router'

export const AppConfigContext = createContext<StoredSignal<AppConfigData>>()

export function createAppConfigStorage(): StoredSignal<AppConfigData> {
  const config = createStoredConfig(readAppConfig, useAction(saveAppConfig), releaseAppConfig)
  return {
    get: config.get,
    update: config.update,
    refresh: async () => {
      await revalidate(readAppConfig.key)
      return config.refresh()
    },
  }
}
