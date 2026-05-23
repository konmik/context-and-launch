import type { APIEvent } from "@solidjs/start/server";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { worktreeManager, projectRegistry } from "~/server/instances.js";
import { TicketStore } from "~/server/ticket-store.js";
import { errorMessage } from "~/server/errors.js";

function escapeSendKeys(text: string): string {
  return text.replace(/([+^%~(){}[\]])/g, "{$1}");
}

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

    const ticketDir = path.resolve(worktreeDir, folderName);
    const initialPrompt = `Current ticket files are in ${ticketDir}. Read the files there for context.`;
    const sendKeysMsg = escapeSendKeys(initialPrompt).replace(/'/g, "''");

    const batPath = path.join(os.tmpdir(), `claude-run-${Date.now()}.bat`);
    fs.writeFileSync(batPath, [
      "@echo off",
      `start /b powershell -WindowStyle Hidden -Command "Start-Sleep 3; (New-Object -ComObject WScript.Shell).SendKeys('${sendKeysMsg}~')"`,
      "claude",
      `del "%~f0"`,
    ].join("\r\n") + "\r\n");

    spawn("wt", ["-d", project.path, "--", batPath], {
      detached: true,
      stdio: "ignore",
    }).unref();

    return new Response(null, { status: 200 });
  } catch (e) {
    return new Response(errorMessage(e), { status: 500 });
  }
}
