import type { APIEvent } from "@solidjs/start/server";
import { spawn } from "child_process";
import path from "path";
import { worktreeManager, projectRegistry } from "~/server/instances.js";
import { TicketStore } from "~/server/ticket-store.js";
import { errorMessage } from "~/server/errors.js";

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

    spawn("wt", ["-d", project.path, "claude", initialPrompt], {
      detached: true,
      stdio: "ignore",
    }).unref();

    return new Response(null, { status: 200 });
  } catch (e) {
    return new Response(errorMessage(e), { status: 500 });
  }
}
