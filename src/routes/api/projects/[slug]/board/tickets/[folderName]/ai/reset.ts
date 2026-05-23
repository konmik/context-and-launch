import type { APIEvent } from "@solidjs/start/server";
import { sessionManager, worktreeManager } from "~/server/instances.js";
import { TicketStore } from "~/server/ticket-store.js";
import { errorMessage } from "~/server/errors.js";

export async function POST({ params }: APIEvent) {
	try {
		const { slug, folderName } = params;
		if (sessionManager.isRunning(slug, folderName)) {
			return new Response("Cannot reset while running", { status: 409 });
		}
		const worktreeDir = worktreeManager.getWorktreeDir(slug);
		const store = new TicketStore(worktreeDir);
		store.updateSessionId(folderName, null);
		sessionManager.clearHistory(slug, folderName);
		return new Response(null, { status: 204 });
	} catch (e) {
		return new Response(errorMessage(e), { status: 500 });
	}
}
