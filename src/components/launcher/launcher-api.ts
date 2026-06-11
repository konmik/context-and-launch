import { query } from "@solidjs/router";
import path from "path";
import {
  launcherConfigManager, projectRegistry, worktreeManager,
  operationTracker, ticketSyncManager, agentWorktreeManager,
  syncPendingTracker,
} from "~/core/config/instances.js";
import {
  resolveTicketAndProject, resolveLaunchDir,
  launchAgent as launchAgentCore,
  agentRunning, agentMarkerPath, spawnProfile,
  type LaunchRequest,
} from "~/core/launcher/agent-launch.js";
import { spawnDetached } from "~/core/launcher/spawn-detached.js";
import { interpolateCommand } from "~/core/launcher/prompt-interpolation.js";
import { ValidationError, errorResult } from "~/core/shared/errors.js";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";

export interface MergedLauncherConfigWithMeta extends MergedLauncherConfig {
  projectBoardId: string | null;
  projectName: string;
}

export const getMergedLauncherConfig = query(async (
  projectSlug: string,
): Promise<MergedLauncherConfigWithMeta> => {
  "use server";
  const merged = launcherConfigManager.getMergedConfig(projectSlug);
  return {
    ...merged,
    projectBoardId: projectRegistry.getBoardId(projectSlug) ?? null,
    projectName: projectRegistry.getName(projectSlug),
  };
}, "launcher-config");

