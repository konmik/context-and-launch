import type { ConfigPaths } from './config-paths.js'
import { createConfigRepository, type ConfigRepository } from './config-repository.js'
import { decodeAppConfig, type AppConfigData } from './app-config-data.js'
import { createUpdateLock, type UpdateLock } from '~/util/update-lock.js'
import type { Updater } from '~/util/updater.js'

export interface AppConfigStore {
  read(owner?: string): AppConfigData
  update(transform: Updater<AppConfigData>, owner?: string): AppConfigData
  release(owner: string): void
  recordProjectFocus(projectSlug: string): Promise<AppConfigData>
}

export function createAppConfigStore(
  paths: ConfigPaths,
  repository: ConfigRepository = createConfigRepository(),
  lock: UpdateLock = createUpdateLock(),
): AppConfigStore {
  function read(owner?: string): AppConfigData {
    return lock.read(() => {
      const file = paths.projectRegistryFile()
      const raw = repository.readJson(file)
      if (raw === null) throw new Error(`config.json not found: ${file}`)
      const { config, legacy } = decodeAppConfig(raw)
      if (legacy) lock.write(() => repository.writeJson(file, config))
      return config
    }, owner)
  }

  function update(transform: Updater<AppConfigData>, owner?: string): AppConfigData {
    return lock.write(() => {
      const { config: next } = decodeAppConfig(transform(read()))
      repository.writeJson(paths.projectRegistryFile(), next)
      return next
    }, owner)
  }

  function release(owner: string): void {
    lock.release(owner)
  }

  function recordProjectFocus(projectSlug: string): Promise<AppConfigData> {
    return lock.writeWhenAvailable(() =>
      update((current) => ({
        ...current,
        lastUsedProjectSlug: current.projects.some((project) => project.projectSlug === projectSlug)
          ? projectSlug
          : current.lastUsedProjectSlug,
      })),
    )
  }

  return {
    read,
    update,
    release,
    recordProjectFocus,
  }
}
