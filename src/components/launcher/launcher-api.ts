import { query } from "@solidjs/router";
import path from "path";
import {
  launcherConfigManager, projectRegistry, worktreeManager,
  operationTracker, ticketSyncManager,
  worktreeRevisions, commandTemplateService,
} from "~/core/config/instances.js";
import {
  resolveTicketAndProject, ensureLaunchDir,
  launchAgent as launchAgentCore,
  launchProjectAgent as launchProjectAgentCore,
  agentRunning, agentMarkerPath, spawnProfile,
  PROJECT_LAUNCH_KEY,
  type LaunchRequest,
} from "~/core/launcher/agent-launch.js";
import { NotFoundError, ValidationError, errorResult, errorMessage } from "~/core/shared/errors.js";
import { succeed, fail } from '~/util/result.js';
import { resolveConflictsWith } from "~/core/launcher/resolve-conflicts.js";
import type {
  MergedLauncherConfig,
  LauncherConfig,
} from "~/core/launcher/launcher-config.js";

export interface ProjectLauncherConfigData {
  projectConfig: LauncherConfig;
  projectBoardId: string | null;
  projectName: string;
  projectPath: string;
  ticketsBranch?: string;
  ticketsPath?: string;
  worktreeDir: string;
  agentWorktreeDir: string;
}

export interface MergedLauncherConfigWithMeta extends ProjectLauncherConfigData, MergedLauncherConfig {}

function loadProjectLauncherConfig(projectSlug: string): ProjectLauncherConfigData {
  const project = projectRegistry.listProjects().find(p => p.projectSlug === projectSlug);
  if (!project) throw new Error(`Project not found: ${projectSlug}`);
  return {
    projectConfig: launcherConfigManager.loadProjectConfig(projectSlug),
    projectBoardId: project.boardId ?? null,
    projectName: project.name,
    projectPath: project.path,
    ticketsBranch: project.branch,
    ticketsPath: project.ticketsPath,
    worktreeDir: worktreeManager.getWorktreeDir(projectSlug),
    agentWorktreeDir: launcherConfigManager.getAgentWorktreeDir(projectSlug),
  };
}

export const getProjectLauncherConfig = query(async (
  projectSlug: string,
): Promise<ProjectLauncherConfigData> => {
  "use server";
  return loadProjectLauncherConfig(projectSlug);
}, "launcher-config");

export async function readProjectLauncherConfig(projectSlug: string, owner: string) {
  "use server";
  try {
    return succeed(launcherConfigManager.loadProjectConfig(projectSlug, owner));
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function releaseProjectLauncherConfig(projectSlug: string, owner: string): Promise<void> {
  "use server";
  launcherConfigManager.releaseProjectConfig(projectSlug, owner);
}

export async function saveProjectLauncherConfig(projectSlug: string, json: string, owner: string) {
  "use server";
  try {
    return owner ? succeed(launcherConfigManager.saveProjectConfig(projectSlug, JSON.parse(json), owner))
      : fail('Configuration update requires a client identity.');
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function launchAgentAction(
  projectSlug: string, folderName: string, launchRequest: LaunchRequest,
) {
  "use server";
  try {
    const { ticket, project, worktreeDir } = resolveTicketAndProject(projectSlug, folderName);
    if (agentRunning(projectSlug, folderName)) {
      return { ok: false as const, type: "error" as const, message: "Already started" };
    }
    if (!launchRequest.launchDir) {
      throw new ValidationError("launchDir is required");
    }
    const resolved = await ensureLaunchDir(
      projectSlug, folderName, launchRequest.useWorktree, project.path,
      ticket, worktreeDir,
      { skipDirtyCheck: launchRequest.force, skipBehindRemote: launchRequest.skipBehindRemote },
      project.mainBranch,
    );
    if (!resolved.ok) {
      return { ok: false as const, type: resolved.type, message: resolved.message };
    }
    await launchAgentCore(projectSlug, ticket, launchRequest, launchRequest.launchDir);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function launchProjectAgentAction(
  projectSlug: string, launchRequest: LaunchRequest,
) {
  "use server";
  try {
    const project = projectRegistry.listProjects().find(p => p.projectSlug === projectSlug);
    if (!project) throw new NotFoundError(`Project not found: ${projectSlug}`);
    if (agentRunning(projectSlug, PROJECT_LAUNCH_KEY)) {
      return { ok: false as const, type: "error" as const, message: "Already started" };
    }
    await launchProjectAgentCore(
      projectSlug, projectRegistry.getName(projectSlug), launchRequest, project.path,
    );
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function runShortcut(
  projectSlug: string, folderName: string,
  name: string, useWorktree: boolean, force: boolean, launchDir: string,
) {
  "use server";
  try {
    if (!launchDir) throw new ValidationError("launchDir is required");
    const { ticket, project, worktreeDir } = resolveTicketAndProject(projectSlug, folderName);
    const merged = launcherConfigManager.getMergedConfig(projectSlug);
    const shortcut = merged.shortcuts.find(s => s.name === name);
    if (!shortcut) throw new Error(`Shortcut "${name}" not found`);
    const resolved = await ensureLaunchDir(
      projectSlug, folderName, useWorktree, project.path,
      ticket, worktreeDir,
      { skipDirtyCheck: force, skipBehindRemote: force },
      project.mainBranch,
    );
    if (!resolved.ok) {
      return { ok: false as const, type: resolved.type, message: resolved.message };
    }
    const commandVars = {
      ticketDir: path.resolve(worktreeDir, ticket.folderName),
      ticketSlug: ticket.folderName, ticketTitle: ticket.title,
      ticketNumber: ticket.number, ticketStatus: ticket.status,
      projectPath: project.path, projectSlug, launchDir,
    };
    await commandTemplateService.executeTrustedScript({
      source: { kind: 'shortcut', shortcutName: shortcut.name },
      script: shortcut.command,
      values: commandVars,
      knownScalarPlaceholders: Object.keys(commandVars),
      cwd: launchDir,
      mode: 'detached',
    });
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function resolveConflicts(projectSlug: string, profileName: string) {
  "use server";
  try {
    await resolveConflictsWith({
      getMergedConfig: (slug) => launcherConfigManager.getMergedConfig(slug),
      getWorktreeDir: (slug) => worktreeManager.getWorktreeDir(slug),
      prepareResolution: (worktreeDir) => ticketSyncManager.prepareResolution(worktreeDir),
      trackOperation: (operation) => operationTracker.track(operation),
      spawnProfile,
      markerPath: agentMarkerPath,
      getAppConfigDir: () => launcherConfigManager.getAppConfigDir(),
      getConfigDefaultsDir: () => launcherConfigManager.getConfigDefaultsDir(),
    }, projectSlug, profileName);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function abortRebase(projectSlug: string) {
  "use server";
  try {
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    await operationTracker.track(ticketSyncManager.abort(worktreeDir));
    worktreeRevisions.bump(worktreeDir);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}