export async function saveColumnDefaults(
  projectSlug: string, column: string,
  patch: {
    templateName?: string | null;
    checkedSkills?: string[];
    profileName?: string | null;
    lastLayer?: "editor" | "launcher" | "shortcuts";
    skillOrder?: string[];
  },
) {
  "use server";
  try {
    launcherConfigManager.saveColumnDefaults(projectSlug, column, patch);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function saveWorktreeRootPath(projectSlug: string, worktreeRootPath: string) {
  "use server";
  try {
    const value = worktreeRootPath.trim() || undefined;
    launcherConfigManager.saveWorktreeRootPath(projectSlug, value);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function saveConflictResolution(projectSlug: string, conflictResolutionPrompt: string) {
  "use server";
  try {
    const prompt = conflictResolutionPrompt.trim() || undefined;
    launcherConfigManager.saveConflictResolutionSettings(projectSlug, prompt);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

type ItemType = "template" | "skill" | "profile" | "shortcut";
type Scope = "app" | "project";

interface ItemFields {
  name: string;
  text?: string;
  command?: string;
}

const ITEM_METHODS: Record<ItemType, { add: string; update: string; remove: string }> = {
  template: { add: "addTemplate", update: "updateTemplate", remove: "removeTemplate" },
  skill:    { add: "addSkill",    update: "updateSkill",    remove: "removeSkill" },
  profile:  { add: "addProfile",  update: "updateProfile",  remove: "removeProfile" },
  shortcut: { add: "addShortcut", update: "updateShortcut", remove: "removeShortcut" },
};

function callItemMethod(
  methodName: string, scope: Scope, projectSlug: string, ...args: unknown[]
) {
  (launcherConfigManager as any)[methodName](scope, projectSlug, ...args);
}

export async function addItem(
  projectSlug: string, itemType: ItemType, scope: Scope, fields: ItemFields,
) {
  "use server";
  try {
    callItemMethod(ITEM_METHODS[itemType].add, scope, projectSlug, fields);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function updateItem(
  projectSlug: string, itemType: ItemType, scope: Scope,
  oldName: string, fields: ItemFields,
) {
  "use server";
  try {
    callItemMethod(ITEM_METHODS[itemType].update, scope, projectSlug, oldName, fields);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function deleteItem(
  projectSlug: string, itemType: ItemType, scope: Scope, name: string,
) {
  "use server";
  try {
    callItemMethod(ITEM_METHODS[itemType].remove, scope, projectSlug, name);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function reorderSkill(
  projectSlug: string, scope: Scope, name: string, order: number,
) {
  "use server";
  try {
    launcherConfigManager.setSkillOrder(scope, projectSlug, name, order);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export const getLastUsedProfile = query(async (): Promise<string | null> => {
  "use server";
  const profileName = projectRegistry.getLastUsedProfileName();
  return profileName ?? null;
}, "last-used-profile");

export async function saveLastUsedProfile(profileName: string) {
  "use server";
  try {
    projectRegistry.setLastUsedProfileName(profileName);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
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
    const resolved = await resolveLaunchDir(
      projectSlug, folderName, launchRequest.useWorktree, project.path,
      launchRequest.force, project.mainBranch,
    );
    if (!resolved.ok) {
      return { ok: false as const, type: resolved.type, message: resolved.message };
    }
    await launchAgentCore(projectSlug, ticket, project, worktreeDir, launchRequest, resolved.launchDir);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function pullAndRetryLaunch(
  projectSlug: string, folderName: string, launchRequest: LaunchRequest,
) {
  "use server";
  try {
    const { ticket, project, worktreeDir } = resolveTicketAndProject(projectSlug, folderName);
    if (agentRunning(projectSlug, folderName)) {
      return { ok: false as const, type: "error" as const, message: "Already started" };
    }
    await agentWorktreeManager.pullMainBranch(project.path, project.mainBranch);
    const worktreeResult = await agentWorktreeManager.ensureAgentWorktree(
      project.path, projectSlug, folderName, undefined, project.mainBranch,
    );
    if ('dirtyWorktree' in worktreeResult) {
      return {
        ok: false as const, type: "dirtyWorktree" as const,
        message: "Main branch has uncommitted changes. Launch anyway?",
      };
    }
    if ('behindRemote' in worktreeResult) {
      return { ok: false as const, type: "error" as const, message: "Still behind remote after pulling" };
    }
    await launchAgentCore(projectSlug, ticket, project, worktreeDir, launchRequest, worktreeResult.worktreePath);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function runShortcut(
  projectSlug: string, folderName: string,
  name: string, useWorktree: boolean, force: boolean,
) {
  "use server";
  try {
    const { ticket, project, worktreeDir } = resolveTicketAndProject(projectSlug, folderName);
    const merged = launcherConfigManager.getMergedConfig(projectSlug);
    const shortcut = merged.shortcuts.find(s => s.name === name);
    if (!shortcut) throw new Error(`Shortcut "${name}" not found`);
    const resolved = await resolveLaunchDir(
      projectSlug, folderName, useWorktree, project.path, force, project.mainBranch,
    );
    if (!resolved.ok) {
      return { ok: false as const, type: resolved.type, message: resolved.message };
    }
    const args = interpolateCommand(shortcut.command, {
      ticketDir: path.resolve(worktreeDir, ticket.folderName),
      ticketSlug: ticket.folderName, ticketTitle: ticket.title,
      ticketNumber: ticket.number, ticketStatus: ticket.status,
      projectPath: project.path, projectSlug, launchDir: resolved.launchDir,
    });
    await spawnDetached(args[0], args.slice(1), resolved.launchDir);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function resolveConflicts(projectSlug: string, profileName: string) {
  "use server";
  try {
    const merged = launcherConfigManager.getMergedConfig(projectSlug);
    const profile = merged.profiles.find(p => p.name === profileName);
    if (!profile) throw new ValidationError(`Profile "${profileName}" not found. Check your launcher settings.`);
    const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
    const plan = await operationTracker.track(ticketSyncManager.prepareResolution(worktreeDir));
    if (!plan.needsAgent) {
      return { ok: true as const };
    }
    const initialPrompt = `${merged.conflictResolutionPrompt}\n\n`
      + `When the rebase is complete, push your result with:\n${plan.pushCommand}`;
    await spawnProfile(profile, {
      initialPrompt,
      windowTitle: "Resolve Conflicts",
      markerPath: agentMarkerPath(projectSlug, "__resolve-conflicts__"),
      appConfigDir: launcherConfigManager.getAppConfigDir(),
      configDefaultsDir: launcherConfigManager.getConfigDefaultsDir(),
    }, plan.scratchDir);
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
    syncPendingTracker.invalidate(worktreeDir);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}
