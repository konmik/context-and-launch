import type { APIEvent } from "@solidjs/start/server";
import { sessionManager, worktreeManager } from "~/server/instances.js";
import { TicketStore } from "~/server/ticket-store.js";
import { errorMessage } from "~/server/errors.js";

export async function GET({ params }: APIEvent) {
	try {
		const { slug, folderName } = params;
		const running = sessionManager.isRunning(slug, folderName);
		const worktreeDir = worktreeManager.getWorktreeDir(slug);
		const store = new TicketStore(worktreeDir);
		const tickets = store.listTickets();
		const ticket = tickets.find(t => t.folderName === folderName);
		const sessionId = ticket?.sessionId ?? null;
		return Response.json({ running, sessionId });
	} catch (e) {
		return new Response(errorMessage(e), { status: 500 });
	}
}
