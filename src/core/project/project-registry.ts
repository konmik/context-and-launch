import fs from 'fs'
import { createValidationError, createNotFoundError } from '../shared/errors.js'
import path from 'path'
import type { ConfigPaths } from '../config/config-paths.js'
import { createConfigRepository, type ConfigRepository } from '../config/config-repository.js'
import { createAppConfigStore, type AppConfigStore } from '../config/app-config-store.js'
import type { ProjectEntry } from '../config/app-config-data.js'

export type { ProjectEntry } from '../config/app-config-data.js'

export interface ProjectInfo extends ProjectEntry {
  available: boolean
  name: string
}

function isGitRepo(dirPath: string, configRepo: ConfigRepository): boolean {
  try {
    return configRepo.exists(dirPath) && configRepo.exists(path.join(dirPath, '.git'))
  } catch {
    return false
  }
}

function entryToInfo(entry: ProjectEntry, configRepo: ConfigRepository): ProjectInfo {
  return {
    path: entry.path,
    projectSlug: entry.projectSlug,
    available: isGitRepo(entry.path, configRepo),
    name: entry.name || entry.projectSlug,
    branch: entry.branch,
    tasksPath: entry.tasksPath,
    mainBranch: entry.mainBranch,
    boardId: entry.boardId,
  }
}

