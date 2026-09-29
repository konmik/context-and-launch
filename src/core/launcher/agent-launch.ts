import {
  worktreeManager,
  projectRegistry,
  launcherConfigManager,
  agentWorktreeManager,
  commandTemplateService,
} from '~/core/config/instances.js'
import { toSavedWorktreeInfo } from '~/core/worktree/agent-worktree.js'
import { createTicketStore } from '~/core/ticket/ticket-store.js'
import { createNotFoundError } from '~/core/shared/errors.js'
import { success, failure, type Result } from '~/util/result.js'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import type { ProjectInfo } from '~/core/project/project-registry.js'
import type { LauncherProfile } from '~/core/launcher/launcher-config.js'
import {
  agentMarkerPathIn,
  buildAgentDisplayName,
  buildWindowTitle,
  isProfileAgentRunning,
  projectWindowTitle,
  runLauncherProfile,
  type ProfileCommandVariables,
} from './profile-launch.js'
import { PROJECT_LAUNCH_KEY } from './launch-keys.js'
import type { LaunchRequest } from './launch-request.js'
import { ticketAgentKey } from '../ticket/ticket-worktrees.js'

export { PROJECT_LAUNCH_KEY }
export { buildWindowTitle }
export { parseLaunchRequest, readLaunchRequest, type LaunchRequest } from './launch-request.js'

/**
 * Path to the per-ticket marker file an agent launch script writes while the
 * agent is running. Lives under the app config dir (not the worktree) so it
 * survives worktree teardown and is never committed.
 */
export function agentMarkerPath(projectSlug: string, folderName: string): string {
  return agentMarkerPathIn(launcherConfigManager.getAppConfigDir(), projectSlug, folderName)
}

export function agentRunning(projectSlug: string, folderName: string): boolean {
  return isProfileAgentRunning(commandTemplateService, agentMarkerPath(projectSlug, folderName))
}

export interface ResolveLaunchDirResultValue {
  launchDir: string
}

export interface DirtyWorktreeResolveLaunchDirResult {
  type: 'dirtyWorktree'
  message: string
}

export interface BehindRemoteResolveLaunchDirResult {
  type: 'behindRemote'
  message: string
}

export async function ensureLaunchDir(
  projectSlug: string,
  folderName: string,
  useWorktree: boolean,
  projectPath: string,
  ticket: {
    agentWorktreeBranchName?: string
    agentWorktreeDir?: string
  },
  worktreeDir: string,
  opts?: {
    skipDirtyCheck?: boolean
    skipBehindRemote?: boolean
  },
  mainBranch?: string,
): Promise<Result<ResolveLaunchDirResultValue, DirtyWorktreeResolveLaunchDirResult | BehindRemoteResolveLaunchDirResult>> {
  if (!useWorktree)
    return success({
      launchDir: projectPath,
    })
  const savedInfo = toSavedWorktreeInfo(ticket)
  const result = await agentWorktreeManager.ensureAgentWorktree(
    projectPath,
    projectSlug,
    folderName,
    {
      skipDirtyCheck: opts?.skipDirtyCheck,
    },
    mainBranch,
    savedInfo,
  )
  if (result.type === 'Failure') {
    return failure({
      type: 'dirtyWorktree',
      message: 'Main branch has uncommitted changes. Launch anyway?',
    })
  }
  if (result.value.behindRemote && !opts?.skipBehindRemote) {
    return failure({
      type: 'behindRemote',
      message: 'Main branch is behind remote. Proceed with the worktree anyway?',
    })
  }
  if (!ticket.agentWorktreeBranchName) {
    createTicketStore(worktreeDir).saveAgentWorktreeInfo(folderName, result.value.branchName, result.value.worktreePath)
  }
  return success({
    launchDir: result.value.worktreePath,
  })
}

export function resolveTicketAndProject(projectSlug: string, folderName: string): ResolveTicketAndProjectResult {
  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug)
  const store = createTicketStore(worktreeDir)
  const ticket = store.getTicket(folderName)
  if (!ticket) throw createNotFoundError(`Ticket not found: ${folderName}`)
  const project = projectRegistry.listProjects().find((p) => p.projectSlug === projectSlug)
  if (!project) throw createNotFoundError(`Project not found: ${projectSlug}`)
  return {
    ticket,
    project,
    worktreeDir,
  }
}

export async function spawnProfile(profile: LauncherProfile, commandVars: ProfileCommandVariables, cwd: string): Promise<void> {
  await runLauncherProfile(commandTemplateService, profile, commandVars, cwd)
}

async function spawnAgent(
  projectSlug: string,
  markerKey: string,
  windowTitle: string,
  agentDisplayName: string,
  launchRequest: LaunchRequest,
  launchDir: string,
): Promise<void> {
  const merged = launcherConfigManager.getMergedConfig(projectSlug)
  const profile = merged.profiles.find((p) => p.name === launchRequest.profileName) ?? merged.profiles[0]
  if (!profile || !profile.command.trim()) {
    throw new Error('No valid profile configured for launch')
  }
  const commandVars = {
    initialPrompt: launchRequest.initialPrompt,
    windowTitle,
    agentDisplayName,
    herdrWorkspaceLabel: projectSlug,
    herdrPaneLabel: `${projectSlug}--${markerKey}`,
    markerPath: agentMarkerPath(projectSlug, markerKey),
    appConfigDir: launcherConfigManager.getAppConfigDir(),
    configDefaultsDir: launcherConfigManager.getConfigDefaultsDir(),
  } satisfies ProfileCommandVariables
  await spawnProfile(profile, commandVars, launchDir)
}

export async function launchAgent(projectSlug: string, ticket: TicketInfo, launchRequest: LaunchRequest, launchDir: string): Promise<void> {
  const context = launchRequest.useWorktree
    ? {
        worktreePath: launchDir,
      }
    : {
        projectName: projectRegistry.getName(projectSlug),
      }
  const agentDisplayName = buildAgentDisplayName(ticket, context)
  const windowTitle = buildWindowTitle(ticket, context)
  await spawnAgent(
    projectSlug,
    ticketAgentKey(ticket.folderName, ticket, launchDir),
    windowTitle,
    agentDisplayName,
    launchRequest,
    launchDir,
  )
}

export async function launchProjectAgent(
  projectSlug: string,
  projectName: string,
  launchRequest: LaunchRequest,
  launchDir: string,
): Promise<void> {
  await spawnAgent(projectSlug, PROJECT_LAUNCH_KEY, projectWindowTitle(projectName), projectName, launchRequest, launchDir)
}

export interface ResolveTicketAndProjectResult {
  ticket: TicketInfo
  project: ProjectInfo
  worktreeDir: string
}
