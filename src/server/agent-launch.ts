import { spawn, execFile } from "child_process";
import path from "path";
import { worktreeManager, projectRegistry, launcherConfigManager } from "~/server/instances.js";
import { TicketStore } from "~/server/ticket-store.js";
import { ProcessError } from "~/server/errors.js";
import { assemblePrompt, interpolatePrompt } from "~/server/prompt-interpolation.js";
import type { TicketInfo, ProjectInfo } from "~/types.js";

const TITLE_SUFFIX = " -- AI";
const FALLBACK_PROMPT = "Current ticket files are in {{ticketDir}}. Read the files there for context.";

export function escapeSendKeys(text: string): string {
  return text.replace(/([+^%~(){}[\]])/g, "{$1}");
}

function escapeTitle(title: string): string {
  return title.replace(/'/g, "''");
}

export interface SendKeysHandle {
  cancel: () => void;
}

export function trySendKeys(windowTitle: string, keys: string, retriesLeft = 20): SendKeysHandle {
  let cancelled = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const script = [
    `$ws = New-Object -ComObject WScript.Shell`,
    `if (-not $ws.AppActivate('${escapeTitle(windowTitle)}')) { exit 1 }`,
    `Start-Sleep 1`,
    `[void]$ws.AppActivate('${escapeTitle(windowTitle)}')`,
    `$ws.SendKeys('${keys}~')`,
  ].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");

  execFile("powershell", ["-NoProfile", "-EncodedCommand", encoded], { windowsHide: true }, (err) => {
    if (cancelled) return;
    if (err && retriesLeft > 0) {
      timerId = setTimeout(() => {
        if (cancelled) return;
        const inner = trySendKeys(windowTitle, keys, retriesLeft - 1);
        const origCancel = handle.cancel;
        handle.cancel = () => { origCancel(); inner.cancel(); };
      }, 500);
    } else if (err) {
      console.warn(`trySendKeys: failed after all retries for window "${windowTitle}"`);
    }
  });

  const handle: SendKeysHandle = {
    cancel: () => {
      cancelled = true;
      if (timerId !== null) clearTimeout(timerId);
    },
  };
  return handle;
}

export function windowExists(title: string): Promise<boolean> {
  const script = `$ws = New-Object -ComObject WScript.Shell; if ($ws.AppActivate('${escapeTitle(title)}')) { exit 0 } else { exit 1 }`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolve) => {
    execFile("powershell", ["-NoProfile", "-EncodedCommand", encoded], { windowsHide: true }, (err) => {
      resolve(!err);
    });
  });
}

export function resolveTicketAndProject(slug: string, folderName: string): { ticket: TicketInfo; project: ProjectInfo; worktreeDir: string } | Response {
  const worktreeDir = worktreeManager.getWorktreeDir(slug);
  const store = new TicketStore(worktreeDir);
  const ticket = store.listTickets().find(t => t.folderName === folderName);
  if (!ticket) return new Response("Ticket not found", { status: 404 });

  const project = projectRegistry.listProjects().find(p => p.slug === slug);
  if (!project) return new Response("Project not found", { status: 404 });

  return { ticket, project, worktreeDir };
}

export interface LaunchRequest {
  templateName: string;
  checkedSkills: string[];
  useWorktree: boolean;
  profileName: string;
}

export function parseLaunchRequest(body: unknown): LaunchRequest {
  const result: LaunchRequest = { templateName: "Default", checkedSkills: [], useWorktree: false, profileName: "" };
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.templateName === "string") result.templateName = b.templateName;
    if (Array.isArray(b.checkedSkills)) result.checkedSkills = b.checkedSkills;
    if (typeof b.useWorktree === "boolean") result.useWorktree = b.useWorktree;
    if (typeof b.profileName === "string") result.profileName = b.profileName;
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

export async function launchAgent(
  slug: string,
  ticket: TicketInfo,
  project: ProjectInfo,
  worktreeDir: string,
  launchRequest: LaunchRequest,
  launchDir: string,
): Promise<void> {
  const merged = launcherConfigManager.getMergedConfig(slug);
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
    projectSlug: slug,
  };

  const initialPrompt = interpolatePrompt(assembled, variables);
  const windowTitle = buildWindowTitle(ticket);

  const profile =
    merged.profiles.find(p => p.name === launchRequest.profileName)
    ?? merged.profiles[0];

  if (!profile || !profile.command.trim()) {
    throw new Error("No valid profile configured for launch");
  }

  const commandVars: Record<string, string> = { initialPrompt, windowTitle, appConfigDir: launcherConfigManager.getAppConfigDir() };
  const parts = profile.command.split(/\s+/);
  const executable = parts[0];
  const args = parts.slice(1).map(arg =>
    arg.replace(/\{\{(\w+)\}\}/g, (match, key) => commandVars[key] ?? match)
  );

  const fullCommand = `${executable} ${args.map(a => a.includes(" ") ? `"${a}"` : a).join(" ")}`;
  const label = `${executable} ${args.map(a => a.length > 60 ? a.slice(0, 60) + "..." : a).join(" ")}`;
  console.log(`spawn: ${label} (cwd: ${launchDir})`);
  const child = spawn(executable, args, {
    cwd: launchDir,
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
      reject(err);
    });

    child.on("exit", (code) => {
      console.log(`exit ${code}: ${label}`);
      if (stderr.trim()) console.error(`stderr: ${stderr.trim()}`);
      if (settled) return;
      settled = true;
      if (code !== 0 && code !== null) {
        reject(new ProcessError(fullCommand, code, stderr.trim() || `Process exited with code ${code}`, `Failed to launch agent (exit ${code})`));
      } else {
        resolve();
      }
    });

    child.on("spawn", () => {
      setTimeout(() => {
        if (settled) return;
        settled = true;
        child.unref();
        resolve();
      }, 3000);
    });
  });

  try {
    launcherConfigManager.saveColumnDefaults(slug, ticket.status, {
      templateName: launchRequest.templateName,
      checkedSkills: launchRequest.checkedSkills,
      profileName: launchRequest.profileName,
    });
  } catch (saveErr) {
    console.warn("Failed to save launch defaults:", saveErr);
  }
}
