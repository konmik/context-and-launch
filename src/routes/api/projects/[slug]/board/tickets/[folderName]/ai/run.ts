import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager, sessionManager, projectRegistry } from "~/server/instances.js";
import { TicketStore } from "~/server/ticket-store.js";
import { errorMessage } from "~/server/errors.js";

export async function POST({ params, request }: APIEvent) {
	try {
		const { slug, folderName } = params;

		let message: string | undefined;
		try {
			const body = await request.json();
			if (body?.message && typeof body.message === "string") {
				message = body.message;
			}
		} catch { /* no body or invalid json */ }

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

		const existingSessionId = ticket.sessionId ?? null;
		const result = sessionManager.startOrResume(
			project.path, slug, folderName, worktreeDir, existingSessionId, ticket.number, message
		);

		if (!existingSessionId) {
			store.updateSessionId(folderName, result.sessionId);
		}

		return Response.json({ sessionId: result.sessionId, running: true });
	} catch (e) {
		return new Response(errorMessage(e), { status: 500 });
	}
}
