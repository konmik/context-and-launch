import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager, ticketSyncManager } from "~/server/config/instances.js";
import { errorMessage } from "~/server/shared/errors.js";

export async function POST({ params }: APIEvent) {
	try {
		const { slug } = params;
		const worktreeDir = worktreeManager.getWorktreeDir(slug);
		const result = await ticketSyncManager.sync(worktreeDir);
		return Response.json(result);
	} catch (e) {
		return Response.json({ status: "error", message: errorMessage(e) }, { status: 500 });
	}
}

export async function DELETE({ params }: APIEvent) {
	try {
		const { slug } = params;
		const worktreeDir = worktreeManager.getWorktreeDir(slug);
		await ticketSyncManager.abort(worktreeDir);
		return Response.json({ success: true });
	} catch (e) {
		return Response.json({ error: errorMessage(e) }, { status: 500 });
	}
}
