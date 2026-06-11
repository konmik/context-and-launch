import { withProject } from "~/server/shared/route-helpers.js";
import { projectRegistry, syncPendingTracker } from "~/server/config/instances.js";

export const GET = withProject(async (ctx) => {
	if (!projectRegistry.hasProject(ctx.projectSlug)) {
		return Response.json({ error: `Unknown project: ${ctx.projectSlug}` }, { status: 404 });
	}
	return Response.json({ hasPendingChanges: syncPendingTracker.hasPendingChanges(ctx.worktreeDir) });
});
