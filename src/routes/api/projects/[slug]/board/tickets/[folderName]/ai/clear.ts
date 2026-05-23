import type { APIEvent } from "@solidjs/start/server";
import { sessionManager, worktreeManager } from "~/server/instances.js";
import { TicketStore } from "~/server/ticket-store.js";
import { errorMessage } from "~/server/errors.js";
import { projectRegistry } from "~/server/instances.js";

export async function POST({ params }: APIEvent) {
	try {
		const { slug, folderName } = params;
		if (sessionManager.isRunning(slug, folderName)) {
			return new Response("Cannot clear while running", { status: 409 });
		}

		const worktreeDir = worktreeManager.getWorktreeDir(slug);
		const store = new TicketStore(worktreeDir);
		const tickets = store.listTickets();
		const ticket = tickets.find(t => t.folderName === folderName);
		if (!ticket?.sessionId) {
			return new Response("No session to clear", { status: 400 });
		}

		const projects = projectRegistry.listProjects();
		const project = projects.find(p => p.slug === slug);
		if (!project) {
			return new Response("Project not found", { status: 404 });
		}

		const result = sessionManager.startOrResume(
			project.path, slug, folderName, worktreeDir, ticket.sessionId, ticket.number, "/clear"
		);

		return Response.json({ sessionId: result.sessionId, running: true });
	} catch (e) {
		return new Response(errorMessage(e), { status: 500 });
	}
}
