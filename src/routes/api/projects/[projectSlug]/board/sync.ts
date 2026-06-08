import { withProject } from "~/server/shared/route-helpers.js";
import { ticketSyncManager, operationTracker } from "~/server/config/instances.js";

export const POST = withProject(async (ctx) => {
	const result = await operationTracker.track(ticketSyncManager.sync(ctx.worktreeDir));
	return Response.json(result);
});

export const DELETE = withProject(async (ctx) => {
	await operationTracker.track(ticketSyncManager.abort(ctx.worktreeDir));
	return Response.json({ success: true });
});
