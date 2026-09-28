import type { Result } from '../../util/result.js'
import type { LauncherConfig } from '../../core/launcher/launcher-config-data.js'
import type { ActionError } from '../../core/shared/errors.js'
import { query } from '@solidjs/router'
import path from 'path'
import {
  launcherConfigManager,
  projectRegistry,
  worktreeManager,
  operationTracker,
  taskSyncManager,
  worktreeRevisions,
  commandTemplateService,
} from '~/core/config/instances.js'
import {
  resolveTaskAndProject,
  ensureLaunchDir,
  launchAgent as launchAgentCore,
  launchProjectAgent as launchProjectAgentCore,
  agentRunning,
  agentMarkerPath,
  spawnProfile,
  PROJECT_LAUNCH_KEY,
  type LaunchRequest,
} from '~/core/launcher/agent-launch.js'
import { createNotFoundError, createValidationError, errorResult, errorPayload } from '~/core/shared/errors.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { success, failure } from '~/util/result.js'
import { resolveConflictsWith } from '~/core/launcher/resolve-conflicts.js'
import type { MergedLauncherConfig } from '~/core/launcher/launcher-config.js'
import { taskAgentKey } from '~/core/task/task-worktrees.js'

export interface ProjectLauncherMetadata {
  projectPath: string
  tasksBranch?: string
  worktreeDir: string
  agentWorktreeDir: string
}

export interface MergedLauncherConfigWithMeta extends ProjectLauncherMetadata, MergedLauncherConfig {}

export const getProjectLauncherMetadata = query(async (projectSlug: string): Promise<ProjectLauncherMetadata> => {
  'use server'

  const project = projectRegistry.listProjects().find((p) => p.projectSlug === projectSlug)
  if (!project) throw new Error(`Project not found: ${projectSlug}`)
  return {
    projectPath: project.path,
    tasksBranch: project.branch,
    worktreeDir: worktreeManager.getWorktreeDir(projectSlug),
    agentWorktreeDir: launcherConfigManager.getAgentWorktreeDir(projectSlug),
  }
}, 'launcher-metadata')

export async function readProjectLauncherConfig(projectSlug: string, owner?: string): Promise<Result<LauncherConfig, UserFacingError>> {
  'use server'

  try {
    return success(launcherConfigManager.loadProjectConfig(projectSlug, owner))
  } catch (e) {
    return failure(errorPayload(e, 'Load launcher settings failed'))
  }
}

export async function releaseProjectLauncherConfig(projectSlug: string, owner: string): Promise<void> {
  'use server'

  launcherConfigManager.releaseProjectConfig(projectSlug, owner)
}

export async function saveProjectLauncherConfig(
  projectSlug: string,
  json: string,
  owner: string,
): Promise<Result<LauncherConfig, UserFacingError>> {
  'use server'

  try {
    return owner
      ? success(launcherConfigManager.saveProjectConfig(projectSlug, JSON.parse(json), owner))
      : failure({
          title: 'Save failed',
          description: 'Configuration update requires a client identity.',
        })
  } catch (e) {
    return failure(errorPayload(e, 'Save launcher settings failed'))
  }
}

export async function launchAgentAction(
  projectSlug: string,
  folderName: string,
  launchRequest: LaunchRequest,
): Promise<Result<undefined, ActionError | LaunchAgentActionResult>> {
  'use server'

  try {
    const { task, project, worktreeDir } = resolveTaskAndProject(projectSlug, folderName)
    if (agentRunning(projectSlug, taskAgentKey(folderName, task, launchRequest.launchDir))) {
      return errorResult('Already started')
    }
    if (!launchRequest.launchDir) {
      throw createValidationError('launchDir is required')
    }
    const resolved = await ensureLaunchDir(
      projectSlug,
      folderName,
      launchRequest.useWorktree,
      project.path,
      task,
      worktreeDir,
      {
        skipDirtyCheck: launchRequest.force,
        skipBehindRemote: launchRequest.skipBehindRemote,
      },
      project.mainBranch,
    )
    if (resolved.type === 'Failure') return resolved
    if (launchRequest.launchDir !== resolved.value.launchDir)
      throw createValidationError('The launch target changed. Select it again before launching.')
    await launchAgentCore(projectSlug, task, launchRequest, launchRequest.launchDir)
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function launchProjectAgentAction(projectSlug: string, launchRequest: LaunchRequest): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    const project = projectRegistry.listProjects().find((p) => p.projectSlug === projectSlug)
    if (!project) throw createNotFoundError(`Project not found: ${projectSlug}`)
    if (agentRunning(projectSlug, PROJECT_LAUNCH_KEY)) {
      return errorResult('Already started')
    }
    await launchProjectAgentCore(projectSlug, projectRegistry.getName(projectSlug), launchRequest, project.path)
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function runShortcut(
  projectSlug: string,
  folderName: string,
  name: string,
  useWorktree: boolean,
  force: boolean,
  launchDir: string,
): Promise<Result<undefined, ActionError | LaunchAgentActionResult>> {
  'use server'

  try {
    if (!launchDir) throw createValidationError('launchDir is required')
    const { task, project, worktreeDir } = resolveTaskAndProject(projectSlug, folderName)
    const merged = launcherConfigManager.getMergedConfig(projectSlug)
    const shortcut = merged.shortcuts.find((s) => s.name === name)
    if (!shortcut) throw new Error(`Shortcut "${name}" not found`)
    const resolved = await ensureLaunchDir(
      projectSlug,
      folderName,
      useWorktree,
      project.path,
      task,
      worktreeDir,
      {
        skipDirtyCheck: force,
        skipBehindRemote: force,
      },
      project.mainBranch,
    )
    if (resolved.type === 'Failure') return resolved
    if (launchDir !== resolved.value.launchDir)
      throw createValidationError('The launch target changed. Select it again before running the shortcut.')
    const commandVars = {
      taskDir: path.resolve(worktreeDir, task.folderName),
      taskSlug: task.folderName,
      taskTitle: task.title,
      taskNumber: task.number,
      taskStatus: task.status,
      projectPath: project.path,
      projectSlug,
      launchDir,
    }
    await commandTemplateService.executeTrustedScript({
      source: {
        kind: 'shortcut',
        shortcutName: shortcut.name,
      },
      script: shortcut.command,
      values: commandVars,
      knownScalarPlaceholders: Object.keys(commandVars),
      cwd: launchDir,
      mode: 'detached',
    })
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function resolveConflicts(projectSlug: string, profileName: string): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    await resolveConflictsWith(
      {
        getMergedConfig: (slug) => launcherConfigManager.getMergedConfig(slug),
        getWorktreeDir: (slug) => worktreeManager.getWorktreeDir(slug),
        prepareResolution: (worktreeDir) => taskSyncManager.prepareResolution(worktreeDir),
        trackOperation: (operation) => operationTracker.track(operation),
        spawnProfile,
        markerPath: agentMarkerPath,
        getAppConfigDir: () => launcherConfigManager.getAppConfigDir(),
        getConfigDefaultsDir: () => launcherConfigManager.getConfigDefaultsDir(),
      },
      projectSlug,
      profileName,
    )
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export async function abortRebase(projectSlug: string): Promise<Result<undefined, ActionError>> {
  'use server'

  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
    await operationTracker.track(taskSyncManager.abort(worktreeDir))
    worktreeRevisions.bump(worktreeDir)
    return success(undefined)
  } catch (e) {
    return errorResult(e)
  }
}

export interface LaunchAgentActionResult {
  type: 'dirtyWorktree' | 'behindRemote'
  message: string
}
