import { spawn, execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { worktreeManager, projectRegistry, launcherConfigManager } from "~/server/instances.js";
import { TicketStore } from "~/server/ticket-store.js";
import { escapeBatchTitle } from "~/server/batch-escape.js";
import { assemblePrompt, interpolatePrompt } from "~/server/prompt-interpolation.js";
import type { TicketInfo, ProjectInfo } from "~/types.js";

const TITLE_SUFFIX = " — AI";
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
}

export function parseLaunchRequest(body: unknown): LaunchRequest {
  const result: LaunchRequest = { templateName: "Default", checkedSkills: [], useWorktree: false };
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.templateName === "string") result.templateName = b.templateName;
    if (Array.isArray(b.checkedSkills)) result.checkedSkills = b.checkedSkills;
    if (typeof b.useWorktree === "boolean") result.useWorktree = b.useWorktree;
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

export function launchAgent(
  slug: string,
  ticket: TicketInfo,
  project: ProjectInfo,
  worktreeDir: string,
  launchRequest: LaunchRequest,
  launchDir: string,
): void {
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
    ticketTitle: ticket.title,
    ticketNumber: ticket.number,
    ticketStatus: ticket.status,
    projectPath: project.path,
    projectSlug: slug,
  };

  const initialPrompt = interpolatePrompt(assembled, variables);
  const escapedPrompt = escapeSendKeys(initialPrompt).replace(/'/g, "''");
  const windowTitle = buildWindowTitle(ticket);

  const batPath = path.join(os.tmpdir(), `claude-run-${Date.now()}.bat`);
  fs.writeFileSync(batPath, [
    "@echo off",
    `title ${escapeBatchTitle(windowTitle)}`,
    "claude --dangerously-skip-permissions",
    `del "%~f0"`,
  ].join("\r\n") + "\r\n");

  spawn("wt", ["-d", launchDir, "--title", windowTitle, "--suppressApplicationTitle", "--", batPath], {
    detached: true,
    stdio: "ignore",
  }).unref();

  const sendKeysHandle = trySendKeys(windowTitle, escapedPrompt);
  void sendKeysHandle;

  try {
    launcherConfigManager.saveColumnDefaults(slug, ticket.status, {
      templateName: launchRequest.templateName,
      checkedSkills: launchRequest.checkedSkills,
    });
  } catch (saveErr) {
    console.warn("Failed to save launch defaults:", saveErr);
  }
}
