import { withProject } from "~/server/shared/route-helpers.js";
import { ticketSyncManager } from "~/server/config/instances.js";

export const POST = withProject(async (ctx) => {
	const result = await ticketSyncManager.sync(ctx.worktreeDir);
	return Response.json(result);
});

export const DELETE = withProject(async (ctx) => {
	await ticketSyncManager.abort(ctx.worktreeDir);
	return Response.json({ success: true });
});
