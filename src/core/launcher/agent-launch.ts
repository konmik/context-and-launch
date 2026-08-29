import {
  worktreeManager, projectRegistry, launcherConfigManager, agentWorktreeManager,
  commandTemplateService,
} from "~/core/config/instances.js";
import { toSavedWorktreeInfo } from "~/core/worktree/agent-worktree.js";
import { TicketStore } from "~/core/ticket/ticket-store.js";
import { NotFoundError } from "~/core/shared/errors.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { ProjectInfo } from "~/core/project/project-registry.js";
import type { LauncherProfile } from "~/core/launcher/launcher-config.js";
import {
  agentMarkerPathIn, buildAgentDisplayName, buildWindowTitle,
  isProfileAgentRunning, projectWindowTitle, runLauncherProfile,
} from "./profile-launch.js";
import { PROJECT_LAUNCH_KEY } from "./launch-keys.js";

export { PROJECT_LAUNCH_KEY };
export { buildWindowTitle };

/**
 * Path to the per-ticket marker file an agent launch script writes while the
 * agent is running. Lives under the app config dir (not the worktree) so it
 * survives worktree teardown and is never committed.
 */
export function agentMarkerPath(projectSlug: string, folderName: string): string {
  return agentMarkerPathIn(
    launcherConfigManager.getAppConfigDir(), projectSlug, folderName,
  );
}

export function agentRunning(projectSlug: string, folderName: string): boolean {
  return isProfileAgentRunning(
    commandTemplateService, agentMarkerPath(projectSlug, folderName),
  );
}

export type ResolveLaunchDirResult =
  | { ok: true; launchDir: string }
  | { ok: false; type: "dirtyWorktree"; message: string }
  | { ok: false; type: "behindRemote"; message: string };

export async function ensureLaunchDir(
  projectSlug: string, folderName: string, useWorktree: boolean, projectPath: string,
  ticket: { agentWorktreeBranchName?: string; agentWorktreeDir?: string },
  worktreeDir: string,
  opts?: { skipDirtyCheck?: boolean; skipBehindRemote?: boolean },
  mainBranch?: string,
): Promise<ResolveLaunchDirResult> {
  if (!useWorktree) return { ok: true, launchDir: projectPath };
  const savedInfo = toSavedWorktreeInfo(ticket);
  const result = await agentWorktreeManager.ensureAgentWorktree(
    projectPath, projectSlug, folderName, { skipDirtyCheck: opts?.skipDirtyCheck },
    mainBranch, savedInfo,
  );
  if ('dirtyWorktree' in result) {
    return {
      ok: false, type: "dirtyWorktree",
      message: "Main branch has uncommitted changes. Launch anyway?",
    };
  }
  if (result.behindRemote && !opts?.skipBehindRemote) {
    return {
      ok: false, type: "behindRemote",
      message: "Main branch is behind remote. Proceed with the worktree anyway?",
    };
  }
  if (!ticket.agentWorktreeBranchName) {
    new TicketStore(worktreeDir).saveAgentWorktreeInfo(
      folderName, result.branchName, result.worktreePath,
    );
  }
  return { ok: true, launchDir: result.worktreePath };
}

export function resolveTicketAndProject(
  projectSlug: string, folderName: string,
) {
  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
  const store = new TicketStore(worktreeDir);
  const ticket = store.getTicket(folderName);
  if (!ticket) throw new NotFoundError(`Ticket not found: ${folderName}`);

  const project = projectRegistry.listProjects().find(p => p.projectSlug === projectSlug);
  if (!project) throw new NotFoundError(`Project not found: ${projectSlug}`);

  return { ticket, project, worktreeDir };
}

export interface LaunchRequest {
  initialPrompt: string;
  useWorktree: boolean;
  profileName: string;
  force: boolean;
  skipBehindRemote: boolean;
  launchDir: string;
}

export function parseLaunchRequest(body: unknown): LaunchRequest {
  const result: LaunchRequest = {
    initialPrompt: "", useWorktree: false, profileName: "", force: false,
    skipBehindRemote: false, launchDir: "",
  };
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.initialPrompt === "string") result.initialPrompt = b.initialPrompt;
    if (typeof b.useWorktree === "boolean") result.useWorktree = b.useWorktree;
    if (typeof b.profileName === "string") result.profileName = b.profileName;
    if (typeof b.force === "boolean") result.force = b.force;
    if (typeof b.skipBehindRemote === "boolean") result.skipBehindRemote = b.skipBehindRemote;
    if (typeof b.launchDir === "string") result.launchDir = b.launchDir;
  }
  return result;
}

export async function readLaunchRequest(request: Request): Promise<LaunchRequest> {
  let body: unknown;
  try {
    body = await request.json();
  } catch (e) {
    console.warn("Failed to parse request body, using defaults:", e);
  }
  return parseLaunchRequest(body);
}

export async function spawnProfile(
  profile: LauncherProfile,
  commandVars: Record<string, string>,
  cwd: string,
): Promise<void> {
  await runLauncherProfile(commandTemplateService, profile, commandVars, cwd);
}

async function spawnAgent(
  projectSlug: string,
  markerKey: string,
  windowTitle: string,
  agentDisplayName: string,
  launchRequest: LaunchRequest,
  launchDir: string,
): Promise<void> {
  const merged = launcherConfigManager.getMergedConfig(projectSlug);

  const profile =
    merged.profiles.find(p => p.name === launchRequest.profileName)
    ?? merged.profiles[0];

  if (!profile || !profile.command.trim()) {
    throw new Error("No valid profile configured for launch");
  }

  const commandVars = {
    initialPrompt: launchRequest.initialPrompt, windowTitle, agentDisplayName,
    herdrWorkspaceLabel: projectSlug,
    herdrPaneLabel: `${projectSlug}--${markerKey}`,
    markerPath: agentMarkerPath(projectSlug, markerKey),
    appConfigDir: launcherConfigManager.getAppConfigDir(),
    configDefaultsDir: launcherConfigManager.getConfigDefaultsDir(),
  } satisfies Record<string, string>;
  await spawnProfile(profile, commandVars, launchDir);
}

export async function launchAgent(
  projectSlug: string,
  ticket: TicketInfo,
  launchRequest: LaunchRequest,
  launchDir: string,
): Promise<void> {
	const context = launchRequest.useWorktree
		? { worktreePath: launchDir }
		: { projectName: projectRegistry.getName(projectSlug) };
	const agentDisplayName = buildAgentDisplayName(ticket, context);
	const windowTitle = buildWindowTitle(ticket, context);
  await spawnAgent(
    projectSlug, ticket.folderName, windowTitle, agentDisplayName, launchRequest, launchDir,
  );
}

export async function launchProjectAgent(
  projectSlug: string,
  projectName: string,
  launchRequest: LaunchRequest,
  launchDir: string,
): Promise<void> {
  await spawnAgent(
    projectSlug, PROJECT_LAUNCH_KEY, projectWindowTitle(projectName), projectName,
    launchRequest, launchDir,
  );
}
