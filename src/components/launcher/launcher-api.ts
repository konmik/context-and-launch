import { action, query } from "@solidjs/router";
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
import { NotFoundError, ValidationError, errorResult } from "~/core/shared/errors.js";
import type {
  LauncherItemType,
  LauncherColumnDefaults,
  MergedLauncherConfig,
} from "~/core/launcher/launcher-config.js";

export interface MergedLauncherConfigWithMeta extends MergedLauncherConfig {
  projectBoardId: string | null;
  projectName: string;
  projectPath: string;
  worktreeDir: string;
  agentWorktreeDir: string;
}

function buildMergedLauncherConfig(projectSlug: string): MergedLauncherConfigWithMeta {
  const merged = launcherConfigManager.getMergedConfig(projectSlug);
  const project = projectRegistry.listProjects().find(p => p.projectSlug === projectSlug);
  if (!project) throw new Error(`Project not found: ${projectSlug}`);
  return {
    ...merged,
    projectBoardId: projectRegistry.getBoardId(projectSlug) ?? null,
    projectName: projectRegistry.getName(projectSlug),
    projectPath: project.path,
    worktreeDir: worktreeManager.getWorktreeDir(projectSlug),
    agentWorktreeDir: launcherConfigManager.getAgentWorktreeDir(projectSlug),
  };
}

export const getMergedLauncherConfig = query(async (
  projectSlug: string,
): Promise<MergedLauncherConfigWithMeta> => {
  "use server";
  return buildMergedLauncherConfig(projectSlug);
}, "launcher-config");

const latestMergedConfigs = new Map<string, { config: MergedLauncherConfigWithMeta; savedAt: number }>();

export function latestMergedLauncherConfig(projectSlug: string) {
  const latest = latestMergedConfigs.get(projectSlug);
  if (!latest || Date.now() - latest.savedAt > 5_000) return undefined;
  return latest.config;
}

export async function loadMergedLauncherConfig(projectSlug: string) {
  const config = await getMergedLauncherConfig(projectSlug);
  latestMergedConfigs.set(projectSlug, { config, savedAt: Date.now() });
  return config;
}

export async function saveColumnDefaultsAndReturnConfig(
  projectSlug: string,
  column: string,
  patch: Partial<LauncherColumnDefaults>,
) {
  const normalizedPatch: Parameters<typeof saveColumnDefaults>[2] = { ...patch };
  if (Object.hasOwn(patch, "editedPrompt")) {
    normalizedPatch.editedPrompt = patch.editedPrompt ?? null;
  }
  const result = await saveColumnDefaults(projectSlug, column, normalizedPatch);
  if (result.ok) latestMergedConfigs.set(projectSlug, { config: result.config, savedAt: Date.now() });
  return result;
}

export async function saveColumnDefaults(
  projectSlug: string, column: string,
  patch: {
    templateName?: string | null;
    checkedSkills?: string[];
    profileName?: string | null;
    lastLayer?: "editor" | "launcher" | "shortcuts";
    skillOrder?: string[];
    editedPrompt?: string | null;
  },
) {
  "use server";
  try {
    const { editedPrompt, ...rest } = patch;
    const normalizedPatch: Partial<LauncherColumnDefaults> = { ...rest };
    if (Object.hasOwn(patch, "editedPrompt")) {
      normalizedPatch.editedPrompt = editedPrompt ?? undefined;
    }
    launcherConfigManager.saveColumnDefaults(projectSlug, column, normalizedPatch);
    return { ok: true as const, config: buildMergedLauncherConfig(projectSlug) };
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

export async function saveBranchPrefix(projectSlug: string, branchPrefix: string | null) {
  "use server";
  try {
    const value = branchPrefix?.trim() || undefined;
    launcherConfigManager.saveBranchPrefix(projectSlug, value);
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

type Scope = "app" | "project";

interface ItemFields {
  name: string;
  text?: string;
  command?: string;
}

const ITEM_METHODS = {
  template: { add: "addTemplate", update: "updateTemplate", remove: "removeTemplate" },
  skill:    { add: "addSkill",    update: "updateSkill",    remove: "removeSkill" },
  profile:  { add: "addProfile",  update: "updateProfile",  remove: "removeProfile" },
  shortcut: { add: "addShortcut", update: "updateShortcut", remove: "removeShortcut" },
} satisfies Record<LauncherItemType, { add: string; update: string; remove: string }>;

function callItemMethod(
  methodName: string, scope: Scope, projectSlug: string, ...args: unknown[]
) {
  (launcherConfigManager as any)[methodName](scope, projectSlug, ...args);
}

export const addItem = action(async function addItem(input: {
  projectSlug: string;
  itemType: LauncherItemType;
  scope: Scope;
  fields: ItemFields;
}) {
  "use server";
  try {
    callItemMethod(
      ITEM_METHODS[input.itemType].add,
      input.scope,
      input.projectSlug,
      input.fields,
    );
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}, "launcher-add-item");

export const updateItem = action(async function updateItem(input: {
  projectSlug: string;
  itemType: LauncherItemType;
  scope: Scope;
  oldName: string;
  fields: ItemFields;
}) {
  "use server";
  try {
    callItemMethod(
      ITEM_METHODS[input.itemType].update,
      input.scope,
      input.projectSlug,
      input.oldName,
      input.fields,
    );
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}, "launcher-update-item");

export const deleteItem = action(async function deleteItem(input: {
  projectSlug: string;
  itemType: LauncherItemType;
  scope: Scope;
  name: string;
}) {
  "use server";
  try {
    callItemMethod(
      ITEM_METHODS[input.itemType].remove,
      input.scope,
      input.projectSlug,
      input.name,
    );
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}, "launcher-delete-item");

export async function reorderItem(
  projectSlug: string, itemType: LauncherItemType, scope: Scope,
  name: string, order: number,
) {
  "use server";
  try {
    launcherConfigManager.setItemOrder(scope, projectSlug, itemType, name, order);
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
      agentDisplayName: "Resolve Conflicts",
      herdrWorkspaceLabel: projectSlug,
      herdrPaneLabel: `${projectSlug}--__resolve-conflicts__`,
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
    worktreeRevisions.bump(worktreeDir);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}
