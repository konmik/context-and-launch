import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  worktreeManager, projectRegistry, launcherConfigManager, agentWorktreeManager,
} from "~/server/config/instances.js";
import { TicketStore } from "~/server/ticket/ticket-store.js";
import { NotFoundError, ValidationError, PayloadError } from "~/server/shared/errors.js";
import { assemblePrompt, interpolatePrompt, interpolateCommand } from "~/server/launcher/prompt-interpolation.js";
import { spawnDetached } from "./spawn-detached.js";
import { isAlive } from "./process-utils.js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import type { ProjectInfo } from "~/server/project/project-registry.js";
import type { LauncherProfile } from "~/server/launcher/launcher-config.js";

const TITLE_SUFFIX = " -- AI";
const FALLBACK_PROMPT = "Current ticket files are in {{ticketDir}}. Read the files there for context.";

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

export async function resolveLaunchDir(
  projectSlug: string, folderName: string, useWorktree: boolean, projectPath: string,
  force?: boolean, mainBranch?: string,
): Promise<string> {
  if (!useWorktree) return projectPath;
  const merged = launcherConfigManager.getMergedConfig(projectSlug);
  if (!merged.worktreeRootPath) {
    throw new ValidationError("Worktree root path is not configured");
  }
  const result = await agentWorktreeManager.ensureAgentWorktree(
    projectPath, projectSlug, folderName, { skipDirtyCheck: force }, mainBranch,
  );
  if ('dirtyWorktree' in result) {
    throw new PayloadError(
      "Main branch has uncommitted changes. Launch anyway?", 409,
      { dirtyWorktree: true, message: "Main branch has uncommitted changes. Launch anyway?" },
    );
  }
  if ('behindRemote' in result) {
    throw new PayloadError(
      "Main branch is behind remote. Pull latest changes before launching?", 409,
      { behindRemote: true, message: "Main branch is behind remote. Pull latest changes before launching?" },
    );
  }
  return result.worktreePath;
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
  templateName: string;
  checkedSkills: string[];
  useWorktree: boolean;
  profileName: string;
  force: boolean;
}

export function parseLaunchRequest(body: unknown): LaunchRequest {
  const result: LaunchRequest = {
    templateName: "Default", checkedSkills: [], useWorktree: false, profileName: "", force: false,
  };
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.templateName === "string") result.templateName = b.templateName;
    if (Array.isArray(b.checkedSkills)) result.checkedSkills = b.checkedSkills;
    if (typeof b.useWorktree === "boolean") result.useWorktree = b.useWorktree;
    if (typeof b.profileName === "string") result.profileName = b.profileName;
    if (typeof b.force === "boolean") result.force = b.force;
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
  project: ProjectInfo,
  worktreeDir: string,
  launchRequest: LaunchRequest,
  launchDir: string,
): Promise<void> {
  const merged = launcherConfigManager.getMergedConfig(projectSlug);
  const templateText =
    merged.templates.find(t => t.name === launchRequest.templateName)?.text
    ?? merged.templates.find(t => t.name === "Default")?.text
    ?? FALLBACK_PROMPT;

  const skillTexts = launchRequest.checkedSkills
    .map(name => merged.skills.find(s => s.name === name))
    .filter((s): s is NonNullable<typeof s> => s != null)
    .map(s => s.text);

  const assembled = assemblePrompt(templateText, skillTexts);
  const ticketDir = path.resolve(worktreeDir, ticket.folderName);
  const variables: Record<string, string> = {
    ticketDir,
    ticketSlug: ticket.folderName,
    ticketTitle: ticket.title,
    ticketNumber: ticket.number,
    ticketStatus: ticket.status,
    projectPath: project.path,
    projectSlug,
  };

  const initialPrompt = interpolatePrompt(assembled, variables);
  const windowTitle = buildWindowTitle(ticket);

  const profile =
    merged.profiles.find(p => p.name === launchRequest.profileName)
    ?? merged.profiles[0];

  if (!profile || !profile.command.trim()) {
    throw new Error("No valid profile configured for launch");
  }

  const commandVars: Record<string, string> = {
    initialPrompt, windowTitle,
    markerPath: agentMarkerPath(projectSlug, ticket.folderName),
    appConfigDir: launcherConfigManager.getAppConfigDir(),
    configDefaultsDir: launcherConfigManager.getConfigDefaultsDir(),
  };
  await spawnProfile(profile, commandVars, launchDir);

}