function toSlugSegment(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function validateBranchName(name: string, field = 'branch'): void {
  if (!name) throw createValidationError('Branch name cannot be empty', field)
  if (/\s/.test(name)) throw createValidationError('Branch name cannot contain whitespace', field)
  if (/[~^:?*[\\\x00-\x1f\x7f]/.test(name)) {
    throw createValidationError(`Branch name contains invalid characters: ${name}`, field)
  }
  if (name.includes('..')) throw createValidationError('Branch name cannot contain ".."', field)
  if (name.includes('@{')) throw createValidationError('Branch name cannot contain "@{"', field)
  if (name.includes('//')) throw createValidationError('Branch name cannot contain "//"', field)
  if (name.startsWith('/') || name.endsWith('/')) {
    throw createValidationError('Branch name cannot start or end with "/"', field)
  }
  if (name.startsWith('-')) throw createValidationError('Branch name cannot start with "-"', field)
  if (name.startsWith('.') || name.endsWith('.')) {
    throw createValidationError('Branch name cannot start or end with "."', field)
  }
  if (name.endsWith('.lock')) throw createValidationError('Branch name cannot end with ".lock"', field)
  if (name === '@') throw createValidationError('Branch name cannot be "@"', field)
}

export function generateProjectSlug(filePath: string, existingProjectSlugs: Set<string>): string {
  const parsed = path.parse(filePath)
  const name = toSlugSegment(parsed.base) || 'project'
  if (!existingProjectSlugs.has(name)) return name
  const parentName = parsed.dir ? toSlugSegment(path.basename(parsed.dir)) : ''
  const base = parentName ? `${parentName}-${name}` : name
  if (!existingProjectSlugs.has(base)) return base
  let i = 2
  while (existingProjectSlugs.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

export interface ProjectRegistry {
  getDefaultProjectSlug(): string | null
  listProjects(): ProjectInfo[]
  getTasksPath(projectSlug: string): string | undefined
  getBoardId(projectSlug: string): string | undefined
  previewSlug(projectPath: string): string
  addProject(projectPath: string, opts?: Omit<Partial<ProjectEntry>, 'path'>): ProjectInfo
  updateProject(projectSlug: string, newPath?: string, newProjectSlug?: string): ProjectInfo
  removeProject(projectSlug: string): void
  getName(projectSlug: string): string
  setTasksLocation(
    projectSlug: string,
    change: {
      kind: 'path' | 'branch'
      value: string
    },
  ): void
  getPort(): number
  getBrowser(): string
}

export function createProjectRegistry(
  paths: ConfigPaths,
  configRepo: ConfigRepository = createConfigRepository(),
  appConfig: AppConfigStore = createAppConfigStore(paths, configRepo),
): ProjectRegistry {
  function getDefaultProjectSlug(): string | null {
    const config = appConfig.read()
    const lastProjectSlug = config.lastUsedProjectSlug
    if (lastProjectSlug && config.projects.some((p) => p.projectSlug === lastProjectSlug)) {
      return lastProjectSlug
    }
    if (config.projects.length > 0) {
      return config.projects[0].projectSlug
    }
    return null
  }

  function listProjects(): ProjectInfo[] {
    return appConfig.read().projects.map((entry) => entryToInfo(entry, configRepo))
  }

  function getTasksPath(projectSlug: string): string | undefined {
    return appConfig.read().projects.find((p) => p.projectSlug === projectSlug)?.tasksPath
  }

  function getBoardId(projectSlug: string): string | undefined {
    return appConfig.read().projects.find((p) => p.projectSlug === projectSlug)?.boardId
  }

  function previewSlug(projectPath: string): string {
    const existing = new Set(appConfig.read().projects.map((p) => p.projectSlug))
    return generateProjectSlug(projectPath, existing)
  }

  function addProject(projectPath: string, opts: Omit<Partial<ProjectEntry>, 'path'> = {}): ProjectInfo {
    if (!configRepo.exists(projectPath)) {
      throw createValidationError(`Path does not exist: ${projectPath}`, 'path')
    }
    if (!configRepo.exists(path.join(projectPath, '.git'))) {
      throw createValidationError(`Not a git repository: ${projectPath}`, 'path')
    }
    if (opts.branch !== undefined) {
      validateBranchName(opts.branch)
    }
    if (opts.mainBranch !== undefined) {
      validateBranchName(opts.mainBranch, 'mainBranch')
    }
    const canonicalPath = configRepo.realpathSync(projectPath)
    const saved = appConfig.update((config) => {
      const alreadyRegistered = config.projects.some((project) => {
        try {
          return configRepo.realpathSync(project.path) === canonicalPath
        } catch {
          return false
        }
      })
      if (alreadyRegistered) throw createValidationError(`Project already registered: ${projectPath}`, 'path')
      const existingProjectSlugs = new Set(config.projects.map((project) => project.projectSlug))
      const projectSlug = opts.projectSlug ?? generateProjectSlug(projectPath, existingProjectSlugs)
      if (existingProjectSlugs.has(projectSlug)) throw createValidationError(`Project slug already exists: ${projectSlug}`, 'projectSlug')
      return {
        ...config,
        projects: [
          ...config.projects,
          {
            ...opts,
            path: canonicalPath,
            projectSlug,
          },
        ],
        lastUsedProjectSlug: projectSlug,
      }
    })
    return entryToInfo(saved.projects.at(-1)!, configRepo)
  }

  function updateProject(projectSlug: string, newPath?: string, newProjectSlug?: string): ProjectInfo {
    const updatedProjectSlug = newProjectSlug ?? projectSlug
    const saved = appConfig.update((config) => {
      const index = config.projects.findIndex((project) => project.projectSlug === projectSlug)
      if (index < 0) throw createNotFoundError(`Project not found: ${projectSlug}`)
      const entry = config.projects[index]
      if (newPath !== undefined) {
        if (!newPath || !configRepo.exists(newPath)) throw createValidationError(`Path does not exist: ${newPath}`, 'path')
        if (!configRepo.exists(path.join(newPath, '.git'))) {
          throw createValidationError(`Not a git repository: ${newPath}`, 'path')
        }
      }
      if (newProjectSlug && config.projects.some((project, i) => i !== index && project.projectSlug === newProjectSlug)) {
        throw createValidationError(`Project slug already exists: ${newProjectSlug}`, 'projectSlug')
      }
      const updated = {
        ...entry,
        projectSlug: updatedProjectSlug,
        path: newPath === undefined ? entry.path : configRepo.realpathSync(newPath),
      }
      return {
        ...config,
        projects: config.projects.map((project, i) => (i === index ? updated : project)),
        lastUsedProjectSlug: config.lastUsedProjectSlug === projectSlug ? updatedProjectSlug : config.lastUsedProjectSlug,
      }
    })
    const updated = saved.projects.find((project) => project.projectSlug === updatedProjectSlug)!
    return entryToInfo(updated, configRepo)
  }

  function removeProject(projectSlug: string): void {
    appConfig.update((config) => {
      const projects = config.projects.filter((project) => project.projectSlug !== projectSlug)
      return {
        ...config,
        projects,
        lastUsedProjectSlug: config.lastUsedProjectSlug === projectSlug ? (projects[0]?.projectSlug ?? null) : config.lastUsedProjectSlug,
      }
    })
    const projectConfigDir = paths.projectConfigDir(projectSlug)
    if (fs.existsSync(projectConfigDir)) {
      fs.rmSync(projectConfigDir, {
        recursive: true,
      })
    }
  }

  function getName(projectSlug: string): string {
    const project = appConfig.read().projects.find((p) => p.projectSlug === projectSlug)
    return project?.name || projectSlug
  }

  function setTasksLocation(
    projectSlug: string,
    change: {
      kind: 'path' | 'branch'
      value: string
    },
  ): void {
    const value = change.value.trim()
    if (!value) throw createValidationError('Tasks folder and branch cannot be empty.', change.kind === 'path' ? 'tasksPath' : 'branch')
    if (change.kind === 'branch') validateBranchName(value)
    else if (!path.isAbsolute(value)) throw createValidationError('Tasks folder must be an absolute path.', 'tasksPath')
    appConfig.update((config) => {
      if (!config.projects.some((project) => project.projectSlug === projectSlug)) {
        throw createNotFoundError(`Project not found: ${projectSlug}`)
      }
      return {
        ...config,
        projects: config.projects.map((project) =>
          project.projectSlug !== projectSlug
            ? project
            : {
                ...project,
                [change.kind === 'path' ? 'tasksPath' : 'branch']: value,
              },
        ),
      }
    })
  }

  function getPort(): number {
    return appConfig.read().port ?? 14780
  }

  function getBrowser(): string {
    return appConfig.read().browser ?? 'chrome'
  }

  return {
    getDefaultProjectSlug,
    listProjects,
    getTasksPath,
    getBoardId,
    previewSlug,
    addProject,
    updateProject,
    removeProject,
    getName,
    setTasksLocation,
    getPort,
    getBrowser,
  }
}
