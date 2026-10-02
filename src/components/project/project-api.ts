import type { ActionError } from '../../core/shared/errors.js'
import { success, failure, type Result } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { action, query } from '@solidjs/router'
import { respond, type ResponseEnvelope } from '@solidjs/web'
import {
  configPaths,
  projectRegistry,
  projectPageService,
  worktreeManager,
  launcherConfigManager,
  fileWatcher,
  commandTemplateService,
} from '~/core/config/instances.js'
import { detectMainBranch } from '~/core/infra/git.js'
import { errorResult, errorPayload } from '~/core/shared/errors.js'

export type { BoardState, ProjectPageData, SyncStatus } from '~/core/board/board-types.js'

export const getDefaultProjectSlug = query(async (): Promise<string | null> => {
  'use server'

  return projectRegistry.getDefaultProjectSlug()
}, 'default-project-slug')

export const loadProjectPage = query(async (projectSlug: string) => {
  'use server'

  return projectPageService.loadProjectPage(projectSlug)
}, 'project-page')

export const getSyncStatus = query(async (projectSlug: string) => {
  'use server'

  return projectPageService.loadSyncStatus(projectSlug)
}, 'project-sync-status')

export interface ProjectPathPreview {
  mainBranch: string
}

export const previewProjectPath = query(async (pathValue: string): Promise<Result<ProjectPathPreview, UserFacingError>> => {
  'use server'

  try {
    return success({
      mainBranch: await detectMainBranch(pathValue, commandTemplateService),
    })
  } catch (err) {
    return failure({
      ...errorPayload(err, 'Preview project failed'),
      field: 'path',
    })
  }
}, 'preview-project-path')

export const addProject = action(async (
  pathValue: string,
  branch: string,
  mainBranch: string,
  boardId: string,
  name: string,
): Promise<Result<AddProjectResult, ActionError>> => {
  'use server'

  try {
    const projectSlug = projectRegistry.previewSlug(pathValue)
    await worktreeManager.ensureWorktree(pathValue, projectSlug, branch || undefined)
    const project = projectRegistry.addProject(pathValue, {
      branch: branch || undefined,
      mainBranch: mainBranch?.trim() || undefined,
      boardId: boardId?.trim() || undefined,
      name: name?.trim() || undefined,
    })
    launcherConfigManager.updateProjectConfig(project.projectSlug, (current) => ({
      ...current,
      worktreeRootPath: configPaths.agentWorktreeDir(project.projectSlug),
    }))
    return success({
      projectSlug: project.projectSlug,
    })
  } catch (e) {
    return errorResult(e)
  }
}, 'add-project')

export interface DeleteProjectResult {
  remainingProjectSlug?: string
}

export const deleteProject = action(async (projectSlug: string): Promise<ResponseEnvelope<Result<DeleteProjectResult, ActionError>>> => {
  'use server'

  try {
    const exists = projectRegistry.listProjects().some((p) => p.projectSlug === projectSlug)
    if (!exists) {
      return respond(errorResult(`Project not found: ${projectSlug}`), { revalidate: [] })
    }
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
    projectRegistry.removeProject(projectSlug)
    await fileWatcher.stop(worktreeDir)
    return respond(success({ remainingProjectSlug: projectRegistry.listProjects()[0]?.projectSlug }), {
      revalidate: ['app-config', 'default-project-slug', 'home-redirect'],
    })
  } catch (e) {
    return respond(errorResult(e), { revalidate: [] })
  }
}, 'delete-project')

export const setProjectPath = action(async (projectSlug: string, pathValue: string) => {
  'use server'

  try {
    const project = projectRegistry.updateProject(projectSlug, pathValue.trim())
    return success({
      path: project.path,
    })
  } catch (e) {
    return errorResult(e)
  }
}, 'set-project-path')

export const setTasksLocation = action(
  async (
    projectSlug: string,
    change: {
      kind: 'path' | 'branch'
      value: string
    },
  ) => {
    'use server'

    try {
      const oldPath = worktreeManager.getWorktreeDir(projectSlug)
      projectRegistry.setTasksLocation(projectSlug, change)
      if (change.kind === 'path') await fileWatcher.stop(oldPath)
      return respond(
        success({
          value: change.value.trim(),
        }),
        {
          revalidate: [],
        },
      )
    } catch (e) {
      return respond(errorResult(e), {
        revalidate: [],
      })
    }
  },
  'set-tasks-location',
)

export interface AddProjectResult {
  projectSlug: string
}
