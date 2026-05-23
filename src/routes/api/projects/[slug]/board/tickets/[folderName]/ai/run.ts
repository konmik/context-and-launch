import type { APIEvent } from "@solidjs/start/server";
import { spawn, execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { worktreeManager, projectRegistry } from "~/server/instances.js";
import { TicketStore } from "~/server/ticket-store.js";
import { errorMessage } from "~/server/errors.js";

function escapeSendKeys(text: string): string {
  return text.replace(/([+^%~(){}[\]])/g, "{$1}");
}

function escapeTitle(title: string): string {
  return title.replace(/'/g, "''");
}

function windowExists(title: string): Promise<boolean> {
  const script = `$ws = New-Object -ComObject WScript.Shell; if ($ws.AppActivate('${escapeTitle(title)}')) { exit 0 } else { exit 1 }`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolve) => {
    execFile("powershell", ["-NoProfile", "-EncodedCommand", encoded], { windowsHide: true }, (err) => {
      resolve(!err);
    });
  });
}

function trySendKeys(windowTitle: string, keys: string, retriesLeft = 20) {
  const script = [
    `$ws = New-Object -ComObject WScript.Shell`,
    `if (-not $ws.AppActivate('${escapeTitle(windowTitle)}')) { exit 1 }`,
    `Start-Sleep 1`,
    `[void]$ws.AppActivate('${escapeTitle(windowTitle)}')`,
    `$ws.SendKeys('${keys}~')`,
  ].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");

  execFile("powershell", ["-NoProfile", "-EncodedCommand", encoded], { windowsHide: true }, (err) => {
    if (err && retriesLeft > 0) {
      setTimeout(() => trySendKeys(windowTitle, keys, retriesLeft - 1), 500);
    }
  });
}

const TITLE_SUFFIX = " — AI";

export async function POST({ params }: APIEvent) {
  try {
    const { slug, folderName } = params;

    const worktreeDir = worktreeManager.getWorktreeDir(slug);
    const store = new TicketStore(worktreeDir);
    const tickets = store.listTickets();
    const ticket = tickets.find(t => t.folderName === folderName);
    if (!ticket) {
      return new Response("Ticket not found", { status: 404 });
    }

    const projects = projectRegistry.listProjects();
    const project = projects.find(p => p.slug === slug);
    if (!project) {
      return new Response("Project not found", { status: 404 });
    }

    const windowTitle = ticket.title + TITLE_SUFFIX;

    if (await windowExists(windowTitle)) {
      return new Response("Already started", { status: 409 });
    }

    const ticketDir = path.resolve(worktreeDir, folderName);
    const initialPrompt = `Current ticket files are in ${ticketDir}. Read the files there for context.`;
    const sendKeysMsg = escapeSendKeys(initialPrompt).replace(/'/g, "''");

    const batPath = path.join(os.tmpdir(), `claude-run-${Date.now()}.bat`);
    fs.writeFileSync(batPath, [
      "@echo off",
      `title ${windowTitle}`,
      "claude --dangerously-skip-permissions",
      `del "%~f0"`,
    ].join("\r\n") + "\r\n");

    spawn("wt", ["-d", project.path, "--title", windowTitle, "--suppressApplicationTitle", "--", batPath], {
      detached: true,
      stdio: "ignore",
    }).unref();

    trySendKeys(windowTitle, sendKeysMsg);

    return new Response(null, { status: 200 });
  } catch (e) {
    return new Response(errorMessage(e), { status: 500 });
  }
}
