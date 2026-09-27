import type { MergedLauncherConfig } from './launcher-config-data.js'
import path from 'path'
import type { ConfigPaths } from '../config/config-paths.js'
import { createConfigRepository, type ConfigRepository } from '../config/config-repository.js'
import { createSharedLauncherConfigStore, type SharedLauncherConfigStore } from './shared-launcher-config-store.js'
import { decodeLauncherConfig, mergeLauncherConfigs, type LauncherConfig } from './launcher-config-data.js'
import { createUpdateLock, type UpdateLock } from '~/util/update-lock.js'
import type { Updater } from '~/util/updater.js'

export * from './launcher-config-data.js'

export interface LauncherConfigManager {
  getAppConfigDir(): string
  getConfigDefaultsDir(): string
  getProjectDir(projectSlug: string): string
  getAgentWorktreeDir(projectSlug: string): string
  resolveWorktreeSettings(projectSlug: string): ResolveWorktreeSettingsResult
  loadAppConfig(): LauncherConfig
  saveAppConfig(config: LauncherConfig): void
  loadProjectConfig(projectSlug: string, owner?: string): LauncherConfig
  releaseProjectConfig(projectSlug: string, owner: string): void
  saveProjectConfig(projectSlug: string, config: LauncherConfig, owner?: string): LauncherConfig
  getMergedConfig(projectSlug: string): MergedLauncherConfig
  updateProjectConfig(projectSlug: string, transform: Updater<LauncherConfig>): LauncherConfig
}

export function createLauncherConfigManager(
  paths: ConfigPaths,
  configRepo: ConfigRepository = createConfigRepository(),
  sharedConfig: SharedLauncherConfigStore = createSharedLauncherConfigStore(paths, configRepo),
): LauncherConfigManager {
  const projectLocks = new Map<string, UpdateLock>()

  function projectLock(projectSlug: string): UpdateLock {
    let lock = projectLocks.get(projectSlug)
    if (!lock) projectLocks.set(projectSlug, (lock = createUpdateLock()))
    return lock
  }

  function getAppConfigDir(): string {
    return paths.appConfigDir()
  }

  function getConfigDefaultsDir(): string {
    return paths.configDefaults()
  }

  function getProjectDir(projectSlug: string): string {
    return paths.projectDir(projectSlug)
  }

  function getAgentWorktreeDir(projectSlug: string): string {
    return paths.agentWorktreeDir(projectSlug)
  }

  function resolveWorktreeSettings(projectSlug: string): ResolveWorktreeSettingsResult {
    const config = loadProjectConfig(projectSlug)
    return {
      worktreeRootPath: config.worktreeRootPath || paths.agentWorktreeDir(projectSlug),
      branchPrefix: config.branchPrefix,
    }
  }

  function loadAppConfig(): LauncherConfig {
    return sharedConfig.read()
  }

  function saveAppConfig(config: LauncherConfig): void {
    sharedConfig.write(config)
  }

  function loadProjectConfig(projectSlug: string, owner?: string): LauncherConfig {
    return projectLock(projectSlug).read(() => readProjectConfig(projectSlug), owner)
  }

  function releaseProjectConfig(projectSlug: string, owner: string): void {
    projectLock(projectSlug).release(owner)
  }

  function readProjectConfig(projectSlug: string): LauncherConfig {
    const raw = configRepo.readJson(paths.projectLauncherConfigFile(projectSlug))
    if (raw !== null) return decodeLauncherConfig(raw)
    const file = path.join(paths.configDefaults(), 'project-launcher-config.json')
    const defaults = configRepo.readJson(file)
    if (defaults === null) throw new Error(`Default project launcher config not found: ${file}`)
    return decodeLauncherConfig(defaults)
  }

  function saveProjectConfig(projectSlug: string, config: LauncherConfig, owner?: string): LauncherConfig {
    return projectLock(projectSlug).write(() => {
      const next = decodeLauncherConfig(config)
      configRepo.writeJson(paths.projectLauncherConfigFile(projectSlug), next)
      return next
    }, owner)
  }

  function getMergedConfig(projectSlug: string): MergedLauncherConfig {
    return mergeLauncherConfigs(sharedConfig.read(), loadProjectConfig(projectSlug))
  }

  function updateProjectConfig(projectSlug: string, transform: Updater<LauncherConfig>): LauncherConfig {
    return projectLock(projectSlug).write(() => {
      const next = decodeLauncherConfig(transform(readProjectConfig(projectSlug)))
      configRepo.writeJson(paths.projectLauncherConfigFile(projectSlug), next)
      return next
    })
  }

  return {
    getAppConfigDir,
    getConfigDefaultsDir,
    getProjectDir,
    getAgentWorktreeDir,
    resolveWorktreeSettings,
    loadAppConfig,
    saveAppConfig,
    loadProjectConfig,
    releaseProjectConfig,
    saveProjectConfig,
    getMergedConfig,
    updateProjectConfig,
  }
}

export interface ResolveWorktreeSettingsResult {
  worktreeRootPath: string
  branchPrefix: string | undefined
}
