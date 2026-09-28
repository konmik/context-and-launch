import type { CommandTemplateService } from '../command-template/command-template-service.js'
import type { LauncherConfigManager } from '../launcher/launcher-config.js'
import {
  agentMarkerPathIn,
  buildAgentDisplayName,
  buildWindowTitle,
  isProfileAgentRunning,
  runLauncherProfile,
} from '../launcher/profile-launch.js'
import type { ResolvedDiffReviewTarget } from './diff-review-target.js'
import { taskAgentKey } from '../task/task-worktrees.js'

export interface ReviewAgentLauncher {
  isRunning(target: ResolvedDiffReviewTarget): boolean
  launch(target: ResolvedDiffReviewTarget, initialPrompt: string, profileName: string): Promise<void>
}

export function createProfileReviewAgentLauncher(
  launcherConfig: LauncherConfigManager,
  commands: CommandTemplateService,
): ReviewAgentLauncher {
  function isRunning(target: ResolvedDiffReviewTarget): boolean {
    return isProfileAgentRunning(commands, markerPath(target))
  }

  async function launch(target: ResolvedDiffReviewTarget, initialPrompt: string, profileName: string): Promise<void> {
    const merged = launcherConfig.getMergedConfig(target.projectSlug)
    const profile = merged.profiles.find((candidate) => candidate.name === profileName)
    if (!profile?.command.trim()) {
      throw new Error(`Launcher profile '${profileName}' is missing or has no command.`)
    }
    await runLauncherProfile(
      commands,
      profile,
      {
        initialPrompt,
        agentDisplayName: buildAgentDisplayName(target.task, {
          worktreePath: target.worktreePath,
        }),
        herdrWorkspaceLabel: target.projectSlug,
        herdrPaneLabel: `${target.projectSlug}--${taskAgentKey(target.folderName, target.task, target.worktreePath)}`,
        windowTitle: buildWindowTitle(target.task, {
          worktreePath: target.worktreePath,
        }),
        markerPath: markerPath(target),
        appConfigDir: launcherConfig.getAppConfigDir(),
        configDefaultsDir: launcherConfig.getConfigDefaultsDir(),
      },
      target.worktreePath,
    )
  }

  function markerPath(target: ResolvedDiffReviewTarget): string {
    return agentMarkerPathIn(
      launcherConfig.getAppConfigDir(),
      target.projectSlug,
      taskAgentKey(target.folderName, target.task, target.worktreePath),
    )
  }

  return {
    isRunning,
    launch,
  }
}
