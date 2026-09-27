import path from 'path'
import os from 'os'

export function requireSafeSlug(slug: string): void {
  if (slug === '.' || slug === '..' || slug.includes('/') || slug.includes('\\') || slug.includes('\0')) {
    throw new Error(`Invalid slug: ${slug}`)
  }
}

export interface ConfigPaths {
  readonly baseDir: string
  readonly configDefaultsDir: string
  appConfigDir(): string
  configDefaults(): string
  projectRegistryFile(): string
  appLauncherConfigFile(): string
  boardsFile(): string
  commandTemplateOverridesFile(): string
  diffReviewStateFile(projectSlug: string): string
  projectDir(projectSlug: string): string
  projectConfigDir(projectSlug: string): string
  projectLauncherConfigFile(projectSlug: string): string
  ticketWorktreeDir(projectSlug: string): string
  agentWorktreeDir(projectSlug: string): string
}

export function createConfigPaths(
  baseDir = path.join(os.homedir(), '.context-launch'),
  configDefaultsDir = path.join(process.cwd(), 'config-defaults'),
): ConfigPaths {
  function appConfigDir(): string {
    return path.join(baseDir, 'config')
  }

  function configDefaults(): string {
    return configDefaultsDir
  }

  function projectRegistryFile(): string {
    return path.join(baseDir, 'config', 'config.json')
  }

  function appLauncherConfigFile(): string {
    return path.join(baseDir, 'config', 'launcher-config.json')
  }

  function boardsFile(): string {
    return path.join(baseDir, 'config', 'boards.json')
  }

  function commandTemplateOverridesFile(): string {
    return path.join(baseDir, 'config', 'command-templates.json')
  }

  function diffReviewStateFile(projectSlug: string): string {
    requireSafeSlug(projectSlug)
    return path.join(baseDir, 'projects', projectSlug, 'config', 'diff-review.json')
  }

  function projectDir(projectSlug: string): string {
    requireSafeSlug(projectSlug)
    return path.join(baseDir, 'projects', projectSlug)
  }

  function projectConfigDir(projectSlug: string): string {
    requireSafeSlug(projectSlug)
    return path.join(baseDir, 'projects', projectSlug, 'config')
  }

  function projectLauncherConfigFile(projectSlug: string): string {
    requireSafeSlug(projectSlug)
    return path.join(baseDir, 'projects', projectSlug, 'config', 'launcher-config.json')
  }

  function ticketWorktreeDir(projectSlug: string): string {
    requireSafeSlug(projectSlug)
    return path.join(baseDir, 'projects', projectSlug, 'tickets')
  }

  function agentWorktreeDir(projectSlug: string): string {
    requireSafeSlug(projectSlug)
    return path.join(baseDir, 'projects', projectSlug, 'worktrees')
  }

  return {
    get baseDir() {
      return baseDir
    },
    get configDefaultsDir() {
      return configDefaultsDir
    },
    appConfigDir,
    configDefaults,
    projectRegistryFile,
    appLauncherConfigFile,
    boardsFile,
    commandTemplateOverridesFile,
    diffReviewStateFile,
    projectDir,
    projectConfigDir,
    projectLauncherConfigFile,
    ticketWorktreeDir,
    agentWorktreeDir,
  }
}
