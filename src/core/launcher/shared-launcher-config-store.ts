import type { ConfigPaths } from '../config/config-paths.js'
import { createConfigRepository, type ConfigRepository } from '../config/config-repository.js'
import { createUpdateLock, type UpdateLock } from '~/util/update-lock.js'
import { decodeLauncherConfig, type LauncherConfig } from './launcher-config-data.js'

export interface SharedLauncherConfigStore {
  read(owner?: string): LauncherConfig
  release(owner: string): void
  write(config: LauncherConfig, owner?: string): LauncherConfig
}

export function createSharedLauncherConfigStore(
  paths: ConfigPaths,
  repository: ConfigRepository = createConfigRepository(),
  lock: UpdateLock = createUpdateLock(),
): SharedLauncherConfigStore {
  function read(owner?: string): LauncherConfig {
    return lock.read(() => {
      const file = paths.appLauncherConfigFile()
      const raw = repository.readJson(file)
      if (raw === null) throw new Error(`App launcher config not found: ${file}`)
      return decodeLauncherConfig(raw)
    }, owner)
  }

  function release(owner: string): void {
    lock.release(owner)
  }

  function write(config: LauncherConfig, owner?: string): LauncherConfig {
    return lock.write(() => {
      const next = decodeLauncherConfig(config)
      repository.writeJson(paths.appLauncherConfigFile(), next)
      return next
    }, owner)
  }

  return {
    read,
    release,
    write,
  }
}
