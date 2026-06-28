import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  worktreeManager, projectRegistry, launcherConfigManager, agentWorktreeManager,
} from "~/core/config/instances.js";
import { TicketStore } from "~/core/ticket/ticket-store.js";
import { NotFoundError, ValidationError } from "~/core/shared/errors.js";
import { interpolateCommand } from "~/core/launcher/prompt-interpolation.js";
import { spawnDetached } from "./spawn-detached.js";
import { isAlive } from "./process-utils.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { ProjectInfo } from "~/core/project/project-registry.js";
import type { LauncherProfile } from "~/core/launcher/launcher-config.js";

const TITLE_SUFFIX = " -- AI";

interface AgentMarker {
  pid: number;
  startSec?: number;
}

/**
 * Path to the per-ticket marker file an agent launch script writes while the
 * agent is running. Lives under the app config dir (not the worktree) so it
 * survives worktree teardown and is never committed.
 */
export function agentMarkerPath(projectSlug: string, folderName: string): string {
  return path.join(
    launcherConfigManager.getAppConfigDir(), "running", projectSlug, `${folderName}.json`,
  );
}

const MARKER_START_TOLERANCE_SEC = 5;

function processStartSec(pid: number): number | null {
  try {
    if (process.platform === "linux") {
      const raw = fs.readFileSync(`/proc/${pid}/stat`, "utf-8");
      const afterComm = raw.slice(raw.lastIndexOf(")") + 2);
      const startTicks = Number(afterComm.split(" ")[19]);
      const uptimeSec = Number(
        fs.readFileSync("/proc/uptime", "utf-8").split(" ")[0],
      );
      const bootSec = Math.floor(Date.now() / 1000 - uptimeSec);
      return bootSec + Math.floor(startTicks / 100);
    }
    if (process.platform === "darwin") {
      const out = execFileSync(
        "ps", ["-o", "lstart=", "-p", String(pid)],
        { timeout: 2000 },
      ).toString().trim();
      return Math.floor(new Date(out).getTime() / 1000);
    }
    if (process.platform === "win32") {
      const cmd =
        `(Get-Process -Id ${pid}).StartTime.ToString("o")`;
      const out = execFileSync(
        "powershell", ["-NoProfile", "-Command", cmd],
        { timeout: 5000 },
      ).toString().trim();
      return Math.floor(new Date(out).getTime() / 1000);
    }
    return null;
  } catch {
    return null;
  }
}

function reapMarker(markerPath: string): void {
  try {
    fs.rmSync(markerPath, { force: true });
  } catch (e) {
    console.warn(`Failed to reap stale agent marker ${markerPath}:`, e);
  }
}

export function agentRunning(projectSlug: string, folderName: string): boolean {
  const markerPath = agentMarkerPath(projectSlug, folderName);
  let marker: AgentMarker;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, "utf-8"));
  } catch {
    return false;
  }
  if (typeof marker.pid !== "number") return false;
  if (!isAlive(marker.pid)) {
    reapMarker(markerPath);
    return false;
  }
  if (typeof marker.startSec === "number") {
    const osSec = processStartSec(marker.pid);
    if (osSec !== null
      && Math.abs(osSec - marker.startSec) > MARKER_START_TOLERANCE_SEC) {
      reapMarker(markerPath);
      return false;
    }
  }
  return true;
}

export type ResolveLaunchDirResult =
  | { ok: true; launchDir: string }
  | { ok: false; type: "dirtyWorktree"; message: string }
  | { ok: false; type: "behindRemote"; message: string };

export async function resolveLaunchDir(
  projectSlug: string, folderName: string, useWorktree: boolean, projectPath: string,
  opts?: { skipDirtyCheck?: boolean; skipBehindRemote?: boolean },
  mainBranch?: string,
): Promise<ResolveLaunchDirResult> {
  if (!useWorktree) return { ok: true, launchDir: projectPath };
  const result = await agentWorktreeManager.ensureAgentWorktree(
    projectPath, projectSlug, folderName, { skipDirtyCheck: opts?.skipDirtyCheck }, mainBranch,
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
  return { ok: true, launchDir: result.worktreePath };
}

export function resolveTicketAndProject(
  projectSlug: string, folderName: string,
): { ticket: TicketInfo; project: ProjectInfo; worktreeDir: string } {
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

export function buildWindowTitle(ticket: TicketInfo): string {
  return ticket.title + TITLE_SUFFIX;
}

/**
 * Parse a profile command, interpolate variables, spawn the process, and
 * detach after a short delay. Rejects if the process fails to spawn or
 * exits with a non-zero code before the detach timeout.
 */
export async function spawnProfile(
  profile: LauncherProfile,
  commandVars: Record<string, string>,
  cwd: string,
): Promise<void> {
  const parts = interpolateCommand(profile.command, commandVars);
  await spawnDetached(parts[0], parts.slice(1), cwd);
}

export async function launchAgent(
  projectSlug: string,
  ticket: TicketInfo,
  launchRequest: LaunchRequest,
  launchDir: string,
): Promise<void> {
  const merged = launcherConfigManager.getMergedConfig(projectSlug);
  const windowTitle = buildWindowTitle(ticket);

  const profile =
    merged.profiles.find(p => p.name === launchRequest.profileName)
    ?? merged.profiles[0];

  if (!profile || !profile.command.trim()) {
    throw new Error("No valid profile configured for launch");
  }

  const commandVars: Record<string, string> = {
    initialPrompt: launchRequest.initialPrompt, windowTitle,
    markerPath: agentMarkerPath(projectSlug, ticket.folderName),
    appConfigDir: launcherConfigManager.getAppConfigDir(),
    configDefaultsDir: launcherConfigManager.getConfigDefaultsDir(),
  };
  await spawnProfile(profile, commandVars, launchDir);
}
