import { spawn, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  worktreeManager, projectRegistry, launcherConfigManager, agentWorktreeManager,
} from "~/server/config/instances.js";
import { TicketStore } from "~/server/ticket/ticket-store.js";
import { ProcessError } from "~/server/shared/errors.js";
import { assemblePrompt, interpolatePrompt, splitCommand } from "~/server/launcher/prompt-interpolation.js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import type { ProjectInfo } from "~/server/project/project-registry.js";
import type { LauncherProfile } from "~/server/launcher/launcher-config.js";

const TITLE_SUFFIX = " -- AI";
const FALLBACK_PROMPT = "Current ticket files are in {{ticketDir}}. Read the files there for context.";
const SPAWN_DETACH_DELAY_MS = 10000;

export async function spawnDetached(executable: string, args: string[], cwd: string): Promise<void> {
  const fullCommand = `${executable} ${args.map(a => a.includes(" ") ? `"${a}"` : a).join(" ")}`;
  const label = `${executable} ${args.map(a => a.length > 60 ? a.slice(0, 60) + "..." : a).join(" ")}`;
  console.log(`spawn: ${label} (cwd: ${cwd})`);

  const child = spawn(executable, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.resume();
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(new ProcessError(fullCommand, undefined, err.message, err.message));
    });

    child.on("exit", (code) => {
      console.log(`exit ${code}: ${label}`);
      if (stderr.trim()) console.error(`stderr: ${stderr.trim()}`);
      if (settled) return;
      settled = true;
      if (code !== 0 && code !== null) {
        reject(new ProcessError(
          fullCommand, code, stderr.trim() || `Process exited with code ${code}`, `Failed (exit ${code})`,
        ));
      } else if (code === null) {
        reject(new ProcessError(
          fullCommand, undefined,
          stderr.trim() || "Process terminated abnormally", "Process terminated abnormally",
        ));
      } else {
        resolve();
      }
    });

    child.on("spawn", () => {
      child.unref();
      setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve();
      }, SPAWN_DETACH_DELAY_MS);
    });
  });
}

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

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
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
  projectSlug: string, folderName: string, useWorktree: boolean, projectPath: string, force?: boolean,
): Promise<string | Response> {
  if (!useWorktree) return projectPath;
  const merged = launcherConfigManager.getMergedConfig(projectSlug);
  if (!merged.worktreeRootPath) {
    return new Response("Worktree root path is not configured", { status: 400 });
  }
  const result = await agentWorktreeManager.ensureAgentWorktree(
    projectPath, projectSlug, folderName, { skipDirtyCheck: force },
  );
  if ('dirtyWorktree' in result) {
    return Response.json(
      { dirtyWorktree: true, message: "Main branch has uncommitted changes. Launch anyway?" },
      { status: 409 }
    );
  }
  if ('behindRemote' in result) {
    return Response.json(
      { behindRemote: true, message: "Main branch is behind remote. Pull latest changes before launching?" },
      { status: 409 }
    );
  }
  return result.worktreePath;
}

export function resolveTicketAndProject(
  projectSlug: string, folderName: string,
): { ticket: TicketInfo; project: ProjectInfo; worktreeDir: string } | Response {
  const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
  const store = new TicketStore(worktreeDir);
  const ticket = store.listTickets().find(t => t.folderName === folderName);
  if (!ticket) return new Response("Ticket not found", { status: 404 });

  const project = projectRegistry.listProjects().find(p => p.projectSlug === projectSlug);
  if (!project) return new Response("Project not found", { status: 404 });

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
  const parts = splitCommand(profile.command);
  const executable = parts[0];
  const args = parts.slice(1).map(arg =>
    arg.replace(/\{\{(\w+)\}\}/g, (match, key) => commandVars[key] ?? match)
  );
  await spawnDetached(executable, args, cwd);
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
  };
  await spawnProfile(profile, commandVars, launchDir);

}
